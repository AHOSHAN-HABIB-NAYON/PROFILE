import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * Bottom sheet on phones, centered dialog on larger screens. Built on the native <dialog>
 * (focus trap, Esc, top layer) with closedby="any" light-dismiss and a click-outside
 * fallback for browsers that don't support `closedby` yet.
 */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onCloseEv = () => onClose();
    d.addEventListener('close', onCloseEv);
    let onClick: ((e: MouseEvent) => void) | null = null;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      onClick = (e: MouseEvent) => {
        const r = d.getBoundingClientRect();
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (!inside && e.target === d) d.close();
      };
      d.addEventListener('click', onClick);
    }
    return () => {
      d.removeEventListener('close', onCloseEv);
      if (onClick) d.removeEventListener('click', onClick);
    };
  }, [onClose]);
  return (
    <dialog ref={ref} className="sheet" closedby="any" aria-labelledby={titleId}>
      <div className="grabber" />
      <div className="sheet-body">
        <div className="sheet-head">
          <h2 id={titleId}>{title}</h2>
          <button className="btn icon sm ghost" onClick={() => ref.current?.close()} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>
        {open && children}
      </div>
    </dialog>
  );
}
