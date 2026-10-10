import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useChat } from '../lib/chat';
import { useT } from '../lib/i18n';
import { haptic } from '../lib/platform';
import { useSettings } from '../lib/settings';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

const HIDE_ON = ['/chat/', '/match/', '/matchmaking', '/war-room/', '/intro', '/login', '/register', '/onboarding'];

/**
 * Messenger-style chat heads: round avatars that float over the app when someone messages
 * you. Drag them to either side; drop on the × to dismiss; tap to open the chat.
 */
export function ChatHeads() {
  const t = useT();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const heads = useChat((s) => s.heads);
  const enabled = useSettings((s) => s.chatHeads);
  const [pos, setPos] = useState<{ side: 'left' | 'right'; y: number }>({ side: 'right', y: 0.28 });
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [overClose, setOverClose] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
  const start = useRef<{ x: number; y: number; moved: boolean; id: number } | null>(null);

  const newest = heads[0];
  // Show the newest message next to its head for a few seconds.
  useEffect(() => {
    if (!newest) return;
    setPreview(newest.at);
    const id = setTimeout(() => setPreview(null), 4500);
    return () => clearTimeout(id);
  }, [newest?.at]);

  if (!enabled || !heads.length || HIDE_ON.some((p) => pathname.startsWith(p))) return null;

  const closeZone = (x: number, y: number) => Math.hypot(x - window.innerWidth / 2, y - (window.innerHeight - 90)) < 70;

  const onDown = (e: React.PointerEvent, id: number) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, moved: false, id };
  };
  const onMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    if (!s.moved && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 8) return;
    s.moved = true;
    setDrag({ x: e.clientX, y: e.clientY });
    const over = closeZone(e.clientX, e.clientY);
    if (over !== overClose) {
      if (over) haptic('tap');
      setOverClose(over);
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    if (!s.moved) {
      const h = heads.find((x) => x.peer.id === s.id);
      if (h) {
        haptic('tap');
        useChat.getState().dropHead(h.peer.id);
        nav(`/chat/${h.peer.uid}`);
      }
      return;
    }
    if (closeZone(e.clientX, e.clientY)) {
      haptic('success');
      useChat.getState().clearHeads();
    } else {
      setPos({ side: e.clientX < window.innerWidth / 2 ? 'left' : 'right', y: Math.min(0.8, Math.max(0.08, e.clientY / window.innerHeight)) });
    }
    setDrag(null);
    setOverClose(false);
  };

  const style: React.CSSProperties = drag
    ? { left: drag.x - 30, top: drag.y - 30, transition: 'none' }
    : { [pos.side]: 10, top: `${pos.y * 100}%` };

  return (
    <>
      <div className={`chat-heads side-${pos.side}${drag ? ' dragging' : ''}`} style={style}>
        {heads.map((h, i) => (
          <button
            key={h.peer.id}
            type="button"
            className="chead"
            style={{ zIndex: 10 - i }}
            aria-label={t(`Open chat with ${h.peer.username}`, `${h.peer.username}-এর চ্যাট খুলুন`)}
            onPointerDown={(e) => onDown(e, h.peer.id)}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={() => ((start.current = null), setDrag(null), setOverClose(false))}
          >
            <Avatar name={h.peer.username} src={h.peer.avatarThumbUrl} size={58} />
            {h.count > 0 && <span className="ch-badge">{h.count > 9 ? '9+' : h.count}</span>}
            {i === 0 && preview === h.at && !drag && (
              <span className="ch-preview">
                <b>{h.request ? t('Message request', 'মেসেজ রিকোয়েস্ট') : h.peer.username}</b>
                <span>{h.last}</span>
              </span>
            )}
          </button>
        ))}
      </div>
      {drag && (
        <div className={`ch-close${overClose ? ' over' : ''}`} aria-hidden>
          <Icon name="close" size={28} />
        </div>
      )}
    </>
  );
}
