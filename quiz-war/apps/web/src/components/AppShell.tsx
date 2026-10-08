import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Link, useNavigate } from 'react-router';
import { useNotifications } from '../hooks/queries';
import { useOnline } from '../hooks/useOnline';
import { useAuth } from '../lib/auth';
import { useConn } from '../lib/socket';
import { CountUp } from './Feedback';
import { Icon } from './Icon';

const NAV = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/battle', label: 'Battle', icon: 'swords' },
  { to: '/friends', label: 'Friends', icon: 'users' },
  { to: '/rank', label: 'Rank', icon: 'trophy' },
  { to: '/profile', label: 'Profile', icon: 'user' },
];

export function ConnectionBanner() {
  const online = useOnline();
  const status = useConn((s) => s.status);
  if (!online) return <div className="banner offline" role="status"><Icon name="wifi" size={18} /> You’re offline — battles need internet. We’ll reconnect automatically.</div>;
  if (status === 'reconnecting') return <div className="banner reconnecting" role="status"><span className="spinner" style={{ width: 14, height: 14 }} /> Reconnecting to the battle server…</div>;
  return null;
}

function RejoinBanner() {
  const matchId = useAuth((s) => s.activeMatchId);
  const nav = useNavigate();
  if (!matchId) return null;
  return (
    <div className="banner info">
      ⚔️ You have a match in progress
      <button className="btn sm" style={{ background: '#fff', color: 'var(--primary)' }} onClick={() => nav(`/match/${matchId}`)}>Rejoin</button>
    </div>
  );
}

export function TopBar() {
  const user = useAuth((s) => s.user);
  const online = useConn((s) => s.online);
  const { data } = useNotifications();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(scrollY > 4);
    addEventListener('scroll', on, { passive: true });
    return () => removeEventListener('scroll', on);
  }, []);
  return (
    <header className={`topbar ${scrolled ? 'scrolled' : ''}`}>
      <Link to="/" className="brand" aria-label="QUIZ WAR home">
        <img src="/icons/icon-192.png" alt="" width={30} height={30} />
        <span className="hide-desktop">QUIZ WAR<small>BANGLADESH</small></span>
      </Link>
      <span className="grow" />
      <span className="pill online" title="Players online"><i className="dot" />{online > 0 ? online.toLocaleString('en-US') : '—'}</span>
      {user && <Link to="/profile" className="pill streak" aria-label={`${user.streakDays} day streak`}>🔥 {user.streakDays}</Link>}
      {user && <Link to="/shop" className="pill coin" aria-label={`${user.coins} coins`}>🪙 <CountUp value={user.coins} /></Link>}
      <Link to="/notifications" className="btn icon sm ghost" aria-label={`Notifications${data?.unread ? `, ${data.unread} unread` : ''}`} style={{ position: 'relative' }}>
        <Icon name="bell" size={20} />
        {!!data?.unread && <span className="chip danger" style={{ position: 'absolute', top: -4, right: -6, height: 18, padding: '0 5px', fontSize: 10 }}>{data.unread > 9 ? '9+' : data.unread}</span>}
      </Link>
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <nav className="side-nav" aria-label="Main">
        <Link to="/" className="brand"><img src="/icons/icon-192.png" alt="" width={30} height={30} /><span>QUIZ WAR<small>BANGLADESH</small></span></Link>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} viewTransition><Icon name={n.icon} />{n.label}</NavLink>
        ))}
        <NavLink to="/squads" viewTransition><Icon name="shield" />Squads</NavLink>
        <NavLink to="/shop" viewTransition><Icon name="shop" />Shop</NavLink>
        <NavLink to="/notifications" viewTransition><Icon name="bell" />Notifications</NavLink>
        <span className="spacer" />
        <NavLink to="/settings" viewTransition><Icon name="settings" />Settings</NavLink>
      </nav>
      <div className="main">
        <ConnectionBanner />
        <RejoinBanner />
        <TopBar />
        <main id="main">{children}</main>
      </div>
      <nav className="bottom-nav" aria-label="Main">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} viewTransition className={n.to === '/battle' ? 'battle-tab' : undefined}>
            {n.to === '/battle' ? <span className="battle-orb"><Icon name={n.icon} /></span> : <Icon name={n.icon} />}
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function PageHeader({ title, back, action }: { title: string; back?: boolean; action?: ReactNode }) {
  const nav = useNavigate();
  return (
    <div className="page-title">
      {back && <button className="btn icon sm ghost" aria-label="Back" onClick={() => (history.length > 1 ? nav(-1) : nav('/'))}><Icon name="back" /></button>}
      <h1>{title}</h1>
      {action}
    </div>
  );
}
