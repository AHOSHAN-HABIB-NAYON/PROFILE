import { App as CapApp } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { AppShell } from './components/AppShell';
import { Skeleton } from './components/Feedback';
import { Toasts } from './components/Toasts';
import { useAuth } from './lib/auth';
import { setNavigator } from './lib/nav';
import { isNative } from './lib/platform';
import { initNativePush } from './lib/push';
import { applyTheme, useSettings } from './lib/settings';
import { connectSocket, disconnectSocket } from './lib/socket';
import { setMusic } from './lib/sound';
import { toast } from './lib/toast';
import { useGame } from './lib/game';
import { emit } from './lib/socket';
import Home from './pages/Home';
import Welcome from './pages/Welcome';
import { Login, Register } from './pages/Auth';

const Battle = lazy(() => import('./pages/Battle'));
const Matchmaking = lazy(() => import('./pages/Matchmaking'));
const WarRoom = lazy(() => import('./pages/WarRoom'));
const Match = lazy(() => import('./pages/Match'));
const Result = lazy(() => import('./pages/Result'));
const Review = lazy(() => import('./pages/Review'));
const Friends = lazy(() => import('./pages/Friends'));
const Rank = lazy(() => import('./pages/Rank'));
const Profile = lazy(() => import('./pages/Profile'));
const PublicProfile = lazy(() => import('./pages/PublicProfile'));
const EditProfile = lazy(() => import('./pages/EditProfile'));
const Settings = lazy(() => import('./pages/Settings'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Shop = lazy(() => import('./pages/Shop'));
const Squads = lazy(() => import('./pages/Squads'));
const SquadDetail = lazy(() => import('./pages/SquadDetail'));
const History = lazy(() => import('./pages/History'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Legal = lazy(() => import('./pages/Legal'));
const AccountFlows = lazy(() => import('./pages/AccountFlows'));

function Splash() {
  return (
    <div className="splash" role="status" aria-label="Loading QUIZ WAR">
      <img src="/icons/icon-512.png" alt="" />
    </div>
  );
}

function PageFallback() {
  return (
    <div className="page">
      <Skeleton kind="card" lines={1} />
      <Skeleton lines={4} />
    </div>
  );
}

function RequireAuth({ children, allowOnboarding = false }: { children: ReactNode; allowOnboarding?: boolean }) {
  const { status, user } = useAuth();
  const loc = useLocation();
  if (status === 'loading') return <Splash />;
  if (status === 'anon') return <Navigate to={`/welcome?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (user?.needsOnboarding && !allowOnboarding) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>
        <Suspense fallback={<PageFallback />}>{children}</Suspense>
      </AppShell>
    </RequireAuth>
  );
}

function Full({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <Suspense fallback={<div className="mm-stage" role="status" aria-label="Loading"><span className="spinner" style={{ color: 'var(--primary)' }} /></div>}>{children}</Suspense>
    </RequireAuth>
  );
}

export function App() {
  const nav = useNavigate();
  const status = useAuth((s) => s.status);
  const { theme, reduceMotion, music } = useSettings();
  const loc = useLocation();

  useEffect(() => {
    setNavigator((to) => nav(to));
  }, [nav]);
  useEffect(() => void useAuth.getState().bootstrap(), []);
  useEffect(() => {
    applyTheme(theme, reduceMotion);
    if (theme !== 'system') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => applyTheme('system', reduceMotion);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [theme, reduceMotion]);

  // Ambient music only on menus, never during a battle.
  useEffect(() => {
    const inGame = /^\/(match|war-room|matchmaking)/.test(loc.pathname);
    setMusic(music && !inGame && status === 'authed');
  }, [music, loc.pathname, status]);

  useEffect(() => {
    if (status === 'authed') {
      connectSocket();
      initNativePush();
    } else if (status === 'anon') disconnectSocket();
    if (status !== 'loading' && isNative) void SplashScreen.hide().catch(() => undefined);
  }, [status]);

  // Visibility → presence "away".
  useEffect(() => {
    const on = () => void emit('presence:set' as any, { status: document.hidden ? 'away' : 'online' }, 1500).catch(() => undefined);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  // Native: deep links (https://quizwar.app/u/QW-… or quizwar://…) and the Android back button.
  useEffect(() => {
    if (!isNative) return;
    const a = CapApp.addListener('appUrlOpen', ({ url }) => {
      try {
        const u = new URL(url);
        const path = u.protocol === 'quizwar:' ? `/${u.host}${u.pathname}` : u.pathname + u.search;
        nav(path);
      } catch {
        /* ignore malformed links */
      }
    });
    const b = CapApp.addListener('backButton', ({ canGoBack }) => {
      const path = window.location.pathname;
      if (path.startsWith('/match/') && useGame.getState().snapshot?.state !== 'finished') {
        toast.info('Battle in progress', 'Use the flag button to leave the match.', '⚔️');
        return;
      }
      if (document.querySelector('dialog[open]')) return (document.querySelector('dialog[open]') as HTMLDialogElement).close();
      if (canGoBack && path !== '/') history.back();
      else void CapApp.minimizeApp();
    });
    return () => {
      void a.then((x) => x.remove());
      void b.then((x) => x.remove());
    };
  }, [nav]);

  // Service worker (web/PWA only): register, offer updates, handle push-click navigation.
  useEffect(() => {
    if (isNative || !('serviceWorker' in navigator) || import.meta.env.DEV) return;
    void import('virtual:pwa-register').then(({ registerSW }) => {
      const update = registerSW({
        onNeedRefresh() {
          toast.custom({ kind: 'info', icon: '✨', title: 'Update available', body: 'A new version of QUIZ WAR is ready.', actions: [{ label: 'Reload', primary: true, onClick: () => void update(true) }] });
        },
      });
    });
    const onMsg = (e: MessageEvent) => e.data?.type === 'NAVIGATE' && typeof e.data.url === 'string' && nav(e.data.url);
    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, [nav]);

  return (
    <>
      <Toasts />
      <Suspense fallback={<Splash />}>
        <Routes>
          <Route path="/welcome" element={status === 'authed' ? <Navigate to="/" replace /> : <Welcome />} />
          <Route path="/login" element={status === 'authed' ? <Navigate to="/" replace /> : <Login />} />
          <Route path="/register" element={status === 'authed' ? <Navigate to="/" replace /> : <Register />} />
          <Route path="/forgot-password" element={<AccountFlows kind="forgot" />} />
          <Route path="/reset-password" element={<AccountFlows kind="reset" />} />
          <Route path="/verify-email" element={<AccountFlows kind="verify" />} />
          <Route path="/legal/:doc" element={<Legal />} />
          <Route path="/u/:uid" element={status === 'authed' ? <Shell><PublicProfile /></Shell> : <Suspense fallback={<Splash />}><PublicProfile /></Suspense>} />
          <Route path="/onboarding" element={<RequireAuth allowOnboarding><Onboarding /></RequireAuth>} />

          <Route path="/" element={<Shell><Home /></Shell>} />
          <Route path="/battle" element={<Shell><Battle /></Shell>} />
          <Route path="/battle/requests" element={<Shell><Battle tab="requests" /></Shell>} />
          <Route path="/friends" element={<Shell><Friends /></Shell>} />
          <Route path="/rank" element={<Shell><Rank /></Shell>} />
          <Route path="/profile" element={<Shell><Profile /></Shell>} />
          <Route path="/profile/achievements" element={<Shell><Profile tab="achievements" /></Shell>} />
          <Route path="/profile/edit" element={<Shell><EditProfile /></Shell>} />
          <Route path="/settings" element={<Shell><Settings /></Shell>} />
          <Route path="/notifications" element={<Shell><Notifications /></Shell>} />
          <Route path="/shop" element={<Shell><Shop /></Shell>} />
          <Route path="/squads" element={<Shell><Squads /></Shell>} />
          <Route path="/squads/:id" element={<Shell><SquadDetail /></Shell>} />
          <Route path="/history" element={<Shell><History /></Shell>} />
          <Route path="/review/:id" element={<Shell><Review /></Shell>} />

          <Route path="/matchmaking" element={<Full><Matchmaking /></Full>} />
          <Route path="/war-room/:id" element={<Full><WarRoom /></Full>} />
          <Route path="/match/:id" element={<Full><Match /></Full>} />
          <Route path="/result/:id" element={<Full><Result /></Full>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}
