import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useAuth } from '../lib/auth';
import { useT } from '../lib/i18n';
import { useLudo } from '../lib/ludoOnline';
import { haptic } from '../lib/platform';

const POS_KEY = 'qw-ludo-mini-pos';
function loadPos(): { side: 'left' | 'right'; y: number } {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) ?? 'null');
    if (p && (p.side === 'left' || p.side === 'right') && typeof p.y === 'number') return p;
  } catch {
    /* ignore */
  }
  return { side: 'right', y: 0.62 };
}

/**
 * A minimized Ludo game or room: a small round Ludo-board bubble that floats over the app.
 * Drag it anywhere (it snaps to the nearest side); tap to go back. It glows when it is your turn.
 */
export function LudoMini() {
  const t = useT();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const snap = useLudo((s) => s.snap);
  const meId = useAuth((s) => s.user?.id);
  const [pos, setPos] = useState(loadPos);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const start = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  if (!snap || !meId || pathname.startsWith('/ludo/') || /^\/(match|war-room|login|intro|onboarding)/.test(pathname)) return null;
  if (snap.status !== 'playing' && snap.status !== 'lobby') return null;
  const mine = snap.seats.findIndex((s) => s.userId === meId);
  if (mine < 0) return null;
  // Left a running game: the bubble offers to take the seat back from the computer.
  const left = snap.seats[mine]!.left;
  if (left && snap.status !== 'playing') return null;
  const myTurn = !left && snap.status === 'playing' && snap.state?.turn === mine;
  const lobby = snap.status === 'lobby';

  const onUp = (e: React.PointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    if (!s.moved) {
      haptic('tap');
      nav(`/ludo/online/${snap.id}`);
      return;
    }
    const next = { side: e.clientX < window.innerWidth / 2 ? 'left' : 'right', y: Math.min(0.86, Math.max(0.1, e.clientY / window.innerHeight)) } as const;
    setPos(next);
    setDrag(null);
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const style: React.CSSProperties = drag
    ? { left: drag.x - 32, top: drag.y - 32, transition: 'none' }
    : { [pos.side]: 10, top: `calc(${pos.y * 100}% - 32px)` };

  return (
    <button
      type="button"
      className={`ludo-mini side-${pos.side}${myTurn ? ' turn' : ''}${drag ? ' dragging' : ''}`}
      style={style}
      aria-label={lobby ? t('Back to Ludo room', 'লুডু রুমে ফিরুন') : t('Back to Ludo', 'লুডুতে ফিরুন')}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, y: e.clientY, moved: false };
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s) return;
        if (!s.moved && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 8) return;
        s.moved = true;
        setDrag({ x: e.clientX, y: e.clientY });
      }}
      onPointerUp={onUp}
      onPointerCancel={() => ((start.current = null), setDrag(null))}
    >
      <span className="lm-board" aria-hidden>
        <i className="q0" /><i className="q1" /><i className="q2" /><i className="q3" />
        <b />
      </span>
      {!drag && (
        <span className="lm-tag">{left ? t('Back to game', 'খেলায় ফিরুন') : myTurn ? t('Your turn!', 'আপনার চাল!') : lobby ? t('Room', 'রুম') : t('Ludo', 'লুডু')}</span>
      )}
    </button>
  );
}
