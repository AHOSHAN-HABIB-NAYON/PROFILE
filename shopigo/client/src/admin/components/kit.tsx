import { useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { GripVertical, ImagePlus, LoaderCircle, Search, Star, X } from 'lucide-react';
import { api } from '../../lib/api';
import { cx, money } from '../../lib/format';
import { img } from '../../lib/image';
import { Button, Input, Picture, Sheet, toast } from '../../components/ui';

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<{ authenticated: boolean; mustSetup2fa?: boolean; mfaRequired?: boolean; passkeysEnabled?: boolean; admin?: { id: number; name: string; email: string; role: string; permissions: string[]; authMethod: string } }>('/api/auth/me'),
    staleTime: 60_000,
  });
}

export function useCan() {
  const { data } = useMe();
  return (perm: string) => Boolean(data?.admin && (data.admin.permissions.includes('*') || data.admin.permissions.includes(perm)));
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back}
        <h1 className="text-[22px] font-extrabold tracking-tight md:text-[26px]">{title}</h1>
        {subtitle && <p className="text-[13.5px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, actions, children, className, pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx('card', pad && 'p-5', className)}>
      {(title || actions) && (
        <div className={cx('mb-4 flex items-center justify-between gap-3', !pad && 'px-5 pt-5')}>
          {title && <h2 className="text-[15px] font-bold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatCard({ label, value, icon, tone = 'brand', change, hint, to }: { label: string; value: ReactNode; icon: ReactNode; tone?: 'brand' | 'green' | 'blue' | 'violet' | 'red' | 'amber'; change?: number; hint?: ReactNode; to?: string }) {
  const tones = { brand: 'bg-brand-50 text-brand-600', green: 'bg-green-50 text-green-600', blue: 'bg-blue-50 text-blue-600', violet: 'bg-violet-50 text-violet-600', red: 'bg-red-50 text-red-600', amber: 'bg-amber-50 text-amber-600' };
  const body = (
    <div className="card h-full p-4 transition hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-2">
        <span className={cx('grid size-10 place-items-center rounded-2xl', tones[tone])}>{icon}</span>
        {change !== undefined && <span className={cx('chip', change >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')}>{change >= 0 ? '▲' : '▼'} {Math.abs(change)}%</span>}
      </div>
      <p className="mt-3 text-[12.5px] font-semibold text-muted">{label}</p>
      <p className="text-[22px] font-extrabold tracking-tight tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-[12px] text-muted">{hint}</p>}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export const STATUS_TONES: Record<string, string> = {
  new: 'bg-blue-50 text-blue-700', pending: 'bg-amber-50 text-amber-700', confirmed: 'bg-teal-50 text-teal-700', processing: 'bg-violet-50 text-violet-700',
  courier_sent: 'bg-cyan-50 text-cyan-700', in_transit: 'bg-indigo-50 text-indigo-700', delivered: 'bg-green-50 text-green-700', cancelled: 'bg-red-50 text-red-700', returned: 'bg-rose-50 text-rose-800',
};
export const STATUS_LABELS: Record<string, string> = { new: 'New', pending: 'Pending', confirmed: 'Confirmed', processing: 'Processing', courier_sent: 'Courier Sent', in_transit: 'In Transit', delivered: 'Delivered', cancelled: 'Cancelled', returned: 'Returned' };

export function StatusBadge({ status }: { status: string }) {
  return <span className={cx('chip whitespace-nowrap', STATUS_TONES[status] ?? 'bg-soft text-ink-2')}>{STATUS_LABELS[status] ?? status}</span>;
}

export function RiskBadge({ level, score }: { level: string; score?: number }) {
  const tone = level === 'HIGH' ? 'bg-red-600 text-white' : level === 'MEDIUM' ? 'bg-amber-100 text-amber-800' : 'bg-green-50 text-green-700';
  return <span className={cx('chip', tone)}>{level}{score !== undefined ? ` · ${score}` : ''}</span>;
}

export interface Column<T> { key: string; label: ReactNode; render: (row: T) => ReactNode; className?: string; hideOnMobile?: boolean }

/** Responsive table: rows become cards on mobile. */
export function DataTable<T>({ rows, columns, rowKey, onRowClick, empty, loading, selectable, selected, onSelect }: { rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string | number; onRowClick?: (r: T) => void; empty?: ReactNode; loading?: boolean; selectable?: boolean; selected?: Set<string | number>; onSelect?: (s: Set<string | number>) => void }) {
  if (loading) return <div className="grid h-40 place-items-center"><LoaderCircle className="size-6 animate-spin text-brand-500" /></div>;
  if (!rows.length) return <div className="px-5 py-12 text-center text-[14px] text-muted">{empty ?? 'Nothing here yet.'}</div>;
  const toggle = (k: string | number) => { const n = new Set(selected); if (n.has(k)) n.delete(k); else n.add(k); onSelect?.(n); };
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-[13.5px]">
          <thead>
            <tr className="border-b border-line text-[12px] font-semibold text-muted">
              {selectable && <th className="w-10 px-4 py-3"><input type="checkbox" className="accent-brand-500" checked={rows.length > 0 && rows.every((r) => selected?.has(rowKey(r)))} onChange={(e) => onSelect?.(new Set(e.target.checked ? rows.map(rowKey) : []))} /></th>}
              {columns.map((c) => <th key={c.key} className={cx('px-4 py-3 whitespace-nowrap', c.className)}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={rowKey(r)} onClick={() => onRowClick?.(r)} className={cx('border-b border-line/70 last:border-0', onRowClick && 'cursor-pointer hover:bg-soft/60')}>
                {selectable && <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="accent-brand-500" checked={selected?.has(rowKey(r)) ?? false} onChange={() => toggle(rowKey(r))} /></td>}
                {columns.map((c) => <td key={c.key} className={cx('px-4 py-3 align-middle', c.className)}>{c.render(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-line md:hidden">
        {rows.map((r) => (
          <li key={rowKey(r)} onClick={() => onRowClick?.(r)} className={cx('flex gap-3 px-4 py-3', onRowClick && 'active:bg-soft')}>
            {selectable && <input type="checkbox" className="mt-1 accent-brand-500" checked={selected?.has(rowKey(r)) ?? false} onClick={(e) => e.stopPropagation()} onChange={() => toggle(rowKey(r))} />}
            <div className="min-w-0 flex-1 space-y-1">
              {columns.filter((c) => !c.hideOnMobile).map((c, i) => (
                <div key={c.key} className={cx('flex items-center justify-between gap-3 text-[13px]', i === 0 && 'text-[14px] font-semibold')}>
                  {i > 0 && <span className="shrink-0 text-muted">{c.label}</span>}
                  <span className={cx('min-w-0', i > 0 && 'text-right')}>{c.render(r)}</span>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="relative block min-w-[200px] flex-1">
      <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="input !h-10 !rounded-full !py-0 !pl-10 !text-[13.5px]" />
    </label>
  );
}

export interface UploadedImage { path: string; width?: number | null; height?: number | null; alt?: string | null; id?: number }

export async function uploadImages(files: File[], folder: string, kind: 'image' | 'icon' | 'logo' = 'image'): Promise<UploadedImage[]> {
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  return api.upload<UploadedImage[]>(`/api/admin/catalog/uploads?folder=${folder}&kind=${kind}`, fd);
}

/** Drag & drop multi-image uploader with reordering; the first image is the main one. */
export function ImageUploader({ value, onChange, folder, max = 12, single }: { value: UploadedImage[]; onChange: (v: UploadedImage[]) => void; folder: string; max?: number; single?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const dragIndex = useRef<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const add = async (files: File[]) => {
    const list = files.filter((f) => f.type.startsWith('image/')).slice(0, single ? 1 : max - value.length);
    if (!list.length) return;
    setBusy(true);
    try {
      const up = await uploadImages(list, folder);
      const saved = list.reduce((s, f) => s + f.size, 0);
      toast.success(`Uploaded & optimised ${up.length} image(s) (${(saved / 1024 / 1024).toFixed(1)} MB original)`);
      onChange(single ? up.slice(0, 1) : [...value, ...up]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const move = (from: number, to: number) => { const n = [...value]; const [m] = n.splice(from, 1); n.splice(to, 0, m!); onChange(n); };
  return (
    <div>
      <div className={cx('grid gap-3', single ? 'grid-cols-1' : 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-5')}>
        {value.map((im, i) => (
          <div
            key={im.path}
            draggable={!single}
            onDragStart={() => (dragIndex.current = i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragIndex.current !== null && dragIndex.current !== i) move(dragIndex.current, i); dragIndex.current = null; }}
            className={cx('group relative overflow-hidden rounded-2xl bg-soft ring-2', i === 0 && !single ? 'ring-brand-400' : 'ring-transparent', single ? 'aspect-[16/7]' : 'aspect-square')}
          >
            <img src={img(im.path, 'thumb')} alt="" className="size-full object-cover" />
            {!single && i === 0 && <span className="chip absolute bottom-1.5 left-1.5 bg-brand-500 text-white"><Star className="size-3 fill-current" />Main</span>}
            <div className="absolute inset-x-0 top-0 flex justify-between p-1.5 opacity-100 md:opacity-0 md:group-hover:opacity-100">
              {!single ? <span className="grid size-7 cursor-grab place-items-center rounded-full bg-white/90 text-ink-2"><GripVertical className="size-4" /></span> : <span />}
              <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="grid size-7 place-items-center rounded-full bg-white/90 text-danger" aria-label="Remove"><X className="size-4" /></button>
            </div>
            {!single && i > 0 && <button type="button" onClick={() => move(i, 0)} className="absolute right-1.5 bottom-1.5 rounded-full bg-white/90 px-2 py-0.5 text-[10.5px] font-bold opacity-100 md:opacity-0 md:group-hover:opacity-100">Set main</button>}
          </div>
        ))}
        {(single ? value.length === 0 : value.length < max) && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); void add([...e.dataTransfer.files]); }}
            className={cx('flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed text-[12px] font-semibold text-muted transition', single ? 'aspect-[16/7]' : 'aspect-square', over ? 'border-brand-400 bg-brand-50 text-brand-600' : 'border-line hover:border-brand-300 hover:text-brand-600')}
          >
            {busy ? <LoaderCircle className="size-6 animate-spin" /> : <ImagePlus className="size-6" />}
            {busy ? 'Optimising…' : 'Drop or click'}
          </button>
        )}
      </div>
      <input ref={input} type="file" hidden multiple={!single} accept="image/jpeg,image/png,image/webp,image/avif" onChange={(e) => { void add([...(e.target.files ?? [])]); e.target.value = ''; }} />
    </div>
  );
}

export function SingleImage({ value, onChange, folder, kind = 'image', label }: { value: string | null; onChange: (v: string | null) => void; folder: string; kind?: 'image' | 'icon' | 'logo'; label?: string }) {
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const preview = !value ? null : kind === 'icon' ? `/uploads/${value}-192.png` : kind === 'logo' ? `/uploads/${value}-logo.webp` : img(value, 'thumb');
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-soft">{preview ? <img src={preview} alt="" className="size-full object-contain" /> : <ImagePlus className="size-5 text-muted" />}</div>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="soft" loading={busy} onClick={() => ref.current?.click()}>{value ? 'Replace' : label ?? 'Upload'}</Button>
        {value && <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>Remove</Button>}
      </div>
      <input ref={ref} type="file" hidden accept="image/jpeg,image/png,image/webp,image/avif" onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        setBusy(true);
        try { const [up] = await uploadImages([f], folder, kind); onChange(up!.path); } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
      }} />
    </div>
  );
}

export interface LookupProduct { id: number; name: string; sku: string | null; price: number; sale_price: number | null; stock: number; has_variants: number; variants: Array<{ id: number; size: string | null; color: string | null; stock: number; price: number | null; sale_price: number | null }> }

export function ProductPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (p: LookupProduct, variantId?: number | null) => void }) {
  const [q, setQ] = useState('');
  const { data, isFetching } = useQuery({ queryKey: ['product-lookup', q], queryFn: () => api.get<LookupProduct[]>(`/api/admin/products/lookup?q=${encodeURIComponent(q)}`), enabled: open });
  return (
    <Sheet open={open} onClose={onClose} title="Choose product">
      <Input autoFocus placeholder="Search name or SKU…" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="mt-3 divide-y divide-line">
        {isFetching && !data && <li className="py-6 text-center"><LoaderCircle className="mx-auto size-5 animate-spin text-brand-500" /></li>}
        {data?.map((p) => (
          <li key={p.id} className="py-2.5">
            <button type="button" onClick={() => { if (!p.variants.length) { onPick(p, null); onClose(); } }} className="flex w-full items-center justify-between gap-3 text-left">
              <span className="min-w-0"><span className="block truncate text-[14px] font-semibold">{p.name}</span><span className="text-[12px] text-muted">{p.sku ?? `#${p.id}`} · stock {p.stock}</span></span>
              <span className="text-[13px] font-bold">{money(p.sale_price ?? p.price)}</span>
            </button>
            {p.variants.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {p.variants.map((v) => <button type="button" key={v.id} disabled={v.stock <= 0} onClick={() => { onPick(p, v.id); onClose(); }} className="rounded-lg bg-soft px-2.5 py-1 text-[12px] font-semibold hover:bg-brand-50 disabled:opacity-40">{[v.color, v.size].filter(Boolean).join(' · ')} ({v.stock})</button>)}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

export function Thumb({ path, className }: { path: string | null; className?: string }) {
  return <Picture path={path} alt="" size="thumb" className={cx('size-11 shrink-0 rounded-xl', className)} sizes="48px" />;
}
