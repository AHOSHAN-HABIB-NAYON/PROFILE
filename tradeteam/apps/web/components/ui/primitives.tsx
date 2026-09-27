'use client';
import {
  forwardRef,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { Icon, type IconName } from './icons';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'buy' | 'sell' | 'danger' | 'outline';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-2 shadow-sm',
  secondary: 'bg-card-2 text-fg hover:bg-line',
  ghost: 'text-fg-2 hover:bg-card-2',
  outline: 'border border-line-strong text-fg hover:bg-card-2',
  buy: 'bg-up text-white hover:brightness-110 shadow-sm',
  sell: 'bg-down text-white hover:brightness-110 shadow-sm',
  danger: 'bg-down-soft text-down hover:brightness-95',
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    size?: 'sm' | 'md' | 'lg';
    loading?: boolean;
    icon?: IconName;
    block?: boolean;
  }
>(function Button(
  { variant = 'primary', size = 'md', loading, icon, block, className, children, disabled, ...rest },
  ref,
) {
  const sz =
    size === 'sm'
      ? 'h-8 px-3 text-[13px] rounded-lg'
      : size === 'lg'
        ? 'h-12 px-5 text-[15px] rounded-2xl'
        : 'h-10 px-4 text-sm rounded-xl';
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 font-semibold transition active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none select-none',
        sz,
        VARIANTS[variant],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={16} /> : icon ? <Icon name={icon} size={size === 'sm' ? 15 : 18} /> : null}
      {children}
    </button>
  );
});

export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={cx('animate-spin', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-label="Loading"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Card({
  className,
  children,
  padded = true,
  ...rest
}: { className?: string; children: ReactNode; padded?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx('bg-card rounded-2xl border border-line shadow-card', padded && 'p-4 sm:p-5', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-[15px] font-semibold text-fg">{children}</h2>
      {action}
    </div>
  );
}

export const Input = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'suffix'> & {
    label?: ReactNode;
    hint?: ReactNode;
    error?: string | null;
    icon?: IconName;
    suffix?: ReactNode;
  }
>(function Input({ label, hint, error, icon, suffix, className, id, type, ...rest }, ref) {
  const auto = useId();
  const inputId = id ?? auto;
  const [show, setShow] = useState(false);
  const isPw = type === 'password';
  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="block text-[13px] font-medium text-fg-2 mb-1.5">
          {label}
        </label>
      )}
      <div
        className={cx(
          'flex items-center gap-2 h-12 rounded-xl border bg-elev px-3.5 transition focus-within:ring-2 focus-within:ring-accent/30',
          error ? 'border-down' : 'border-line-strong focus-within:border-accent',
        )}
      >
        {icon && <Icon name={icon} size={18} className="text-muted shrink-0" />}
        <input
          ref={ref}
          id={inputId}
          type={isPw && show ? 'text' : type}
          className="flex-1 min-w-0 bg-transparent outline-none text-[15px] text-fg placeholder:text-faint num"
          aria-invalid={Boolean(error)}
          {...rest}
        />
        {isPw && (
          <button
            type="button"
            className="text-muted"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Hide password' : 'Show password'}
          >
            <Icon name={show ? 'eyeOff' : 'eye'} size={18} />
          </button>
        )}
        {suffix}
      </div>
      {error ? (
        <p className="text-[12px] text-down mt-1">{error}</p>
      ) : hint ? (
        <p className="text-[12px] text-muted mt-1">{hint}</p>
      ) : null}
    </div>
  );
});

export function Select({
  label,
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  const id = useId();
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="block text-[13px] font-medium text-fg-2 mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={id}
          className="appearance-none w-full h-12 rounded-xl border border-line-strong bg-elev pl-3.5 pr-9 text-[15px] text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          {...rest}
        >
          {children}
        </select>
        <Icon
          name="chevronDown"
          size={16}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
        />
      </div>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={cx('flex items-center justify-between gap-4 py-2', disabled && 'opacity-50')}>
      {(label || description) && (
        <span>
          <span className="block text-sm font-medium text-fg">{label}</span>
          {description && <span className="block text-[12px] text-muted mt-0.5">{description}</span>}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative w-11 h-6 rounded-full transition shrink-0',
          checked ? 'bg-accent' : 'bg-line-strong',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition',
            checked && 'translate-x-5',
          )}
        />
      </button>
    </label>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
  size = 'md',
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: ReactNode }[];
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      className={cx('flex gap-1 p-1 rounded-xl bg-card-2 overflow-x-auto no-scrollbar', className)}
      role="tablist"
    >
      {items.map((i) => (
        <button
          key={i.value}
          role="tab"
          aria-selected={value === i.value}
          onClick={() => onChange(i.value)}
          className={cx(
            'shrink-0 rounded-lg font-semibold transition whitespace-nowrap',
            size === 'sm' ? 'px-2.5 h-7 text-[12px]' : 'px-3.5 h-9 text-[13px]',
            value === i.value ? 'bg-card text-fg shadow-sm' : 'text-muted hover:text-fg',
          )}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}

export function Pills<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: ReactNode }[];
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
      {items.map((i) => (
        <button
          key={i.value}
          onClick={() => onChange(i.value)}
          className={cx(
            'shrink-0 h-8 px-3 rounded-full text-[13px] font-semibold transition',
            value === i.value ? 'bg-accent text-accent-fg' : 'bg-card-2 text-muted hover:text-fg',
          )}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'up' | 'down' | 'warn' | 'accent';
  children: ReactNode;
}) {
  const t = {
    neutral: 'bg-card-2 text-fg-2',
    up: 'bg-up-soft text-up',
    down: 'bg-down-soft text-down',
    warn: 'bg-warn-soft text-warn',
    accent: 'bg-accent-soft text-accent',
  }[tone];
  return (
    <span
      className={cx(
        'inline-flex items-center h-6 px-2 rounded-md text-[11px] font-semibold uppercase tracking-wide',
        t,
      )}
    >
      {children}
    </span>
  );
}

export function statusTone(s: string): 'neutral' | 'up' | 'down' | 'warn' | 'accent' {
  if (['filled', 'completed', 'credited', 'active', 'trading', 'ok', 'approved', 'verified'].includes(s))
    return 'up';
  if (
    ['rejected', 'failed', 'cancelled', 'suspended', 'delisted', 'closed', 'disabled', 'expired'].includes(s)
  )
    return 'down';
  if (
    ['pending', 'manual_review', 'confirming', 'processing', 'partially_filled', 'halted', 'locked'].includes(
      s,
    )
  )
    return 'warn';
  return 'accent';
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone(status)}>{status.replace(/_/g, ' ')}</Badge>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton rounded-lg', className)} />;
}

export function Empty({
  icon = 'info',
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <div className="w-12 h-12 rounded-2xl bg-accent-soft text-accent flex items-center justify-center mb-3">
        <Icon name={icon} size={22} />
      </div>
      <p className="font-semibold text-fg">{title}</p>
      {description && <p className="text-sm text-muted mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl bg-down-soft text-down px-4 py-3 text-sm flex items-start gap-2">
      <Icon name="alert" size={18} className="shrink-0 mt-0.5" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button className="font-semibold underline" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function InfoBox({ children, tone = 'accent' }: { children: ReactNode; tone?: 'accent' | 'warn' }) {
  return (
    <div
      className={cx(
        'rounded-xl px-4 py-3 text-[13px] flex gap-2',
        tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-accent-soft text-accent',
      )}
    >
      <Icon name="info" size={18} className="shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function Row({ label, value, className }: { label: ReactNode; value: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-center justify-between gap-3 py-1.5 text-[13px]', className)}>
      <span className="text-muted">{label}</span>
      <span className="text-fg font-medium num text-right">{value}</span>
    </div>
  );
}

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      <Icon name={done ? 'check' : 'copy'} size={16} />
      {label ?? (done ? 'Copied' : 'Copy')}
    </button>
  );
}

export function Avatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return url ? (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      className="rounded-full object-cover bg-card-2"
      style={{ width: size, height: size }}
    />
  ) : (
    <div
      className="rounded-full bg-accent text-accent-fg font-bold flex items-center justify-center"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials || '?'}
    </div>
  );
}
