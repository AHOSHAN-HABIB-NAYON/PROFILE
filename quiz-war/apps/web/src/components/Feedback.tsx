import { useEffect, useRef, useState, type ReactNode } from 'react';

export function Skeleton({ lines = 3, kind = 'row' }: { lines?: number; kind?: 'row' | 'line' | 'card' }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className={`skeleton sk-${kind}`} />
      ))}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <span className="spinner" role="status" aria-label={label} />;
}

export function Empty({ icon, title, body, action }: { icon: string; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="e-icon" aria-hidden>{icon}</div>
      <h3>{title}</h3>
      {body && <p className="small">{body}</p>}
      {action}
    </div>
  );
}

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  const msg = error instanceof Error ? error.message : 'Something went wrong';
  return (
    <div className="empty">
      <div className="e-icon" aria-hidden>😕</div>
      <h3>Couldn’t load this</h3>
      <p className="small">{msg}</p>
      {retry && <button className="btn soft" onClick={retry}>Try again</button>}
    </div>
  );
}

/** Animated number counter (coins, XP, scores). */
export function CountUp({ value, duration = 700 }: { value: number; duration?: number }) {
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
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(a + (value - a) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <span className="num">{shown.toLocaleString('en-US')}</span>;
}
