import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => {
    const d = ref.current!;
    const h = () => onClose();
    d.addEventListener('close', h);
    return () => d.removeEventListener('close', h);
  }, [onClose]);
  return (
    <dialog ref={ref} className={`modal${wide ? ' wide' : ''}`} aria-label={title}>
      <div className="m-head"><h2>{title}</h2><button className="btn ghost icon-btn" onClick={() => ref.current?.close()} aria-label="Close" title="Close"><Icon name="close" /></button></div>
      <div className="m-body">{open && children}</div>
    </dialog>
  );
}

export function Pager({ page, setPage, hasMore, total, pageSize }: { page: number; setPage: (p: number) => void; hasMore: boolean; total?: number; pageSize?: number }) {
  return (
    <div className="pager">
      {total !== undefined && <span className="small muted">{total.toLocaleString()} total{pageSize ? ` · page ${page} of ${Math.max(1, Math.ceil(total / pageSize))}` : ''}</span>}
      <button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><Icon name="chevron-left" size={16} />Previous</button>
      <button className="btn sm" disabled={!hasMore} onClick={() => setPage(page + 1)} aria-label="Next page">Next<Icon name="chevron-right" size={16} /></button>
    </div>
  );
}

export function Loading({ rows = 5 }: { rows?: number }) {
  return <div aria-busy="true">{Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" />)}</div>;
}

export const fmtDate = (v: string | null | undefined) => (v ? new Date(v).toLocaleString() : '—');

export function StatusBadge({ status }: { status: string }) {
  const cls = { active: 'green', suspended: 'amber', banned: 'red', deleted: '', open: 'amber', reviewing: 'blue', dismissed: '', actioned: 'green', finished: 'green', aborted: 'red', lobby: 'blue' }[status] ?? '';
  return <span className={`badge ${cls}`}>{status}</span>;
}
