import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import { useConfig, useNotifications } from '../hooks/queries';
import { useOnline } from '../hooks/useOnline';
import { useAuth } from '../lib/auth';
import { num, useLang, useT } from '../lib/i18n';
import { haptic } from '../lib/platform';
import { emit, useConn } from '../lib/socket';
import { useGame } from '../lib/game';
import { CountUp } from './Feedback';
import { Icon, IconTile, type IconName } from './Icon';
import { Modal } from './Sheet';

const NAV: { to: string; en: string; bn: string; icon: IconName; end?: boolean }[] = [
  { to: '/', en: 'Home', bn: 'হোম', icon: 'home', end: true },
  { to: '/friends', en: 'Friends', bn: 'বন্ধু', icon: 'users' },
  { to: '/battle', en: 'Battle', bn: 'ব্যাটল', icon: 'swords' },
  { to: '/rank', en: 'Rank', bn: 'র‍্যাংক', icon: 'trophy' },
  { to: '/profile', en: 'Profile', bn: 'প্রোফাইল', icon: 'user' },
];

/**
 * Connection status as a small floating pill — only after the problem has lasted a few
 * seconds, so short network blips never flash a banner.
 */
export function ConnectionPill() {
  const online = useOnline();
  const status = useConn((s) => s.status);
  const t = useT();
  const bad = !online || status === 'reconnecting';
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!bad) return setShow(false);
    const id = setTimeout(() => setShow(true), online ? 3500 : 1200);
    return () => clearTimeout(id);
  }, [bad, online]);
  if (!show) return null;
  return (
    <div className={`conn-pill ${online ? '' : 'offline'}`} role="status">
      {online ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <Icon name="wifi-off" />}
      {online ? t('Reconnecting…', 'আবার সংযোগ হচ্ছে…') : t('You’re offline', 'আপনি অফলাইনে আছেন')}
    </div>
  );
}

/** "You have a match running" — a proper popup once, then a small return chip. */
function ActiveMatch() {
  const matchId = useAuth((s) => s.activeMatchId);
  const nav = useNavigate();
  const loc = useLocation();
  const t = useT();
  const cfg = useConfig().data;
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [checked, setChecked] = useState<string | null>(null);
  // The id can be stale (match ended while the app was closed): confirm with the server first.
  useEffect(() => {
    if (!matchId || checked === matchId) return;
    let alive = true;
    emit('match:resume', { matchId })
      .then((r: any) => {
        if (!alive) return;
        const st = r?.snapshot?.state;
        if (!r?.snapshot || st === 'finished' || st === 'aborted' || st === 'lobby') useAuth.setState({ activeMatchId: null });
        else setChecked(matchId);
      })
      .catch(() => alive && useAuth.setState({ activeMatchId: null }));
    return () => {
      alive = false;
    };
  }, [matchId, checked]);
  if (!matchId || checked !== matchId || loc.pathname.startsWith('/match/') || loc.pathname.startsWith('/war-room/')) return null;
  const pen = cfg?.game.penalties;
  const open = dismissed !== matchId;
  return (
    <>
      <Modal open={open} onClose={() => setDismissed(matchId)} label={t('Match in progress', 'ম্যাচ চলছে')}>
        <div className="m-art">
          <span className="live-ring"><IconTile name="swords" tone="danger" size={72} anim="wiggle" /></span>
        </div>
        <h2>{t('Your match is still running!', 'আপনার ম্যাচ এখনো চলছে!')}</h2>
        <p>{t('Your opponent is waiting. Jump back in before time runs out.', 'প্রতিপক্ষ অপেক্ষা করছে। সময় শেষ হওয়ার আগে ফিরে যান।')}</p>
        {pen?.enabled && (pen.quitCoins > 0 || pen.quitXp > 0) && (
          <p className="xs faint" style={{ marginTop: 10 }}>
            {t(`Leaving costs ${pen.quitCoins} coins and ${pen.quitXp} XP.`, `ম্যাচ ছেড়ে দিলে ${num(pen.quitCoins)} কয়েন ও ${num(pen.quitXp)} XP কাটা যাবে।`)}
          </p>
        )}
        <div className="modal-actions">
          <button
            className="btn outline"
            disabled={leaving}
            onClick={() => {
              // Close at once; the forfeit is sent in the background.
              setLeaving(true);
              useAuth.setState({ activeMatchId: null });
              useGame.getState().reset();
              void emit('match:forfeit', { matchId }).catch(() => undefined).finally(() => setLeaving(false));
            }}
          >
            {t('Leave match', 'ম্যাচ ছেড়ে দিন')}
          </button>
          <button className="btn primary" onClick={() => (haptic('tap'), nav(`/match/${matchId}`))}>
            <Icon name="arrow-right" /> {t('Rejoin', 'ফিরে যান')}
          </button>
        </div>
      </Modal>
      {!open && (
        <button className="return-chip" onClick={() => nav(`/match/${matchId}`)}>
          <span className="live-dot" /> {t('Match in progress — return', 'ম্যাচ চলছে — ফিরে যান')} <Icon name="chevron" size={16} />
        </button>
      )}
    </>
  );
}

/** A war room the player left open: a small chip to go back to it from anywhere. */
function OpenRoom() {
  const roomId = useAuth((s) => s.openRoomId);
  const matchId = useAuth((s) => s.activeMatchId);
  const nav = useNavigate();
  const loc = useLocation();
  const t = useT();
  if (!roomId || matchId || loc.pathname.startsWith('/war-room/') || loc.pathname.startsWith('/match/')) return null;
  return (
    <button className="return-chip room" onClick={() => (haptic('tap'), nav(`/war-room/${roomId}`))}>
      <Icon name="shield" size={16} /> {t('Your war room is open — return', 'আপনার ওয়ার রুম খোলা আছে — ফিরে যান')} <Icon name="chevron" size={16} />
    </button>
  );
}

export function TopBar() {
  const user = useAuth((s) => s.user);
  const online = useConn((s) => s.online);
  const lang = useLang();
  const t = useT();
  const { data } = useNotifications();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(scrollY > 4);
    addEventListener('scroll', on, { passive: true });
    return () => removeEventListener('scroll', on);
  }, []);
  return (
    <header className={`topbar ${scrolled ? 'scrolled' : ''}`}>
      <Link to="/" className="brand" aria-label={t('QUIZ WAR home', 'QUIZ WAR হোম')}>
        <img src="/icons/icon-192.png" alt="" width={32} height={32} />
        <span className="hide-narrow">QUIZ WAR<small>BANGLADESH</small></span>
      </Link>
      <span className="grow" />
      <span className="pill online" title={t('Players online', 'অনলাইনে প্লেয়ার')}>
        <i className="dot" />
        {online > 0 ? num(online, lang) : '—'}
      </span>
      {user && (
        <Link to="/profile" className="pill streak" aria-label={t(`${user.streakDays} day streak`, `টানা ${user.streakDays} দিন`)}>
          <Icon name="fire" size={20} />
          {num(user.streakDays, lang)}
        </Link>
      )}
      {user && (
        <Link to="/shop" className="pill coin" aria-label={t(`${user.coins} coins`, `${user.coins} কয়েন`)}>
          <Icon name="coin" size={20} />
          <CountUp value={user.coins} />
        </Link>
      )}
      <Link to="/notifications" className="btn icon sm ghost" aria-label={t(`Notifications${data?.unread ? `, ${data.unread} unread` : ''}`, `নোটিফিকেশন${data?.unread ? `, ${data.unread}টি নতুন` : ''}`)} style={{ position: 'relative' }}>
        <Icon name="bell" size={22} anim={data?.unread ? 'ring' : undefined} />
        {!!data?.unread && <span className="icon-btn-badge">{data.unread > 9 ? '9+' : num(data.unread, lang)}</span>}
      </Link>
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <div className="shell">
      <nav className="side-nav" aria-label={t('Main', 'প্রধান মেনু')}>
        <Link to="/" className="brand">
          <img src="/icons/icon-192.png" alt="" width={32} height={32} />
          <span>QUIZ WAR<small>BANGLADESH</small></span>
        </Link>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} viewTransition>
            <Icon name={n.icon} />
            {t(n.en, n.bn)}
          </NavLink>
        ))}
        <NavLink to="/squads" viewTransition><Icon name="shield" />{t('Squads', 'স্কোয়াড')}</NavLink>
        <NavLink to="/shop" viewTransition><Icon name="shop" />{t('Shop & missions', 'শপ ও মিশন')}</NavLink>
        <NavLink to="/notifications" viewTransition><Icon name="bell" />{t('Notifications', 'নোটিফিকেশন')}</NavLink>
        <span className="spacer" />
        <NavLink to="/settings" viewTransition><Icon name="settings" />{t('Settings', 'সেটিংস')}</NavLink>
      </nav>
      <div className="main">
        <ConnectionPill />
        <TopBar />
        <ActiveMatch />
        <OpenRoom />
        <main id="main">{children}</main>
      </div>
      <nav className="bottom-nav" aria-label={t('Main', 'প্রধান মেনু')}>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} viewTransition onClick={() => haptic('tap')} className={n.to === '/battle' ? 'battle-tab' : undefined}>
            {n.to === '/battle' ? (
              <span className="battle-orb">
                <Icon name={n.icon} />
              </span>
            ) : (
              <Icon name={n.icon} />
            )}
            {t(n.en, n.bn)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function PageHeader({ title, back, action }: { title: string; back?: boolean; action?: ReactNode }) {
  const nav = useNavigate();
  const t = useT();
  return (
    <div className="page-title">
      {back && (
        <button className="btn icon sm ghost" aria-label={t('Back', 'ফিরে যান')} onClick={() => (history.length > 1 ? nav(-1) : nav('/'))}>
          <Icon name="back" size={24} />
        </button>
      )}
      <h1>{title}</h1>
      {action}
    </div>
  );
}
