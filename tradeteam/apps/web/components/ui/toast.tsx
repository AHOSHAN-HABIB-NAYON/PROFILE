'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';
import { cx } from './primitives';

type Toast = { id: number; tone: 'success' | 'error' | 'info'; title: string; body?: string };
let items: Toast[] = [];
const ls = new Set<() => void>();
let n = 0;
const emit = () => ls.forEach((l) => l());

export function toast(title: string, opts: { tone?: Toast['tone']; body?: string; ms?: number } = {}) {
  const t = { id: ++n, tone: opts.tone ?? 'success', title, body: opts.body };
  items = [...items, t].slice(-4);
  emit();
  setTimeout(() => {
    items = items.filter((x) => x.id !== t.id);
    emit();
  }, opts.ms ?? 3800);
}
toast.error = (title: string, body?: string) => toast(title, { tone: 'error', body, ms: 6000 });
toast.info = (title: string, body?: string) => toast(title, { tone: 'info', body });

export function Toaster() {
  const list = useSyncExternalStore(
    (l) => {
      ls.add(l);
      return () => ls.delete(l);
    },
    () => items,
    () => items,
  );
  // Render the portal only after mount so server and client markup match during hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div className="fixed z-[60] top-3 inset-x-3 sm:inset-x-auto sm:right-4 sm:top-4 flex flex-col gap-2 sm:w-96 pointer-events-none pt-safe">
      {list.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto bg-card border border-line shadow-pop rounded-2xl px-4 py-3 flex gap-3 fade-in"
          role="status"
        >
          <span
            className={cx(
              'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
              t.tone === 'success'
                ? 'bg-up-soft text-up'
                : t.tone === 'error'
                  ? 'bg-down-soft text-down'
                  : 'bg-accent-soft text-accent',
            )}
          >
            <Icon name={t.tone === 'success' ? 'check' : t.tone === 'error' ? 'alert' : 'info'} size={16} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{t.title}</p>
            {t.body && <p className="text-[13px] text-muted mt-0.5 break-words">{t.body}</p>}
          </div>
        </div>
      ))}
    </div>,
    document.body,
  );
}
