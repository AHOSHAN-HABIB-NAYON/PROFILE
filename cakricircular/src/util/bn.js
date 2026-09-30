'use strict';
/** Bangla language helpers: digits, dates, relative time, slugs, text similarity. */

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
const MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
const MONTHS_SHORT = ['জানু', 'ফেব্রু', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'];
const DAYS = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];

function bnNum(input) {
  if (input === null || input === undefined) return '';
  return String(input).replace(/[0-9]/g, (d) => BN_DIGITS[d]);
}
function enNum(input) {
  if (input === null || input === undefined) return '';
  return String(input).replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
}
/** 1234567 -> ১২,৩৪,৫৬৭ (South Asian grouping) */
function bnCount(n) {
  n = Math.round(Number(n) || 0);
  const s = String(Math.abs(n));
  let out = s;
  if (s.length > 3) {
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    out = `${rest},${last3}`;
  }
  return bnNum((n < 0 ? '-' : '') + out);
}
/** 12500 -> ১২.৫K style compact */
function bnCompact(n) {
  n = Number(n) || 0;
  if (n >= 1e7) return bnNum((n / 1e7).toFixed(1).replace(/\.0$/, '')) + ' কোটি';
  if (n >= 1e5) return bnNum((n / 1e5).toFixed(1).replace(/\.0$/, '')) + ' লাখ';
  if (n >= 1e3) return bnNum((n / 1e3).toFixed(1).replace(/\.0$/, '')) + 'K';
  return bnNum(n);
}

function toDate(d) {
  if (!d) return null;
  if (d instanceof Date) return isNaN(d) ? null : d;
  const x = new Date(d);
  return isNaN(x) ? null : x;
}

/** ২৮ সেপ্টেম্বর ২০২৬ */
function bnDate(d, opts = {}) {
  d = toDate(d);
  if (!d) return '';
  const m = opts.short ? MONTHS_SHORT[d.getMonth()] : MONTHS[d.getMonth()];
  let out = `${bnNum(d.getDate())} ${m} ${bnNum(d.getFullYear())}`;
  if (opts.time) out += `, ${bnTime(d)}`;
  return out;
}
function bnTime(d) {
  d = toDate(d);
  if (!d) return '';
  let h = d.getHours();
  const min = String(d.getMinutes()).padStart(2, '0');
  const part = h < 4 ? 'রাত' : h < 12 ? 'সকাল' : h < 15 ? 'দুপুর' : h < 18 ? 'বিকাল' : h < 20 ? 'সন্ধ্যা' : 'রাত';
  h = h % 12 || 12;
  return `${part} ${bnNum(h)}:${bnNum(min)}`;
}
function bnDay(d) { d = toDate(d); return d ? DAYS[d.getDay()] : ''; }

function timeAgo(d, now = Date.now()) {
  d = toDate(d);
  if (!d) return '';
  const s = Math.max(0, Math.floor((now - d.getTime()) / 1000));
  if (s < 60) return 'এইমাত্র';
  const m = Math.floor(s / 60);
  if (m < 60) return `${bnNum(m)} মিনিট আগে`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${bnNum(h)} ঘণ্টা আগে`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${bnNum(days)} দিন আগে`;
  const mo = Math.floor(days / 30);
  if (mo < 12) return `${bnNum(mo)} মাস আগে`;
  return `${bnNum(Math.floor(mo / 12))} বছর আগে`;
}

/** Days left until deadline (end of that day counts). null if no deadline. */
function daysLeft(deadline, now = new Date()) {
  const d = toDate(deadline);
  if (!d) return null;
  return Math.ceil((d.getTime() - now.getTime()) / 86400000);
}

/**
 * Bangla-friendly slug: keeps Bangla letters & signs, lowercase latin, digits.
 * "বাংলাদেশ পুলিশ কনস্টেবল নিয়োগ ২০২৬!" -> "বাংলাদেশ-পুলিশ-কনস্টেবল-নিয়োগ-২০২৬"
 */
function slugify(text, max = 90) {
  let s = String(text || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[‌‍]/g, '')
    .replace(/[^ঀ-৿a-z0-9\s-]+/g, ' ')
    .replace(/[।॥]/g, ' ') // danda
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (s.length > max) {
    s = s.slice(0, max);
    const cut = s.lastIndexOf('-');
    if (cut > max * 0.5) s = s.slice(0, cut);
  }
  return s.replace(/-+$/g, '');
}

/** A slug is "broken" when empty, percent-encoded garbage, or contains odd characters. */
function isBrokenSlug(slug) {
  if (!slug) return true;
  if (/%[0-9a-f]{2}/i.test(slug)) return true;
  if (/[^ঀ-৿a-z0-9-]/.test(slug)) return true;
  if (/^-|-$|--/.test(slug)) return true;
  return false;
}

/** Normalise text for comparison (duplicate detection). */
function normalizeText(t) {
  return enNum(String(t || ''))
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^ঀ-৿a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function bigrams(s) {
  const out = new Map();
  const chars = [...s.replace(/\s+/g, ' ')];
  for (let i = 0; i < chars.length - 1; i++) {
    const g = chars[i] + chars[i + 1];
    out.set(g, (out.get(g) || 0) + 1);
  }
  return out;
}
/** Sørensen–Dice similarity 0..1 on character bigrams (works well for Bangla titles). */
function similarity(a, b) {
  a = normalizeText(a); b = normalizeText(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a); const B = bigrams(b);
  let inter = 0; let total = 0;
  for (const [, c] of A) total += c;
  for (const [, c] of B) total += c;
  for (const [g, c] of A) if (B.has(g)) inter += Math.min(c, B.get(g));
  return total ? (2 * inter) / total : 0;
}

const BN_MONTH_MAP = {
  'জানুয়ারি': 0, 'জানুয়ারী': 0, 'জানু': 0, 'january': 0, 'jan': 0,
  'ফেব্রুয়ারি': 1, 'ফেব্রুয়ারী': 1, 'ফেব্রু': 1, 'february': 1, 'feb': 1,
  'মার্চ': 2, 'march': 2, 'mar': 2,
  'এপ্রিল': 3, 'april': 3, 'apr': 3,
  'মে': 4, 'may': 4,
  'জুন': 5, 'june': 5, 'jun': 5,
  'জুলাই': 6, 'july': 6, 'jul': 6,
  'আগস্ট': 7, 'আগষ্ট': 7, 'august': 7, 'aug': 7,
  'সেপ্টেম্বর': 8, 'সেপ্টে': 8, 'september': 8, 'sep': 8, 'sept': 8,
  'অক্টোবর': 9, 'অক্টো': 9, 'october': 9, 'oct': 9,
  'নভেম্বর': 10, 'নভে': 10, 'november': 10, 'nov': 10,
  'ডিসেম্বর': 11, 'ডিসে': 11, 'december': 11, 'dec': 11,
};

/**
 * Find dates in free text (Bangla or English digits, "১৫ অক্টোবর ২০২৬", "15/10/2026", "2026-10-15").
 * Returns array of Date objects (local time, end of day).
 */
function findDates(text) {
  const s = enNum(String(text || '')).replace(/<[^>]+>/g, ' ');
  const out = [];
  const monthNames = Object.keys(BN_MONTH_MAP).sort((a, b) => b.length - a.length).join('|');
  const re1 = new RegExp(`(\\d{1,2})\\s*(?:ই|শে|লা|রা|ঠা|st|nd|rd|th)?\\s*(${monthNames})[,\\s]*(\\d{4})`, 'gi');
  let m;
  while ((m = re1.exec(s))) {
    const d = new Date(Number(m[3]), BN_MONTH_MAP[m[2].toLowerCase()], Number(m[1]), 23, 59, 59);
    if (!isNaN(d)) out.push(d);
  }
  const re2 = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/g;
  while ((m = re2.exec(s))) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 23, 59, 59);
    if (!isNaN(d) && Number(m[2]) <= 12) out.push(d);
  }
  const re3 = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  while ((m = re3.exec(s))) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59);
    if (!isNaN(d)) out.push(d);
  }
  return out;
}

/** Extract first number of posts/vacancies ("পদসংখ্যা: ১২০০"). */
function findVacancies(text) {
  const s = enNum(String(text || '')).replace(/<[^>]+>/g, ' ');
  const m = s.match(/(?:পদ\s*সংখ্যা|পদসংখ্যা|মোট\s*পদ|শূন্য\s*পদ|vacanc(?:y|ies)|posts?)\s*[:：-]?\s*(\d[\d,]*)/i)
    || s.match(/(\d[\d,]*)\s*(?:টি|জন)\s*(?:পদে|পদ)/);
  return m ? Number(m[1].replace(/,/g, '')) : null;
}

module.exports = {
  bnNum, enNum, bnCount, bnCompact, bnDate, bnTime, bnDay, timeAgo, daysLeft,
  slugify, isBrokenSlug, normalizeText, similarity, findDates, findVacancies, MONTHS,
};
