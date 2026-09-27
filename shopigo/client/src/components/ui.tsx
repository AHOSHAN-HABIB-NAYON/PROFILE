import { forwardRef, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { CircleAlert, CircleCheck, Info, LoaderCircle, Minus, Plus, X } from 'lucide-react';
import { cx } from '../lib/format';
import { img, srcSet, type ImgSize } from '../lib/image';

// ------------------------------------------------------------ Button
type Variant = 'primary' | 'outline' | 'soft' | 'ghost' | 'danger' | 'dark' | 'success';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-gradient-to-b from-brand-400 to-brand-500 text-white shadow-[var(--shadow-float)] hover:from-brand-500 hover:to-brand-600 disabled:from-brand-200 disabled:to-brand-200 disabled:shadow-none',
  outline: 'border border-brand-300 bg-surface text-brand-600 hover:bg-brand-50 disabled:opacity-50',
  soft: 'bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-50',
  ghost: 'text-ink-2 hover:bg-soft disabled:opacity-50',
  danger: 'bg-danger text-white hover:brightness-95 disabled:opacity-50',
  dark: 'bg-ink text-white hover:bg-ink-2 disabled:opacity-50',
  success: 'bg-success text-white hover:brightness-95 disabled:opacity-50',
};
const SIZES = { sm: 'h-9 px-3.5 text-[13px] rounded-xl gap-1.5', md: 'h-11 px-5 text-[14px] rounded-2xl gap-2', lg: 'h-[52px] px-6 text-[15px] rounded-2xl gap-2' };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; size?: keyof typeof SIZES; loading?: boolean; icon?: ReactNode; block?: boolean }
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'primary', size = 'md', loading, icon, block, className, children, disabled, ...rest }, ref) {
  return (
    <button ref={ref} className={cx('press inline-flex select-none items-center justify-center font-bold whitespace-nowrap transition disabled:cursor-not-allowed', VARIANTS[variant], SIZES[size], block && 'w-full', className)} disabled={disabled || loading} {...rest}>
      {loading ? <LoaderCircle className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

// ------------------------------------------------------------ Form fields
export function Field({ label, error, hint, required, children, className }: { label?: ReactNode; error?: string | null; hint?: ReactNode; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="label">{label}{required && <span className="text-danger"> *</span>}</span>}
      {children}
      {error ? <span className="mt-1 block text-[12px] font-medium text-danger">{error}</span> : hint ? <span className="mt-1 block text-[12px] text-muted">{hint}</span> : null}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input({ className, invalid, ...rest }, ref) {
  return <input ref={ref} className={cx('input', invalid && 'border-danger/60 focus:ring-red-100', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx('input min-h-[96px] resize-y', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function Select({ className, invalid, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cx('input appearance-none bg-[length:16px] bg-[right_14px_center] bg-no-repeat pr-10', invalid && 'border-danger/60', className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238c7c70' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...rest}>
      {children}
    </select>
  );
});

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; description?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cx('flex items-start justify-between gap-4', disabled ? 'opacity-50' : 'cursor-pointer')}>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-[14px] font-semibold text-ink">{label}</span>}
          {description && <span className="mt-0.5 block text-[12.5px] text-muted">{description}</span>}
        </span>
      )}
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className={cx('relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition', checked ? 'bg-brand-500' : 'bg-[#e6dbd1]')}>
        <span className={cx('absolute top-1 left-1 size-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
      </button>
    </label>
  );
}

// ------------------------------------------------------------ Feedback
export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cx('animate-spin text-brand-500', className ?? 'size-6')} />;
}

export function PageSpinner() {
  return <div className="grid min-h-[40vh] place-items-center"><Spinner className="size-8" /></div>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-2xl bg-[#f1e6dc]', className)} />;
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: ReactNode; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icon && <div className="mb-4 grid size-20 place-items-center rounded-[28px] bg-brand-50 text-brand-500">{icon}</div>}
      <h3 className="text-[17px] font-bold">{title}</h3>
      {text && <p className="mt-1 max-w-sm text-[14px] text-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Badge({ children, tone = 'brand', className }: { children: ReactNode; tone?: 'brand' | 'green' | 'red' | 'gray' | 'blue' | 'amber' | 'violet'; className?: string }) {
  const tones = { brand: 'bg-brand-50 text-brand-700', green: 'bg-green-50 text-green-700', red: 'bg-red-50 text-red-700', gray: 'bg-[#f3ede7] text-ink-2', blue: 'bg-blue-50 text-blue-700', amber: 'bg-amber-50 text-amber-700', violet: 'bg-violet-50 text-violet-700' };
  return <span className={cx('chip', tones[tone], className)}>{children}</span>;
}

// ------------------------------------------------------------ Toasts
interface Toast { id: number; kind: 'success' | 'error' | 'info'; text: string; action?: { label: string; onClick: () => void } }
const useToasts = create<{ list: Toast[]; push: (t: Omit<Toast, 'id'>) => void; drop: (id: number) => void }>((set) => ({
  list: [],
  push: (t) => {
    const id = Date.now() + Math.random();
    set((s) => ({ list: [...s.list.slice(-2), { ...t, id }] }));
    setTimeout(() => set((s) => ({ list: s.list.filter((x) => x.id !== id) })), t.kind === 'error' ? 5000 : 2800);
  },
  drop: (id) => set((s) => ({ list: s.list.filter((x) => x.id !== id) })),
}));

export const toast = {
  success: (text: string, action?: Toast['action']) => useToasts.getState().push({ kind: 'success', text, action }),
  error: (text: string) => useToasts.getState().push({ kind: 'error', text }),
  info: (text: string) => useToasts.getState().push({ kind: 'info', text }),
};

export function Toaster() {
  const { list, drop } = useToasts();
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-3">
      {list.map((t) => (
        <div key={t.id} className="pointer-events-auto flex w-full max-w-sm animate-[var(--animate-fade-up)] items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-[14px] text-white shadow-2xl">
          {t.kind === 'success' ? <CircleCheck className="size-5 shrink-0 text-green-400" /> : t.kind === 'error' ? <CircleAlert className="size-5 shrink-0 text-red-400" /> : <Info className="size-5 shrink-0 text-blue-300" />}
          <span className="min-w-0 flex-1">{t.text}</span>
          {t.action && <button className="font-bold text-brand-300" onClick={() => { t.action!.onClick(); drop(t.id); }}>{t.action.label}</button>}
        </div>
      ))}
    </div>,
    document.body,
  );
}

// ------------------------------------------------------------ Modal / bottom sheet
export function Sheet({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-[fade-up_.2s_ease-out] bg-[#1d130d]/45 backdrop-blur-[2px]" onClick={onClose} />
      <div className={cx('relative flex max-h-[92vh] w-full animate-[var(--animate-fade-up)] flex-col rounded-t-[28px] bg-surface shadow-2xl sm:rounded-[28px]', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
          <div className="text-[17px] font-bold">{title}</div>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full bg-soft text-ink-2 hover:bg-line" aria-label="Close"><X className="size-4" /></button>
        </div>
        <div className="overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <div className="safe-bottom border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function useConfirm() {
  const [state, setState] = useState<{ title: string; text?: string; danger?: boolean; confirmLabel?: string; resolve: (v: boolean) => void } | null>(null);
  const confirm = (title: string, opts: { text?: string; danger?: boolean; confirmLabel?: string } = {}) => new Promise<boolean>((resolve) => setState({ title, ...opts, resolve }));
  const dialog = (
    <Sheet open={Boolean(state)} onClose={() => { state?.resolve(false); setState(null); }} title={state?.title}>
      {state?.text && <p className="text-[14px] text-muted">{state.text}</p>}
      <div className="mt-5 flex gap-3">
        <Button variant="ghost" block onClick={() => { state?.resolve(false); setState(null); }}>Cancel</Button>
        <Button variant={state?.danger ? 'danger' : 'primary'} block onClick={() => { state?.resolve(true); setState(null); }}>{state?.confirmLabel ?? 'Confirm'}</Button>
      </div>
    </Sheet>
  );
  return { confirm, dialog };
}

// ------------------------------------------------------------ Images
export function Picture({ path, alt, size = 'md', sizes = '(max-width: 640px) 50vw, 25vw', className, imgClassName, priority, fit = 'cover' }: { path: string | null | undefined; alt: string; size?: ImgSize; sizes?: string; className?: string; imgClassName?: string; priority?: boolean; fit?: 'cover' | 'contain' }) {
  const [loaded, setLoaded] = useState(false);
  if (!path) return <div className={cx('grid place-items-center bg-soft text-muted', className)}><span className="text-[11px]">No image</span></div>;
  const external = /^(https?:|\/)/.test(path);
  return (
    <picture className={cx('block overflow-hidden bg-soft', className)}>
      {!external && <source type="image/avif" srcSet={srcSet(path, 'avif')} sizes={sizes} />}
      {!external && <source type="image/webp" srcSet={srcSet(path, 'webp')} sizes={sizes} />}
      <img
        src={img(path, size)}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : 'auto'}
        onLoad={() => setLoaded(true)}
        className={cx('size-full transition-opacity duration-300', fit === 'cover' ? 'object-cover' : 'object-contain', loaded ? 'opacity-100' : 'opacity-0', imgClassName)}
      />
    </picture>
  );
}

// ------------------------------------------------------------ Misc
export function QtyStepper({ value, onChange, min = 1, max = 99, size = 'md' }: { value: number; onChange: (v: number) => void; min?: number; max?: number; size?: 'sm' | 'md' }) {
  const s = size === 'sm' ? 'size-7' : 'size-9';
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-soft p-1">
      <button type="button" className={cx('press grid place-items-center rounded-full bg-surface text-ink-2 shadow-sm disabled:opacity-40', s)} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Decrease"><Minus className="size-3.5" /></button>
      <span className={cx('min-w-7 text-center font-bold tabular-nums', size === 'sm' ? 'text-[13px]' : 'text-[15px]')}>{value}</span>
      <button type="button" className={cx('press grid place-items-center rounded-full bg-surface text-ink-2 shadow-sm disabled:opacity-40', s)} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="Increase"><Plus className="size-3.5" /></button>
    </div>
  );
}

export function useCountdown(to: string | null | undefined) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!to) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [to]);
  const left = to ? Math.max(0, new Date(to).getTime() - now) : 0;
  return { d: Math.floor(left / 86400000), h: Math.floor((left / 3600000) % 24), m: Math.floor((left / 60000) % 60), s: Math.floor((left / 1000) % 60), done: left <= 0 };
}

export function Countdown({ to, compact }: { to: string; compact?: boolean }) {
  const { d, h, m, s } = useCountdown(to);
  const cells = [...(d > 0 ? [d] : []), h, m, s];
  return (
    <span className="inline-flex items-center gap-1 font-bold tabular-nums">
      {cells.map((v, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          <span className={cx('rounded-lg bg-ink text-white', compact ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-1 text-[13px]')}>{String(v).padStart(2, '0')}</span>
          {i < cells.length - 1 && <span className="text-ink-2">:</span>}
        </span>
      ))}
    </span>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs, className }: { value: T; onChange: (v: T) => void; tabs: Array<{ value: T; label: ReactNode }>; className?: string }) {
  return (
    <div className={cx('scrollbar-none flex gap-1 overflow-x-auto', className)}>
      {tabs.map((t) => (
        <button key={t.value} type="button" onClick={() => onChange(t.value)} className={cx('relative shrink-0 rounded-full px-4 py-2 text-[13.5px] font-semibold transition', value === t.value ? 'bg-brand-50 text-brand-700' : 'text-muted hover:text-ink')}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, total, limit, onChange }: { page: number; total: number; limit: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 py-4">
      <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onChange(page - 1)}>Prev</Button>
      <span className="text-[13px] text-muted tabular-nums">{page} / {pages}</span>
      <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</Button>
    </div>
  );
}
