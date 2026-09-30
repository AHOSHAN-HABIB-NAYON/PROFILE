/* ─────────────────────────────────────────────
   বাংলা সংখ্যা, তারিখ ও সময়ের হেল্পার (ঢাকার সময় ধরে)
   ───────────────────────────────────────────── */
const BD = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
export const bn = (n) => String(n ?? '').replace(/\d/g, (d) => BD[+d]);
export const en = (s) => String(s ?? '').replace(/[০-৯]/g, (d) => String(BD.indexOf(d)));

const MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];

/** "2026-09-30 10:15:00" (ঢাকার সময়) → ms */
export function ts(v) {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v > 1e12 ? v : v * 1000;
  const s = String(v || '').trim();
  if (!s) return NaN;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Date.parse(`${s}T00:00:00+06:00`);
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) return Date.parse(s);
  return Date.parse(s.replace(' ', 'T') + '+06:00');
}

/** ঢাকার সময়ের অংশগুলো */
export function dhaka(ms = Date.now()) {
  const d = new Date(ms + 6 * 3600 * 1000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), i: d.getUTCMinutes(), s: d.getUTCSeconds(), dow: d.getUTCDay() };
}
const p2 = (n) => String(n).padStart(2, '0');
export const todayStr = (ms = Date.now()) => { const x = dhaka(ms); return `${x.y}-${p2(x.m)}-${p2(x.d)}`; };
export const nowStr = (ms = Date.now()) => { const x = dhaka(ms); return `${x.y}-${p2(x.m)}-${p2(x.d)} ${p2(x.h)}:${p2(x.i)}:${p2(x.s)}`; };
export const dmy = (v) => { const x = dhaka(ts(v)); return `${p2(x.d)}/${p2(x.m)}/${x.y}`; };
export const iso = (v) => new Date(ts(v)).toISOString();

export function timeAgo(v) {
  const t = ts(v);
  if (Number.isNaN(t)) return '';
  const d = Math.floor((Date.now() - t) / 1000);
  if (d < 0) return 'এইমাত্র';
  if (d < 60) return `${bn(d)} সেকেন্ড আগে`;
  if (d < 3600) return `${bn(Math.floor(d / 60))} মিনিট আগে`;
  if (d < 86400) return `${bn(Math.floor(d / 3600))} ঘন্টা আগে`;
  if (d < 2592000) return `${bn(Math.floor(d / 86400))} দিন আগে`;
  if (d < 31536000) return `${bn(Math.floor(d / 2592000))} মাস আগে`;
  return `${bn(Math.floor(d / 31536000))} বছর আগে`;
}

export function bnDateTime(v) {
  const x = dhaka(ts(v));
  const ap = x.h < 6 ? 'ভোর' : x.h < 12 ? 'সকাল' : x.h < 16 ? 'দুপুর' : x.h < 19 ? 'বিকাল' : 'রাত';
  const h12 = x.h % 12 === 0 ? 12 : x.h % 12;
  return `${bn(x.d)} ${MONTHS[x.m - 1]} ${bn(x.y)}, ${ap} ${bn(p2(h12))}:${bn(p2(x.i))}`;
}
export const bnDate = (v) => { const x = dhaka(ts(v)); return `${bn(x.d)} ${MONTHS[x.m - 1]} ${bn(x.y)}`; };

/** আবেদনের সময় বাকি / শেষ */
export function deadlineInfo(deadline) {
  if (!deadline || deadline === '0000-00-00') return { state: 'none', text: '', days: null };
  const end = ts(`${String(deadline).slice(0, 10)} 23:59:59`);
  const diff = end - Date.now();
  if (diff <= 0) return { state: 'over', text: 'আবেদনের সময় শেষ', days: -1 };
  const days = Math.floor(diff / 86400000);
  if (days === 0) return { state: 'urgent', text: 'আজই শেষ দিন', days: 0 };
  return { state: days <= 3 ? 'urgent' : 'open', text: `আবেদনের বাকি ${bn(days)} দিন`, days };
}
export const notDash = (x) => (x === undefined || x === null ? '' : String(x));
