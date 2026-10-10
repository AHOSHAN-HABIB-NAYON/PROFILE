import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router';
import { Icon } from './components/Icon';
import { useTableLabels } from './lib/tableLabels';
import { errMsg } from './lib/api';
import { useAdmin } from './lib/auth';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import UserDetail from './pages/UserDetail';
import Questions from './pages/Questions';
import Categories from './pages/Categories';
import Matches from './pages/Matches';
import Reports from './pages/Reports';
import GameSettings from './pages/GameSettings';
import AppSettings from './pages/AppSettings';
import Announcements from './pages/Announcements';
import Promos from './pages/Promos';
import OurApps from './pages/OurApps';
import Messages from './pages/Messages';
import Content from './pages/Content';
import Admins from './pages/Admins';
import Audit from './pages/Audit';
import AiGenerator from './pages/AiGenerator';
import Missions from './pages/Missions';

type NavItem = { to: string; label: string; icon: string; perm: string };
const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'Overview', items: [{ to: '/', label: 'Dashboard', icon: 'dashboard', perm: 'dashboard.view' }] },
  { group: 'Players', items: [
    { to: '/users', label: 'Players', icon: 'users', perm: 'users.view' },
    { to: '/reports', label: 'Reports', icon: 'flag', perm: 'reports.view' },
    { to: '/messages', label: 'Player chat', icon: 'message', perm: 'reports.view' },
    { to: '/matches', label: 'Matches', icon: 'swords', perm: 'matches.view' },
  ] },
  { group: 'Content', items: [
    { to: '/questions', label: 'Questions', icon: 'question', perm: 'questions.view' },
    { to: '/ai', label: 'AI Generator', icon: 'sparkles', perm: 'questions.manage' },
    { to: '/categories', label: 'Categories', icon: 'folder', perm: 'questions.view' },
    { to: '/content', label: 'Achievements & Shop', icon: 'award', perm: 'content.manage' },
    { to: '/missions', label: 'Missions', icon: 'target', perm: 'content.manage' },
    { to: '/announcements', label: 'Announcements', icon: 'megaphone', perm: 'announcements.send' },
    { to: '/promos', label: 'Promotions (ads)', icon: 'sparkles', perm: 'announcements.send' },
    { to: '/our-apps', label: 'Our apps', icon: 'smartphone', perm: 'announcements.send' },
  ] },
  { group: 'Configuration', items: [
    { to: '/game-settings', label: 'Game settings', icon: 'gamepad', perm: 'settings.game' },
    { to: '/app-settings', label: 'App settings', icon: 'settings', perm: 'settings.app' },
    { to: '/admins', label: 'Admins & roles', icon: 'shield-user', perm: 'admins.manage' },
    { to: '/audit', label: 'Audit log', icon: 'scroll', perm: 'audit.view' },
  ] },
];
/** Shown directly in the phone bottom bar; everything else lives in the "More" sheet. */
const PRIMARY = ['/', '/users', '/questions', '/ai'];
const ALL = NAV.flatMap((g) => g.items);

function pageTitle(path: string) {
  if (path.startsWith('/users/')) return 'Player';
  return ALL.find((i) => i.to === path)?.label ?? 'Admin';
}

/** Phone chrome: sticky top bar with an overflow menu, fixed bottom bar and a "More" bottom sheet. */
function MobileNav({ theme, toggle }: { theme: string; toggle: () => void }) {
  const { admin, can, logout } = useAdmin();
  const { pathname } = useLocation();
  const sheet = useRef<HTMLDialogElement>(null);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => (document.removeEventListener('pointerdown', close), document.removeEventListener('keydown', close));
  }, [menu]);
  useEffect(() => {
    setMenu(false);
    sheet.current?.close();
  }, [pathname]);
  const primary = PRIMARY.map((to) => ALL.find((i) => i.to === to)!).filter((i) => can(i.perm));
  const rest = NAV.map((g) => ({ ...g, items: g.items.filter((i) => can(i.perm) && !PRIMARY.includes(i.to)) })).filter((g) => g.items.length);
  const moreActive = !primary.some((i) => (i.to === '/' ? pathname === '/' : pathname.startsWith(i.to)));
  return (
    <>
      <header className="topbar">
        <img src="/v2admin/favicon.svg" alt="QUIZ WAR" width={30} height={30} />
        <h1 className="topbar-title">{pageTitle(pathname)}</h1>
        <div className="menu-wrap" ref={menuRef}>
          <button className="btn ghost icon-btn" aria-haspopup="menu" aria-expanded={menu} aria-label="Account menu" title="Account menu" onClick={() => setMenu(!menu)}><Icon name="more" size={22} /></button>
          {menu && (
            <div className="menu" role="menu">
              <div className="menu-me"><b>{admin?.name}</b><span className="faint small">{admin?.roleName}</span></div>
              <button role="menuitem" onClick={() => (toggle(), setMenu(false))}><Icon name={theme === 'dark' ? 'sun' : 'moon'} />{theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}</button>
              <button role="menuitem" onClick={() => void logout()}><Icon name="logout" />Sign out</button>
            </div>
          )}
        </div>
      </header>
      <nav className="bottomnav" aria-label="Main">
        {primary.map((i) => <NavLink key={i.to} to={i.to} end={i.to === '/'}><Icon name={i.icon} size={22} /><span>{i.label === 'AI Generator' ? 'AI' : i.label}</span></NavLink>)}
        <button className={moreActive ? 'active' : ''} aria-haspopup="dialog" onClick={() => sheet.current?.showModal()}><Icon name="more" size={22} /><span>More</span></button>
      </nav>
      <dialog ref={sheet} className="sheet" aria-label="More pages" onClick={(e) => e.target === e.currentTarget && sheet.current?.close()}>
        <div className="sheet-body">
          <div className="sheet-handle" aria-hidden />
          <div className="row"><h2 className="grow">More</h2><button className="btn ghost icon-btn" aria-label="Close" title="Close" onClick={() => sheet.current?.close()}><Icon name="close" /></button></div>
          {rest.map((g) => (
            <section key={g.group}>
              <h3 className="group">{g.group}</h3>
              <div className="sheet-grid">
                {g.items.map((i) => <NavLink key={i.to} to={i.to} onClick={() => sheet.current?.close()}><Icon name={i.icon} size={22} /><span>{i.label}</span></NavLink>)}
              </div>
            </section>
          ))}
          <h3 className="group">Account</h3>
          <div className="sheet-actions">
            <button className="btn" onClick={toggle}><Icon name={theme === 'dark' ? 'sun' : 'moon'} />{theme === 'dark' ? 'Use light theme' : 'Use dark theme'}</button>
            <button className="btn" onClick={() => void logout()}><Icon name="logout" />Sign out</button>
          </div>
        </div>
      </dialog>
    </>
  );
}

function Login() {
  const { login } = useAdmin();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setErr(null);
    try {
      await login(String(f.get('email')), String(f.get('password')));
    } catch (e2) {
      setErr(errMsg(e2));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login">
      <form className="card form" onSubmit={submit}>
        <div className="row"><img src="/v2admin/favicon.svg" width={40} height={40} alt="" style={{ borderRadius: 10 }} /><div><h1 style={{ fontSize: 18 }}>QUIZ WAR Admin</h1><p className="small faint">Authorised staff only</p></div></div>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="field"><label htmlFor="e">Email</label><input id="e" name="email" type="email" className="input" autoComplete="username" required /></div>
        <div className="field"><label htmlFor="p">Password</label><input id="p" name="password" type="password" className="input" autoComplete="current-password" required /></div>
        <button className="btn primary" disabled={busy} style={{ justifyContent: 'center', height: 42 }}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}

function Guard({ perm, children }: { perm: string; children: ReactNode }) {
  const { can } = useAdmin();
  return can(perm) ? <>{children}</> : <div className="card">You don’t have permission to view this page.</div>;
}

export function App() {
  const { admin, loading, can, logout } = useAdmin();
  const [theme, setTheme] = useState(document.documentElement.dataset.theme ?? 'light');
  const mainRef = useTableLabels();
  if (loading) return <div className="login"><div className="skeleton" style={{ width: 200 }} /></div>;
  if (!admin) return <Login />;
  const toggle = () => {
    const t = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    localStorage.setItem('qw-admin-theme', t);
    setTheme(t);
  };
  return (
    <div className="layout">
      <nav className="sidebar" aria-label="Admin">
        <div className="brand"><img src="/v2admin/favicon.svg" alt="" /><span>QUIZ WAR<small>ADMIN PANEL</small></span></div>
        {NAV.map((g) => {
          const items = g.items.filter((i) => can(i.perm));
          if (!items.length) return null;
          return (
            <div key={g.group}>
              <div className="group">{g.group}</div>
              {items.map((i) => <NavLink key={i.to} to={i.to} end={i.to === '/'}><Icon name={i.icon} />{i.label}</NavLink>)}
            </div>
          );
        })}
        <div className="me">
          <b>{admin.name}</b>
          <div className="faint">{admin.roleName}</div>
          <div className="row mt"><button className="btn sm" onClick={toggle}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={14} />{theme === 'dark' ? 'Light theme' : 'Dark theme'}</button><button className="btn sm" onClick={() => void logout()}><Icon name="logout" size={14} />Sign out</button></div>
        </div>
      </nav>
      <MobileNav theme={theme} toggle={toggle} />
      <main className="content" ref={mainRef}>
        <Routes>
          <Route path="/" element={can('dashboard.view') ? <Dashboard /> : <Navigate to={can('questions.view') ? '/questions' : '/users'} replace />} />
          <Route path="/users" element={<Guard perm="users.view"><Users /></Guard>} />
          <Route path="/users/:id" element={<Guard perm="users.view"><UserDetail /></Guard>} />
          <Route path="/questions" element={<Guard perm="questions.view"><Questions /></Guard>} />
          <Route path="/ai" element={<Guard perm="questions.manage"><AiGenerator /></Guard>} />
          <Route path="/missions" element={<Guard perm="content.manage"><Missions /></Guard>} />
          <Route path="/categories" element={<Guard perm="questions.view"><Categories /></Guard>} />
          <Route path="/matches" element={<Guard perm="matches.view"><Matches /></Guard>} />
          <Route path="/reports" element={<Guard perm="reports.view"><Reports /></Guard>} />
          <Route path="/game-settings" element={<Guard perm="settings.game"><GameSettings /></Guard>} />
          <Route path="/app-settings" element={<Guard perm="settings.app"><AppSettings /></Guard>} />
          <Route path="/announcements" element={<Guard perm="announcements.send"><Announcements /></Guard>} />
          <Route path="/promos" element={<Guard perm="announcements.send"><Promos /></Guard>} />
          <Route path="/our-apps" element={<Guard perm="announcements.send"><OurApps /></Guard>} />
          <Route path="/messages" element={<Guard perm="reports.view"><Messages /></Guard>} />
          <Route path="/content" element={<Guard perm="content.manage"><Content /></Guard>} />
          <Route path="/admins" element={<Guard perm="admins.manage"><Admins /></Guard>} />
          <Route path="/audit" element={<Guard perm="audit.view"><Audit /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
