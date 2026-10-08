/** Bangladesh Standard Time (UTC+6, no DST). Daily streaks/challenges roll over at BD midnight. */
const BD_OFFSET_MS = 6 * 60 * 60 * 1000;

export function bdDateKey(d = new Date()): string {
  return new Date(d.getTime() + BD_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** ISO week key, e.g. 2026-W41, in BD time. */
export function bdWeekKey(d = new Date()): string {
  const local = new Date(d.getTime() + BD_OFFSET_MS);
  const date = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function bdMonthKey(d = new Date()): string {
  return bdDateKey(d).slice(0, 7);
}

/** MySQL DATE columns may come back as Date objects; normalise to YYYY-MM-DD. */
export function toDateKey(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}
