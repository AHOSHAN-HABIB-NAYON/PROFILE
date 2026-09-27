'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';
import { cx } from './primitives';

/**
 * Responsive dialog: a draggable bottom sheet on phones (swipe down to dismiss) and a centred
 * modal on larger screens. Traps scroll, closes on Escape / backdrop.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  size = 'md',
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  size?: 'md' | 'lg';
  footer?: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y0: number; dy: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panel}
        className={cx(
          'relative w-full bg-card sm:rounded-3xl rounded-t-3xl shadow-pop sheet-enter max-h-[92vh] flex flex-col',
          size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
        onTouchStart={(e) => (drag.current = { y0: e.touches[0]!.clientY, dy: 0 })}
        onTouchMove={(e) => {
          if (!drag.current || !panel.current) return;
          const scroller = panel.current.querySelector('[data-sheet-body]') as HTMLElement | null;
          if (scroller && scroller.scrollTop > 0) return;
          drag.current.dy = Math.max(0, e.touches[0]!.clientY - drag.current.y0);
          panel.current.style.transform = `translateY(${drag.current.dy}px)`;
        }}
        onTouchEnd={() => {
          if (!panel.current || !drag.current) return;
          if (drag.current.dy > 120) onClose();
          else panel.current.style.transform = '';
          drag.current = null;
        }}
      >
        <div className="sm:hidden flex justify-center pt-2.5">
          <div className="w-10 h-1.5 rounded-full bg-line-strong" />
        </div>
        {title && (
          <div className="flex items-center justify-between px-5 pt-3 pb-2">
            <h3 className="text-[17px] font-semibold">{title}</h3>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-card-2 flex items-center justify-center text-muted"
              aria-label="Close"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
        <div data-sheet-body className="overflow-y-auto px-5 pb-5 pt-2 flex-1">
          {children}
        </div>
        {footer && <div className="px-5 pb-safe pt-3 border-t border-line">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
