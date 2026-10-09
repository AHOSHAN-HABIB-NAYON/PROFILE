import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useT } from '../lib/i18n';
import { haptic } from '../lib/platform';
import { Icon } from './Icon';

const THRESHOLD = 72;
const MAX = 120;

/**
 * Native-feeling pull-to-refresh: drag down at the top of the page, release to refresh.
 * Uses only transforms (compositor-friendly, 60/120 fps) and passive touch listeners.
 * Without `onRefresh` it refetches every active query.
 */
export function PullToRefresh({ children, onRefresh }: { children: ReactNode; onRefresh?: () => Promise<unknown> }) {
  const qc = useQueryClient();
  const t = useT();
  const content = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLDivElement>(null);
  const icon = useRef<HTMLSpanElement>(null);
  const [refreshing, setRefreshing] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    let startY: number | null = null;
    let startX = 0;
    // Direction lock: a gesture becomes a pull only if it is clearly vertical and downward.
    let locked: 'pull' | 'none' | null = null;
    let pull = 0;
    let armed = false;
    const paint = (y: number, animate: boolean) => {
      const c = content.current;
      const ind = indicator.current;
      if (!c || !ind) return;
      const tr = animate ? 'transform .35s cubic-bezier(.16,1,.3,1), opacity .25s' : 'none';
      c.style.transition = tr;
      ind.style.transition = tr;
      c.style.transform = y ? `translate3d(0, ${y}px, 0)` : '';
      ind.style.transform = `translate3d(0, ${Math.max(0, y - 46)}px, 0) scale(${Math.min(1, 0.5 + y / THRESHOLD / 2)})`;
      ind.style.opacity = String(Math.min(1, y / (THRESHOLD * 0.7)));
      if (icon.current) icon.current.style.transform = `rotate(${y * 3}deg)`;
    };
    const onStart = (e: TouchEvent) => {
      startY = null;
      if (busy.current || e.touches.length > 1 || window.scrollY > 0 || document.querySelector('dialog[open]')) return;
      // Sideways lists (categories, chips) and inputs never start a refresh.
      const target = e.target as Element | null;
      if (target?.closest?.('.chips-scroll, .opt-chips, .rs-chips, .h-scroll, input, textarea, select, [data-no-ptr]')) return;
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      locked = null;
      pull = 0;
      armed = false;
    };
    const onMove = (e: TouchEvent) => {
      if (startY === null) return;
      const dy = e.touches[0].clientY - startY;
      const dx = e.touches[0].clientX - startX;
      if (locked === null) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        locked = dy > 0 && dy > Math.abs(dx) * 1.5 ? 'pull' : 'none';
      }
      if (locked === 'none') return;
      if (dy <= 0 || window.scrollY > 0) {
        if (pull) paint(0, false);
        pull = 0;
        return;
      }
      pull = Math.min(MAX, Math.max(0, dy - 10) * 0.5);
      if (pull >= THRESHOLD && !armed) {
        armed = true;
        haptic('tap');
      } else if (pull < THRESHOLD) armed = false;
      paint(pull, false);
    };
    const onEnd = async () => {
      if (startY === null) return;
      startY = null;
      if (pull >= THRESHOLD) {
        busy.current = true;
        setRefreshing(true);
        paint(56, true);
        try {
          await Promise.all([onRefresh ? onRefresh() : qc.refetchQueries({ type: 'active' }), new Promise((r) => setTimeout(r, 450))]);
        } catch {
          /* errors are shown by the page itself */
        }
        haptic('success');
        setRefreshing(false);
        busy.current = false;
      }
      pull = 0;
      paint(0, true);
    };
    addEventListener('touchstart', onStart, { passive: true });
    addEventListener('touchmove', onMove, { passive: true });
    addEventListener('touchend', onEnd);
    addEventListener('touchcancel', onEnd);
    return () => {
      removeEventListener('touchstart', onStart);
      removeEventListener('touchmove', onMove);
      removeEventListener('touchend', onEnd);
      removeEventListener('touchcancel', onEnd);
    };
  }, [onRefresh, qc]);

  return (
    <div className="ptr">
      <div ref={indicator} className={`ptr-indicator ${refreshing ? 'refreshing' : ''}`} role={refreshing ? 'status' : undefined} aria-label={refreshing ? t('Refreshing', 'রিফ্রেশ হচ্ছে') : undefined}>
        <span ref={icon} style={{ display: 'inline-flex' }}>
          <Icon name="refresh" size={20} strokeWidth={2.5} />
        </span>
      </div>
      <div ref={content} className="ptr-content">
        {children}
      </div>
    </div>
  );
}
