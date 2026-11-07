import { useLocation, useNavigate } from 'react-router';
import { useAuth } from '../lib/auth';
import { useT } from '../lib/i18n';
import { useLudo } from '../lib/ludoOnline';
import { haptic } from '../lib/platform';
import { Icon } from './Icon';

/** A minimized Ludo game: small floating button to go back; it glows when it is your turn. */
export function LudoMini() {
  const t = useT();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const snap = useLudo((s) => s.snap);
  const meId = useAuth((s) => s.user?.id);
  if (!snap || !meId || pathname.startsWith('/ludo/') || /^\/(match|war-room|login|intro|onboarding)/.test(pathname)) return null;
  if (snap.status !== 'playing' && snap.status !== 'lobby') return null;
  const mine = snap.seats.findIndex((s) => s.userId === meId);
  if (mine < 0 || snap.seats[mine]!.left) return null;
  const myTurn = snap.status === 'playing' && snap.state?.turn === mine;
  return (
    <button
      type="button"
      className={`ludo-mini${myTurn ? ' turn' : ''}`}
      onClick={() => (haptic('tap'), nav(`/ludo/online/${snap.id}`))}
      aria-label={t('Back to Ludo', 'লুডুতে ফিরুন')}
    >
      <span className="lm-ico"><Icon name="gamepad" size={20} /></span>
      <span className="lm-txt">
        <b>{snap.status === 'lobby' ? t('Ludo room', 'লুডু রুম') : t('Ludo is on', 'লুডু চলছে')}</b>
        <small>{myTurn ? t('Your turn!', 'আপনার চাল!') : t('Tap to go back', 'ফিরতে চাপুন')}</small>
      </span>
    </button>
  );
}
