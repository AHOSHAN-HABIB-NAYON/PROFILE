import { useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router';
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
import Content from './pages/Content';
import Admins from './pages/Admins';
import Audit from './pages/Audit';
import AiGenerator from './pages/AiGenerator';
import Missions from './pages/Missions';

const NAV: { group: string; items: { to: string; label: string; icon: string; perm: string }[] }[] = [
  { group: 'Overview', items: [{ to: '/', label: 'Dashboard', icon: '📊', perm: 'dashboard.view' }] },
  { group: 'Players', items: [
    { to: '/users', label: 'Players', icon: '👤', perm: 'users.view' },
    { to: '/reports', label: 'Reports', icon: '🚩', perm: 'reports.view' },
    { to: '/matches', label: 'Matches', icon: '⚔️', perm: 'matches.view' },
  ] },
  { group: 'Content', items: [
    { to: '/questions', label: 'Questions', icon: '❓', perm: 'questions.view' },
    { to: '/ai', label: 'AI Generator', icon: '✨', perm: 'questions.manage' },
    { to: '/categories', label: 'Categories', icon: '🗂️', perm: 'questions.view' },
    { to: '/content', label: 'Achievements & Shop', icon: '🏅', perm: 'content.manage' },
    { to: '/missions', label: 'Missions', icon: '🎯', perm: 'content.manage' },
    { to: '/announcements', label: 'Announcements', icon: '📢', perm: 'announcements.send' },
  ] },
  { group: 'Configuration', items: [
    { to: '/game-settings', label: 'Game settings', icon: '🎮', perm: 'settings.game' },
    { to: '/app-settings', label: 'App settings', icon: '⚙️', perm: 'settings.app' },
    { to: '/admins', label: 'Admins & roles', icon: '🛡️', perm: 'admins.manage' },
    { to: '/audit', label: 'Audit log', icon: '📜', perm: 'audit.view' },
  ] },
];

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
              {items.map((i) => <NavLink key={i.to} to={i.to} end={i.to === '/'}><span aria-hidden>{i.icon}</span>{i.label}</NavLink>)}
            </div>
          );
        })}
        <div className="me">
          <b>{admin.name}</b>
          <div className="faint">{admin.roleName}</div>
          <div className="row mt"><button className="btn sm" onClick={toggle}>{theme === 'dark' ? '☀️ Light' : '🌙 Dark'}</button><button className="btn sm" onClick={() => void logout()}>Sign out</button></div>
        </div>
      </nav>
      <main className="content">
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
          <Route path="/content" element={<Guard perm="content.manage"><Content /></Guard>} />
          <Route path="/admins" element={<Guard perm="admins.manage"><Admins /></Guard>} />
          <Route path="/audit" element={<Guard perm="audit.view"><Audit /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
