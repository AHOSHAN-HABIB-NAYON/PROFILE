import Decimal from 'decimal.js';

/**
 * Financial decimal configuration. 40 significant digits comfortably covers DECIMAL(36,18).
 * All server-side money math must go through this module.
 */
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_DOWN, toExpNeg: -30, toExpPos: 40 });
export type D = Decimal;

export function dec(v: Decimal.Value | null | undefined): Decimal {
  if (v === null || v === undefined || v === '') return new D(0);
  return new D(v);
}

/** Truncate (never round up) to `places` decimals — used for quantities and balances. */
export function floorTo(v: Decimal.Value, places: number): Decimal {
  return new D(v).toDecimalPlaces(places, Decimal.ROUND_DOWN);
}

export function ceilTo(v: Decimal.Value, places: number): Decimal {
  return new D(v).toDecimalPlaces(places, Decimal.ROUND_UP);
}

/** Plain fixed string without exponent, trimmed of trailing zeros. */
export function fmt(v: Decimal.Value): string {
  const s = new D(v).toFixed();
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/** Fixed string with exactly `places` decimals (DB-safe for DECIMAL(36,18)). */
export function toDb(v: Decimal.Value, places = 18): string {
  return new D(v).toFixed(places, Decimal.ROUND_DOWN);
}

export function isDecimalString(v: unknown): v is string {
  return typeof v === 'string' && /^\d{1,18}(\.\d{1,18})?$/.test(v);
}

/** Number of decimal places implied by a step/tick size such as "0.0100". */
export function stepToPrecision(step: string): number {
  const d = new D(step);
  if (d.lte(0)) return 8;
  return Math.max(0, d.decimalPlaces());
}
