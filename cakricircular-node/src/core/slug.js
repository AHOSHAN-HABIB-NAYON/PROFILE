/* ─────────────────────────────────────────────
   স্লাগ: বাংলা সাপোর্টেড + শিরোনাম থেকে ছোট ইংরেজি URL
   (PHP সংস্করণের নিয়মই হুবহু, তাই পুরোনো লিংক মিলে যায়)
   ───────────────────────────────────────────── */
import { all, one } from '../db.js';

export function slugify(text) {
  let t = String(text || '').replace(/<[^>]*>/g, '').trim();
  t = t.replace(/[।॥]/g, '');
  t = t.replace(/[​-‍﻿]/g, '');
  t = t.replace(/[^\p{L}\p{N}\p{M}\s-]+/gu, '');
  t = t.replace(/[\s-]+/gu, '-').replace(/^-+|-+$/g, '');
  if (!t) t = `post-${Math.floor(Date.now() / 1000)}`;
  return Array.from(t).slice(0, 120).join('');
}

const WORDS = {
  'নিয়োগ': 'niyog', 'বিজ্ঞপ্তি': 'circular', 'চাকরি': 'job', 'চাকুরি': 'job', 'ভর্তি': 'admission', 'আবেদন': 'application',
  'ফলাফল': 'result', 'রেজাল্ট': 'result', 'পরীক্ষা': 'exam', 'প্রকাশ': 'published', 'প্রকাশিত': 'published', 'সময়সূচি': 'routine',
  'বাংলাদেশ': 'bangladesh', 'পুলিশ': 'police', 'সেনাবাহিনী': 'army', 'নৌবাহিনী': 'navy', 'বিমানবাহিনী': 'airforce',
  'ব্যাংক': 'bank', 'বিশ্ববিদ্যালয়': 'university', 'কলেজ': 'college', 'স্কুল': 'school', 'মাদ্রাসা': 'madrasa', 'শিক্ষক': 'teacher',
  'জেলা': 'district', 'প্রশাসকের': 'dc', 'প্রশাসক': 'dc', 'কার্যালয়': 'office', 'অধিদপ্তর': 'directorate', 'অধিদপ্তরে': 'directorate',
  'মন্ত্রণালয়': 'ministry', 'সরকারি': 'govt', 'বেসরকারি': 'private', 'কোম্পানি': 'company', 'হাসপাতাল': 'hospital', 'নার্স': 'nurse',
  'অফিসার': 'officer', 'সহকারী': 'assistant', 'কর্মকর্তা': 'officer', 'কর্মচারী': 'staff', 'পদে': 'post', 'পদ': 'post', 'শূন্য': 'vacancy',
  'বৃত্তি': 'scholarship', 'স্কলারশিপ': 'scholarship', 'নোটিশ': 'notice', 'প্রশিক্ষণ': 'training', 'সার্কুলার': 'circular',
  'অনার্স': 'honours', 'বর্ষ': 'year',
};
const CHARS = {
  'ক্ষ': 'kh', 'জ্ঞ': 'gg', 'ঞ্চ': 'nch', 'ঞ্জ': 'nj', 'ক্স': 'x',
  'অ': 'o', 'আ': 'a', 'ই': 'i', 'ঈ': 'i', 'উ': 'u', 'ঊ': 'u', 'ঋ': 'ri', 'এ': 'e', 'ঐ': 'oi', 'ও': 'o', 'ঔ': 'ou',
  'ক': 'k', 'খ': 'kh', 'গ': 'g', 'ঘ': 'gh', 'ঙ': 'ng', 'চ': 'ch', 'ছ': 'chh', 'জ': 'j', 'ঝ': 'jh', 'ঞ': 'n',
  'ট': 't', 'ঠ': 'th', 'ড': 'd', 'ঢ': 'dh', 'ণ': 'n', 'ত': 't', 'থ': 'th', 'দ': 'd', 'ধ': 'dh', 'ন': 'n',
  'প': 'p', 'ফ': 'f', 'ব': 'b', 'ভ': 'bh', 'ম': 'm', 'য': 'j', 'র': 'r', 'ল': 'l', 'শ': 'sh', 'ষ': 'sh', 'স': 's', 'হ': 'h',
  'ড়': 'r', 'ঢ়': 'rh', 'য়': 'y', 'ৎ': 't', 'ং': 'ng', 'ঃ': '', 'ঁ': '',
  'া': 'a', 'ি': 'i', 'ী': 'i', 'ু': 'u', 'ূ': 'u', 'ৃ': 'ri', 'ে': 'e', 'ৈ': 'oi', 'ো': 'o', 'ৌ': 'ou', '্': '',
  '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9',
};
const CHAR_KEYS = Object.keys(CHARS).sort((a, b) => b.length - a.length);
const SKIP = new Set(['এবং', 'ও', 'এর', 'এ', 'করা', 'করে', 'হবে', 'হয়েছে', 'জন্য', 'মধ্যে', 'the', 'a', 'an', 'of', 'for', 'and', 'in', 'to']);

function translit(w) {
  let out = ''; let i = 0;
  while (i < w.length) {
    let hit = false;
    for (const k of CHAR_KEYS) {
      if (w.startsWith(k, i)) { out += CHARS[k]; i += k.length; hit = true; break; }
    }
    if (!hit) { out += w[i]; i += 1; }
  }
  return out;
}

export function latinSlugWords(title, maxWords = 3, maxLen = 34) {
  const clean = String(title || '').replace(/[()[\]{}"'“”‘’,।:;!?]/g, ' ');
  const parts = clean.trim().split(/\s+/).filter(Boolean);
  const out = [];
  for (const w of parts) {
    if (out.length >= maxWords) break;
    const wl = w.toLowerCase();
    if (SKIP.has(wl)) continue;
    let t;
    if (WORDS[w]) t = WORDS[w];
    else if (WORDS[wl]) t = WORDS[wl];
    else if (/^[a-z0-9.-]+$/i.test(w)) t = wl;
    else t = translit(w);
    t = t.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (t.length < 2) continue;
    if (out.includes(t)) continue;
    out.push(t.slice(0, 14));
    if (out.join('-').length >= maxLen) break;
  }
  return out.join('-');
}

/** শিরোনামের ইংরেজি শব্দ + ক্যাটাগরি + ক্রমিক নম্বর, যেমন: bangladesh-police-niyog-chakri01 */
export async function nextCatSlug(catId, title = '') {
  const c = await one('SELECT slug FROM categories WHERE id = ?', [catId]);
  let cs = String(c?.slug || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!cs) cs = 'post';
  let max = 0;
  const rows = await all('SELECT slug FROM posts WHERE slug LIKE ?', [`%${cs}%`]);
  const re = new RegExp(`${cs}(\\d+)$`);
  for (const r of rows) { const m = re.exec(r.slug); if (m) max = Math.max(max, Number(m[1])); }
  const head = title ? latinSlugWords(title) : '';
  let n = max + 1;
  for (;;) {
    const num = cs + String(n).padStart(2, '0');
    const tryS = head ? `${head}-${num}` : num;
    const used = (await one('SELECT id FROM posts WHERE slug = ? LIMIT 1', [tryS]))
      || (await one('SELECT old_slug FROM slug_redirects WHERE old_slug = ? LIMIT 1', [tryS]));
    if (!used) return tryS;
    n += 1;
    if (n > max + 9999) return `${num}-${Math.random().toString(16).slice(2, 7)}`;
  }
}

export async function uniqueSlug(base, table, ignoreId = 0) {
  const slug = slugify(base);
  let i = 1; let t = slug;
  for (;;) {
    const row = await one(`SELECT id FROM \`${table}\` WHERE slug = ? AND id <> ? LIMIT 1`, [t, ignoreId]);
    if (!row) return t;
    i += 1; t = `${slug}-${i}`;
  }
}
