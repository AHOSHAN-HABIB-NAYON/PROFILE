import { useRef, useState, type PointerEvent } from 'react';
import { useT } from '../lib/i18n';
import { useToasts, type Toast } from '../lib/toast';
import { Icon } from './Icon';

const TONE = { info: 'primary', success: 'success', error: 'danger' } as const;

function ToastItem({ t }: { t: Toast }) {
  const dismiss = useToasts((s) => s.dismiss);
  const tr = useT();
  const start = useRef<number | null>(null);
  const [dy, setDy] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const close = () => {
    setLeaving(true);
    setTimeout(() => dismiss(t.id), 200);
  };
  // Swipe up (or sideways) to dismiss.
  const onDown = (e: PointerEvent) => (start.current = e.clientY);
  const onMove = (e: PointerEvent) => start.current !== null && setDy(Math.min(0, e.clientY - start.current));
  const onUp = () => {
    if (dy < -28) close();
    setDy(0);
    start.current = null;
  };
  return (
    <div
      className={`toast ${t.kind} ${leaving ? 'leaving' : ''}`}
      role={t.kind === 'error' ? 'alert' : 'status'}
      style={dy ? { transform: `translateY(${dy}px)`, opacity: 1 + dy / 120 } : undefined}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <span className={`icon-tile tone-${TONE[t.kind]}`} aria-hidden>
        <Icon name={t.icon ?? 'info'} size={20} anim="pop" />
      </span>
      <div className="grow">
        <strong>{t.title}</strong>
        {t.body && <span className="t-body">{t.body}</span>}
        {t.actions && (
          <div className="t-actions">
            {t.actions.map((a) => (
              <button key={a.label} className={`btn sm ${a.primary ? 'primary' : 'outline'}`} onClick={() => (a.onClick(), close())}>
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button className="btn icon sm ghost t-close" aria-label={tr('Dismiss', 'বন্ধ করুন')} onClick={close}>
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  const t = useT();
  return (
    <div className="toasts" role="region" aria-live="polite" aria-label={t('Notifications', 'নোটিফিকেশন')}>
      {toasts.map((x) => (
        <ToastItem key={x.id} t={x} />
      ))}
    </div>
  );
}
