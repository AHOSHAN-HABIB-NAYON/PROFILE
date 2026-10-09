import { useEffect, useRef, useState, type ReactNode } from 'react';
import { friendlyError } from '../lib/api';
import { num, useLang, useT } from '../lib/i18n';
import { Icon, IconTile, type IconAnim, type IconName } from './Icon';

export function Skeleton({ lines = 3, kind = 'row' }: { lines?: number; kind?: 'row' | 'line' | 'card' }) {
  const t = useT();
  return (
    <div aria-busy="true" aria-label={t('Loading', 'লোড হচ্ছে')}>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className={`skeleton sk-${kind}`} style={kind === 'line' ? { width: `${92 - ((i * 17) % 40)}%` } : undefined} />
      ))}
    </div>
  );
}

/** List-shaped skeleton: avatar circle + two text lines per row. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  const t = useT();
  return (
    <div aria-busy="true" aria-label={t('Loading', 'লোড হচ্ছে')}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="row" style={{ padding: '10px 0' }}>
          <div className="skeleton sk-circle" style={{ width: 44, height: 44 }} />
          <div className="grow">
            <div className="skeleton sk-line" style={{ width: `${70 - i * 6}%`, margin: '2px 0 8px' }} />
            <div className="skeleton sk-line" style={{ width: `${40 + i * 5}%`, height: 10, margin: 0 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  const t = useT();
  return <span className="spinner" role="status" aria-label={label ?? t('Loading', 'লোড হচ্ছে')} />;
}

export function Empty({ icon, title, body, action, tone = 'primary', anim = 'float' }: { icon: IconName; title: string; body?: string; action?: ReactNode; tone?: 'primary' | 'accent' | 'success' | 'warning' | 'cyan' | 'danger'; anim?: IconAnim }) {
  return (
    <div className="empty">
      <div className="e-art">
        <IconTile name={icon} tone={tone} size={72} anim={anim} />
      </div>
      <h3>{title}</h3>
      {body && <p className="small">{body}</p>}
      {action}
    </div>
  );
}

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  const t = useT();
  const offline = (error as any)?.code === 'network';
  return (
    <Empty
      icon={offline ? 'wifi-off' : 'alert'}
      tone="danger"
      anim="wiggle"
      title={offline ? t('No internet connection', 'ইন্টারনেট সংযোগ নেই') : t('Couldn’t load this', 'লোড করা যায়নি')}
      body={offline ? t('Check your connection and try again.', 'আপনার নেট সংযোগ দেখে আবার চেষ্টা করুন।') : friendlyError(error)}
      action={
        retry && (
          <button className="btn soft" onClick={retry}>
            <Icon name="refresh" /> {t('Try again', 'আবার চেষ্টা করুন')}
          </button>
        )
      }
    />
  );
}

/** Animated number counter (coins, XP, scores) in the active language's digits. */
export function CountUp({ value, duration = 700 }: { value: number; duration?: number }) {
  const lang = useLang();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    if (a === value || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(value);
      from.current = value;
      return;
    }
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(a + (value - a) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <span className="num">{num(shown, lang)}</span>;
}

/** Number in the active language (Bangla digits in Bangla). */
export function N({ v }: { v: number | string }) {
  const lang = useLang();
  return <span className="num">{num(v, lang)}</span>;
}
