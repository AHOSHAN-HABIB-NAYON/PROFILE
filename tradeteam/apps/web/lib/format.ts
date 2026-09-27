import { dec } from '@tradeteam/shared';

/** Display formatting of decimal strings. Never used for calculations sent to the server. */
export function fmtNum(v: string | number | null | undefined, maxDp = 8, minDp = 0): string {
  if (v === null || v === undefined || v === '') return '—';
  const d = dec(v);
  const dp = Math.max(minDp, Math.min(maxDp, d.decimalPlaces()));
  const [int, rawFrac = ''] = d.toFixed(dp).split('.');
  // Rounding can leave trailing zeros (0.30000000): trim them, but keep at least `minDp` decimals.
  let frac = rawFrac;
  while (frac.length > minDp && frac.endsWith('0')) frac = frac.slice(0, -1);
  const withSep = int!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac ? `${withSep}.${frac}` : withSep;
}

export function fmtPrice(v: string | null | undefined, precision?: number) {
  if (!v) return '—';
  if (precision !== undefined) return fmtNum(v, precision, Math.min(precision, 2));
  const n = Math.abs(Number(v));
  const dp = n >= 1000 ? 2 : n >= 1 ? 4 : n >= 0.01 ? 6 : 8;
  return fmtNum(v, dp, Math.min(dp, 2));
}

export function fmtCompact(v: string | number | null | undefined) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(n);
}

export function fmtUsd(v: string | null | undefined, currency = 'USDT') {
  if (v === null || v === undefined) return '—';
  const sym = currency === 'USD' || currency === 'USDT' || currency === 'USDC' ? '$' : '';
  const neg = v.startsWith('-');
  return `${neg ? '-' : ''}${sym}${fmtNum(neg ? v.slice(1) : v, 2, 2)}${sym ? '' : ` ${currency}`}`;
}

export function fmtPct(v: string | null | undefined) {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
}

export function signClass(v: string | number | null | undefined) {
  const n = Number(v ?? 0);
  return n > 0 ? 'text-up' : n < 0 ? 'text-down' : 'text-muted';
}

export function fmtTime(ts: string | number | Date) {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function fmtDateTime(ts: string | number | Date | null | undefined) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function timeAgo(ts: string | number | Date) {
  const s = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return `${Math.max(1, s)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
