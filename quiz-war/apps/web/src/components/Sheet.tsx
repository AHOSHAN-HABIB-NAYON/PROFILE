import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useT } from '../lib/i18n';
import { Icon, type IconName } from './Icon';

/** Chromium (incl. Android WebView) animates top-layer exits natively; others get a data-closing pass. */
function supportsTopLayerExit() {
  return !!window.CSS?.supports?.('overlay', 'auto');
}

/** Close a <dialog> with its exit transition (works everywhere). */
export async function closeDialog(d: HTMLDialogElement) {
  if (!d.open) return;
  if (!supportsTopLayerExit()) {
    d.setAttribute('data-closing', '');
    const anims = d.getAnimations({ subtree: true });
    await Promise.race([Promise.allSettled(anims.map((a) => a.finished)), new Promise((r) => setTimeout(r, 320))]);
    d.removeAttribute('data-closing');
  }
  d.close();
}

/** Shared open/close + light-dismiss wiring for native <dialog> based overlays. */
export function useDialog(open: boolean, onClose: () => void, dismissible = true) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) void closeDialog(d);
  }, [open]);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onCloseEv = () => onClose();
    const onCancel = (e: Event) => {
      e.preventDefault();
      if (dismissible) void closeDialog(d);
    };
    const onClick = (e: MouseEvent) => {
      if (!dismissible || e.target !== d) return;
      const r = d.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside || getComputedStyle(d).backgroundColor === 'rgba(0, 0, 0, 0)') void closeDialog(d);
    };
    d.addEventListener('close', onCloseEv);
    d.addEventListener('cancel', onCancel);
    d.addEventListener('click', onClick);
    return () => {
      d.removeEventListener('close', onCloseEv);
      d.removeEventListener('cancel', onCancel);
      d.removeEventListener('click', onClick);
    };
  }, [onClose, dismissible]);
  return ref;
}

/**
 * Bottom sheet on phones, centered dialog on larger screens. Native <dialog> (focus trap,
 * Esc/back, top layer) with smooth enter/exit transitions.
 */
export function Sheet({ open, onClose, title, icon, children }: { open: boolean; onClose: () => void; title: string; icon?: IconName; children: ReactNode }) {
  const ref = useDialog(open, onClose);
  const titleId = useId();
  const t = useT();
  return (
    <dialog ref={ref} className="sheet" aria-labelledby={titleId}>
      <div className="grabber" />
      <div className="sheet-body">
        <div className="sheet-head">
          {icon && <span className="icon-tile tone-primary" style={{ width: 38, height: 38 }} aria-hidden><Icon name={icon} size={20} /></span>}
          <h2 id={titleId}>{title}</h2>
          <button className="btn icon sm ghost" onClick={() => ref.current && void closeDialog(ref.current)} aria-label={t('Close', 'বন্ধ করুন')}>
            <Icon name="close" size={20} />
          </button>
        </div>
        {open && children}
      </div>
    </dialog>
  );
}

/** Centered modal card for important moments (invites, updates, permissions). */
export function Modal({ open, onClose, label, dismissible = true, children }: { open: boolean; onClose: () => void; label: string; dismissible?: boolean; children: ReactNode }) {
  const ref = useDialog(open, onClose, dismissible);
  return (
    <dialog ref={ref} className="modal" aria-label={label}>
      {open && <div className="modal-card">{children}</div>}
    </dialog>
  );
}
