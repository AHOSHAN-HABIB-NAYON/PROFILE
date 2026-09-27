const nf = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export function money(value: number | string | null | undefined, symbol = '৳'): string {
  const n = Number(value ?? 0);
  return `${symbol}${nf.format(Math.round(n * 100) / 100)}`;
}

export function num(value: number | string | null | undefined): string {
  return nf.format(Number(value ?? 0));
}

const BN = '০১২৩৪৫৬৭৮৯';
export function bnDigits(s: string | number): string {
  return String(s).replace(/\d/g, (d) => BN[Number(d)]!);
}

export function dateTime(value: string | Date | null | undefined, tz = 'Asia/Dhaka'): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(value));
}

export function dateOnly(value: string | Date | null | undefined, tz = 'Asia/Dhaka'): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

export function timeAgo(value: string | Date): string {
  const s = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return dateOnly(value);
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
