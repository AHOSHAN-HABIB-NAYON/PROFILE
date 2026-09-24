'use strict';
/**
 * Exact decimal money helpers. Amounts are handled as strings / BigInt units
 * of 1/10000 — never as floating point numbers.
 */
const SCALE = 4n;
const FACTOR = 10n ** SCALE;
const RE = /^-?\d{1,12}(\.\d{1,4})?$/;

function isMoney(v) {
  return RE.test(String(v ?? '').trim());
}

function toUnits(v) {
  const s = String(v ?? '0').trim();
  if (!RE.test(s)) throw new Error(`Invalid amount: ${s}`);
  const neg = s.startsWith('-');
  const [i, f = ''] = s.replace('-', '').split('.');
  const units = BigInt(i) * FACTOR + BigInt((f + '0000').slice(0, 4));
  return neg ? -units : units;
}

function fromUnits(u) {
  const neg = u < 0n;
  const a = neg ? -u : u;
  const i = a / FACTOR;
  const f = (a % FACTOR).toString().padStart(4, '0');
  return `${neg ? '-' : ''}${i}.${f}`;
}

const normalize = (v) => fromUnits(toUnits(v));
const cmp = (a, b) => { const d = toUnits(a) - toUnits(b); return d === 0n ? 0 : d > 0n ? 1 : -1; };
const add = (a, b) => fromUnits(toUnits(a) + toUnits(b));
const sub = (a, b) => fromUnits(toUnits(a) - toUnits(b));
const neg = (a) => fromUnits(-toUnits(a));

/** Display: at least 2 decimals, up to 4 when needed (exact balance). */
function display(v) {
  const s = normalize(v);
  return s.replace(/(\.\d\d)(\d*?)0+$/, '$1$2');
}

module.exports = { isMoney, toUnits, fromUnits, normalize, cmp, add, sub, neg, display };
