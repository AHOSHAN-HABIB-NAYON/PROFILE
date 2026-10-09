import { App as CapApp } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router';
import { AppShell } from './components/AppShell';
import { Empty, Skeleton } from './components/Feedback';
import { Icon } from './components/Icon';
import { NativeExtras } from './components/NativeExtras';
import { Splash } from './components/Splash';
import { Toasts } from './components/Toasts';
import { IncomingInvites } from './components/Invites';
import { useOnline } from './hooks/useOnline';
import { useAuth } from './lib/auth';
import { useGame } from './lib/game';
import { tr, useT } from './lib/i18n';
import { setNavigator } from './lib/nav';
import { isNative } from './lib/platform';
import { initNativePush } from './lib/push';
import { applyTheme, useSettings } from './lib/settings';
import { connectSocket, disconnectSocket, emit } from './lib/socket';
import { setMusic } from './lib/sound';
import { toast } from './lib/toast';
import { Login, Register } from './pages/Auth';
import Home from './pages/Home';

const Intro = lazy(() => import('./pages/Intro'));
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
const About = lazy(() => import('./pages/About'));
const AccountFlows = lazy(() => import('./pages/AccountFlows'));

function PageFallback() {
  return (
    <div className="page">
      <Skeleton kind="card" lines={1} />
      <Skeleton lines={4} />
    </div>
  );
}

function FullFallback() {
  const t = useT();
  return (
    <div className="mm-stage" role="status" aria-label={t('Loading', 'লোড হচ্ছে')}>
      <span className="spinner" style={{ color: 'var(--primary)', width: 32, height: 32 }} />
    </div>
  );
}

/** Signed in on this device but the server can't be reached: never log the player out. */
function OfflineScreen() {
  const t = useT();
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const retry = useCallback(async () => {
    setBusy(true);
    await useAuth.getState().bootstrap();
    setBusy(false);
  }, []);
  useEffect(() => {
    if (online) void retry();
  }, [online, retry]);
  return (
    <div className="offline-screen">
      <Empty
        icon="wifi-off"
        tone="danger"
        anim="pulse"
        title={online ? t('Can’t reach QUIZ WAR', 'সার্ভারে সংযোগ করা যাচ্ছে না') : t('You’re offline', 'আপনি অফলাইনে আছেন')}
        body={t('You’re still signed in. Check your internet connection — we’ll reconnect automatically.', 'আপনি লগইন অবস্থাতেই আছেন। নেট সংযোগ চালু করুন — আমরা নিজে থেকেই আবার সংযোগ করব।')}
        action={
          <button className="btn primary" onClick={() => void retry()} disabled={busy}>
            {busy ? <span className="spinner" /> : <Icon name="refresh" />} {t('Try again', 'আবার চেষ্টা করুন')}
          </button>
        }
      />
    </div>
  );
}

/** Where a signed-out visitor goes: the intro on first run, then the sign-in screen. */
function SignedOutRedirect() {
  const loc = useLocation();
  const introSeen = useSettings((s) => s.introSeen);
  const next = loc.pathname === '/' ? '' : `?next=${encodeURIComponent(loc.pathname + loc.search)}`;
  return <Navigate to={`${introSeen ? '/login' : '/intro'}${next}`} replace />;
}

function RequireAuth({ children, allowOnboarding = false }: { children: ReactNode; allowOnboarding?: boolean }) {
  const { status, user } = useAuth();
  if (status === 'loading') return null;
  if (status === 'offline') return <OfflineScreen />;
  if (status === 'anon') return <SignedOutRedirect />;
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
      <Suspense fallback={<FullFallback />}>{children}</Suspense>
    </RequireAuth>
  );
}

function Public({ children }: { children: ReactNode }) {
  return <Suspense fallback={<FullFallback />}>{children}</Suspense>;
}

function WelcomeRedirect() {
  const [p] = useSearchParams();
  const introSeen = useSettings((s) => s.introSeen);
  const next = p.get('next');
  return <Navigate to={`${introSeen ? '/login' : '/intro'}${next ? `?next=${encodeURIComponent(next)}` : ''}`} replace />;
}

const DARK_TOP = /^\/(intro|login|register|forgot-password|reset-password|verify-email|match|war-room|matchmaking)/;

export function App() {
  const nav = useNavigate();
  const status = useAuth((s) => s.status);
  const { theme, reduceMotion, music } = useSettings();
  const loc = useLocation();
  const [splash, setSplash] = useState(true);
  const lastBack = useRef(0);

  useEffect(() => {
    setNavigator((to) => nav(to));
  }, [nav]);
  useEffect(() => void useAuth.getState().bootstrap(), []);
  // The animated web splash continues the native one seamlessly.
  useEffect(() => {
    if (isNative) void SplashScreen.hide({ fadeOutDuration: 150 }).catch(() => undefined);
  }, []);
  useEffect(() => {
    applyTheme(theme, reduceMotion);
    if (theme !== 'system') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => applyTheme('system', reduceMotion);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [theme, reduceMotion]);

  // Status bar matches the screen underneath it.
  useEffect(() => {
    if (!isNative) return;
    const darkTheme = document.documentElement.dataset.theme === 'dark';
    const darkTop = splash || DARK_TOP.test(loc.pathname);
    const color = darkTop ? '#172554' : darkTheme ? '#0a0f1e' : '#f4f6fb';
    void StatusBar.setBackgroundColor({ color }).catch(() => undefined);
    void StatusBar.setStyle({ style: darkTop || darkTheme ? Style.Dark : Style.Light }).catch(() => undefined);
  }, [loc.pathname, theme, splash]);

  // Background music: menu track on menus, match track during battles.
  useEffect(() => {
    const inGame = /^\/(match|war-room|matchmaking)/.test(loc.pathname);
    setMusic(music && status === 'authed' && !splash, inGame ? 'match' : 'menu');
  }, [music, loc.pathname, status, splash]);

  useEffect(() => {
    if (status === 'authed') {
      connectSocket();
      void initNativePush();
    } else if (status === 'anon') disconnectSocket();
  }, [status]);

  // Visibility → presence "away".
  useEffect(() => {
    const on = () => void emit('presence:set' as any, { status: document.hidden ? 'away' : 'online' }, 1500).catch(() => undefined);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  // Native: deep links and the Android back button (double-press to exit from the top level).
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
      const open = document.querySelector('dialog[open]') as HTMLDialogElement | null;
      if (open) return open.dispatchEvent(new Event('cancel', { cancelable: true }));
      if (path.startsWith('/match/') && useGame.getState().snapshot?.state !== 'finished') {
        toast.info(tr('Battle in progress', 'ব্যাটল চলছে'), tr('Use the flag button to leave the match.', 'ম্যাচ ছাড়তে উপরের পতাকা বাটন চাপুন।'), 'swords');
        return;
      }
      const top = ['/', '/intro', '/login', '/onboarding'].includes(path);
      if (canGoBack && !top) return history.back();
      if (path !== '/' && !top) return nav('/', { replace: true });
      const now = Date.now();
      if (now - lastBack.current < 2000) return void CapApp.exitApp();
      lastBack.current = now;
      toast.info(tr('Press back again to exit', 'বের হতে আবার Back চাপুন'), undefined, 'door');
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
          toast.custom({
            kind: 'info',
            icon: 'sparkles',
            title: tr('Update available', 'নতুন আপডেট এসেছে'),
            body: tr('A new version of QUIZ WAR is ready.', 'QUIZ WAR-এর নতুন ভার্সন প্রস্তুত।'),
            actions: [{ label: tr('Reload', 'রিলোড করুন'), primary: true, onClick: () => void update(true) }],
          });
        },
      });
    });
    const onMsg = (e: MessageEvent) => e.data?.type === 'NAVIGATE' && typeof e.data.url === 'string' && nav(e.data.url);
    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, [nav]);

  const authed = status === 'authed';
  return (
    <>
      <Toasts />
      {splash && <Splash ready={status !== 'loading'} onDone={() => setSplash(false)} />}
      {authed && !splash && (
        <>
          <IncomingInvites />
          <NativeExtras />
        </>
      )}
      {status !== 'loading' && (
        <Suspense fallback={null}>
          <Routes>
            <Route path="/intro" element={authed ? <Navigate to="/" replace /> : <Public><Intro /></Public>} />
            <Route path="/welcome" element={authed ? <Navigate to="/" replace /> : <WelcomeRedirect />} />
            <Route path="/login" element={authed ? <Navigate to="/" replace /> : <Login />} />
            <Route path="/register" element={authed ? <Navigate to="/" replace /> : <Register />} />
            <Route path="/forgot-password" element={<Public><AccountFlows kind="forgot" /></Public>} />
            <Route path="/reset-password" element={<Public><AccountFlows kind="reset" /></Public>} />
            <Route path="/verify-email" element={<Public><AccountFlows kind="verify" /></Public>} />
            <Route path="/legal/:doc" element={<Public><Legal /></Public>} />
            <Route path="/u/:uid" element={authed ? <Shell><PublicProfile /></Shell> : <Public><PublicProfile /></Public>} />
            <Route path="/onboarding" element={<RequireAuth allowOnboarding><Suspense fallback={<FullFallback />}><Onboarding /></Suspense></RequireAuth>} />

            <Route path="/" element={<Shell><Home /></Shell>} />
            <Route path="/battle" element={<Shell><Battle /></Shell>} />
            <Route path="/battle/requests" element={<Shell><Battle tab="requests" /></Shell>} />
            <Route path="/friends" element={<Shell><Friends /></Shell>} />
            <Route path="/rank" element={<Shell><Rank /></Shell>} />
            <Route path="/profile" element={<Shell><Profile /></Shell>} />
            <Route path="/profile/achievements" element={<Shell><Profile tab="achievements" /></Shell>} />
            <Route path="/profile/edit" element={<Shell><EditProfile /></Shell>} />
            <Route path="/settings" element={<Shell><Settings /></Shell>} />
            <Route path="/about" element={<Shell><About /></Shell>} />
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
      )}
    </>
  );
}
