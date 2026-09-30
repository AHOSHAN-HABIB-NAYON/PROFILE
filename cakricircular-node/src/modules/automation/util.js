/* ─────────────────────────────────────────────
   অটোমেশনের সাহায্যকারী: শিরোনাম মেলানো, তারিখ/পদ সংখ্যা বের করা, সারসংক্ষেপ পাতা চেনা
   ───────────────────────────────────────────── */
import { en, bn } from '../../core/bn.js';

export const plain = (html) => String(html || '').replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&#8217;|&#8216;/g, "'").replace(/&#8211;|&#8212;/g, '-').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/\s+/g, ' ').trim();

export function normLink(u) {
  let x = '';
  try { x = decodeURIComponent(String(u).trim()); } catch { x = String(u).trim(); }
  x = x.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '');
  return x.replace(/\/+$/, '');
}
export function normTitle(t) {
  const x = en(plain(t)).toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  return x.slice(0, 500);
}

export const SIMILAR = 0.85;
/** দুই শিরোনাম কতটা এক (০–১) — অক্ষর ধরে Levenshtein; মিলবে না বুঝলে আগেই থামে */
export function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const x = Array.from(a.slice(0, 220)); const y = Array.from(b.slice(0, 220));
  const n = x.length; const m = y.length; const max = Math.max(n, m);
  if (!max || Math.min(n, m) / max < SIMILAR) return 0;
  let prev = Array.from({ length: m + 1 }, (_, i) => i);
  for (let i = 1; i <= n; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= m; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < best) best = cur[j];
    }
    if (best / max > 1 - SIMILAR) return 0;
    prev = cur;
  }
  return 1 - prev[m] / max;
}

/* সারসংক্ষেপ পাতা (অনেক চাকরির তালিকা) — আনব না */
const ROUNDUP = ['চাকরির খবর', 'চাকুরির খবর', 'সকল নিয়োগ', 'সকল চাকরি', 'সব চাকরি', 'সাপ্তাহিক', 'আজকের চাকরি', 'চাকরির পত্রিকা', 'জব নিউজ', 'চাকরির তালিকা', 'সরকারি চাকরির', 'বেসরকারি চাকরির',
  'weekly', 'all job', 'all-job', 'all govt', 'job news', 'jobs-news', 'chakrir-khobor', 'chakrir khobor', 'bd govt job circular', 'govt job circular 2', 'today job', 'job-list', 'job list'];
export function isRoundup(title, url) {
  let u = ''; try { u = decodeURIComponent(url); } catch { u = url; }
  const t = `${String(title).toLowerCase()} ${u.toLowerCase()}`;
  return ROUNDUP.some((p) => t.includes(p));
}

const MON = { জানুয়ারি: 1, জানুয়ারী: 1, ফেব্রুয়ারি: 2, ফেব্রুয়ারী: 2, মার্চ: 3, এপ্রিল: 4, মে: 5, জুন: 6, জুলাই: 7, আগস্ট: 8, আগষ্ট: 8, সেপ্টেম্বর: 9, অক্টোবর: 10, নভেম্বর: 11, ডিসেম্বর: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12, jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const valid = (y, m, d) => { const dt = new Date(Date.UTC(y, m - 1, d)); return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d; };
const pad = (n) => String(n).padStart(2, '0');
export function parseDate(seg) {
  const s = en(seg); let m;
  if ((m = /(\d{1,2})\s*([\p{L}\p{M}]+)[,\s]+(\d{4})/u.exec(s))) { const mo = MON[m[2].toLowerCase()]; if (mo && valid(+m[3], mo, +m[1])) return `${m[3]}-${pad(mo)}-${pad(+m[1])}`; }
  if ((m = /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/.exec(s)) && valid(+m[3], +m[2], +m[1])) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  if ((m = /(\d{4})-(\d{2})-(\d{2})/.exec(s)) && valid(+m[1], +m[2], +m[3])) return m[0];
  return null;
}
function labelDate(text, labels) {
  const t = en(text); const re = new RegExp(`(?:${labels})(.{0,70})`, 'giu'); let m;
  while ((m = re.exec(t))) { const d = parseDate(m[1]); if (d) return d; }
  return null;
}
const SOMOY = 'সম(?:\\u09DF|\\u09AF\\u09BC)';
export const findDeadline = (t) => labelDate(t, `আবেদনের\\s*শেষ\\s*(?:তারিখ|${SOMOY})|শেষ\\s*তারিখ|Application\\s*Deadline|Deadline|Last\\s*Date`);
export const findAppStart = (t) => labelDate(t, `আবেদন\\s*শুরুর\\s*(?:তারিখ|${SOMOY})|শুরুর\\s*তারিখ|Application\\s*Start(?:\\s*Date)?|Start\\s*Date`);
export function findVacancy(title, text) {
  let m = /(\d[\d,]*)\s*(?:টি\s*)?(?:পদে|পদের)/u.exec(en(title));
  if (m) { const n = parseInt(m[1].replace(/,/g, ''), 10); if (n > 0 && n < 200000) return n; }
  m = /(?:মোট\s*(?:শূন্য\s*পদ|পদ\s*সংখ্যা|পদসংখ্যা|পদ)|Total\s*(?:Vacanc(?:y|ies)|Posts?))[^\d\n]{0,12}(\d[\d,]*)/iu.exec(en(text));
  if (m) { const n = parseInt(m[1].replace(/,/g, ''), 10); if (n > 0 && n < 200000) return n; }
  return null;
}
export function toInt(v) { const m = /\d[\d,]*/.exec(en(String(v ?? ''))); if (!m) return null; const n = parseInt(m[0].replace(/,/g, ''), 10); return n > 0 ? n : null; }

/** শিরোনাম মেলার পর পদ সংখ্যা, আবেদন শুরু ও শেষ তারিখ মেলাই → {result: dup|new|unknown, why} */
export function compare(src, post) {
  const pairs = [['পদ সংখ্যা', src.vacancy, toInt(post.vacancy)], ['আবেদন শুরু', src.start, post.application_start ? String(post.application_start).slice(0, 10) : null], ['শেষ তারিখ', src.deadline, post.deadline ? String(post.deadline).slice(0, 10) : null]];
  const same = []; const diff = [];
  for (const [label, a, b] of pairs) {
    if (a === null || a === undefined || b === null || b === undefined) continue;
    if (String(a) === String(b)) same.push(label); else diff.push(`${label} আলাদা (সোর্স: ${bn(a)}, আমাদের: ${bn(b)})`);
  }
  if (diff.length) return { result: 'new', why: diff.join('; ') };
  if (same.length >= 2) return { result: 'dup', why: `${same.join(', ')} — সব এক` };
  if (same.length) return { result: 'unknown', why: `শুধু ${same[0]} মিলেছে — নিশ্চিত হওয়ার মতো যথেষ্ট তথ্য নেই` };
  return { result: 'unknown', why: 'পদ সংখ্যা বা তারিখ কোনোটাই দুই দিকে পাওয়া যায়নি' };
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
