/* ═══════════════════════════════════════════════════════════
   অটোমেশন ইঞ্জিন (Node.js) — দ্রুত, হালকা, আটকে যায় না
   সোর্স সাইট (WordPress REST) → নতুন/বদলানো খোঁজা (ID ধরে) → ডুপ্লিকেট যাচাই (AI ছাড়া)
   → শুধু সত্যিকারের নতুন পোস্ট AI-তে → খসড়া হিসেবে সেভ → এডমিনকে জানানো
   কখনো নিজে প্রকাশ করে না।
   ═══════════════════════════════════════════════════════════ */
import crypto from 'node:crypto';
import { all, one, col, run } from '../../db.js';
import { setting, setSetting, settingInt } from '../../core/settings.js';
import { bn, nowStr } from '../../core/bn.js';
import { bumpVersion } from '../../core/cache.js';
import { log } from './log.js';
import * as U from './util.js';
import * as S from './source.js';
import { writePost, AutoAIError, usageText } from './ai.js';
import { autoSave, autoUpdatePost, DIVISIONS } from './save.js';
import { enqueueMail, emailShell, btn, smtpConfigured } from '../notify/mailer.js';
import { esc } from '../../core/html.js';
import { config } from '../../config.js';

const MAX_DETAIL = 6;   // প্রতি রানে "বদলেছে কিনা" যাচাইয়ে সর্বোচ্চ কত পোস্ট খুলব
const MAX_CHECKS = 10;  // প্রতি রানে সর্বোচ্চ কতটি পোস্ট প্রসেস (AI ছাড়া সিদ্ধান্তসহ)
const MAX_TRIES = 3;    // ব্যর্থ হলে সর্বোচ্চ কতবার চেষ্টা
const SCAN_PAGES = 3;   // প্রতি রানে নতুন/বদলানো খুঁজতে সর্বোচ্চ কত পাতা
const STALE_MIN = 10;   // এর বেশি মিনিট "processing" আটকে থাকলে ছেড়ে দিই
const LEASE_MIN = 14;

export const stage = { v: 'অপেক্ষায়' };
const setStage = (s) => { stage.v = s; };
const cap = () => Math.max(1, Math.min(200, settingInt('auto_daily_cap', 10)));
const startDate = () => (/^\d{4}-\d{2}-\d{2}$/.test(setting('auto_start_date', '')) ? setting('auto_start_date') : '2026-09-22');

/* ───────── অবস্থা (JSON settings) ───────── */
export async function getState(k) { const v = await col('SELECT v FROM settings WHERE k = ?', [k]); try { return JSON.parse(v || '{}') || {}; } catch { return {}; } }
const setState = (k, v) => setSetting(k, JSON.stringify(v));

/* ───────── লিজ-তালা: প্রক্রিয়া মরে গেলে নিজে থেকেই ছাড়ে ───────── */
const holder = `${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
let running = false;
async function acquire() {
  if (running) return false;
  const r = await run(`INSERT INTO job_locks (name, holder, until_at) VALUES ('auto', ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))
    ON DUPLICATE KEY UPDATE holder = IF(until_at < NOW(), VALUES(holder), holder), until_at = IF(holder = VALUES(holder), VALUES(until_at), until_at)`, [holder, LEASE_MIN]);
  const row = await one("SELECT holder FROM job_locks WHERE name = 'auto'");
  if (row?.holder !== holder) return false;
  running = true; return true;
}
const heartbeat = () => run("UPDATE job_locks SET until_at = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE name='auto' AND holder = ?", [LEASE_MIN, holder]).catch(() => {});
async function release() { running = false; await run("UPDATE job_locks SET until_at = NOW() WHERE name='auto' AND holder = ?", [holder]).catch(() => {}); }
export async function isRunning() { if (running) return true; const r = await one("SELECT until_at > NOW() AS live FROM job_locks WHERE name='auto'"); return Boolean(r && Number(r.live)); }

/* ───────── সিদ্ধান্তের খাতা ───────── */
async function decide(sid, decision, reason, level = 'info') {
  try { await run('INSERT INTO source_decisions (source_id, decision, reason, created_at) VALUES (?,?,?,NOW())', [sid, decision, String(reason).slice(0, 500)]); if (Math.random() < 0.02) await run('DELETE FROM source_decisions WHERE created_at < DATE_SUB(NOW(), INTERVAL 60 DAY)'); } catch { /* */ }
  await log(`[সোর্স #${sid}] ${reason}`, level);
}
const aiUsedToday = async () => Number(await col("SELECT COUNT(*) FROM source_decisions WHERE decision = 'ai_call' AND created_at >= CURDATE()", [], 0));
const claim = async (sid, from) => (await run("UPDATE source_posts SET status='processing', prev_status=?, updated_at=NOW() WHERE source_id=? AND status=?", [from, sid, from])).affectedRows === 1;
async function releaseStale() {
  const rows = await all(`SELECT source_id FROM source_posts WHERE status='processing' AND updated_at < DATE_SUB(NOW(), INTERVAL ${STALE_MIN} MINUTE)`);
  for (const r of rows) { await run("UPDATE source_posts SET status='failed', note=?, updated_at=NOW() WHERE source_id=? AND status='processing'", ['মাঝপথে থেমে গিয়েছিল — আবার চেষ্টা হবে', r.source_id]); await decide(r.source_id, 'stale', `${STALE_MIN} মিনিটের বেশি আটকে ছিল, ছেড়ে দেওয়া হলো`, 'warn'); }
}

/* ───────── আমাদের পোস্টের সাথে মেলানো ───────── */
export async function matchMyPost(title, excludeSid = 0) {
  const n = U.normTitle(title); if (Array.from(n).length < 8) return null;
  const fields = 'id, title, vacancy, deadline, application_start';
  const mine = (await all(`SELECT ${fields} FROM posts WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1500`)).map((r) => ({ ...r, _n: U.normTitle(r.title) }));
  let best = null; let bestS = 0; let via = '';
  for (const r of mine) { const s = r._n === n ? 1 : U.similarity(n, r._n); if (s >= U.SIMILAR && s > bestS) { best = r; bestS = s; via = 'আমাদের পোস্টের শিরোনাম'; if (s >= 1) break; } }
  if (bestS < 1) {
    const src = await all('SELECT source_id, title_norm, my_post_id FROM source_posts WHERE my_post_id IS NOT NULL AND title_norm IS NOT NULL ORDER BY updated_at DESC LIMIT 3000');
    for (const r of src) {
      if (Number(r.source_id) === excludeSid) continue;
      const s = r.title_norm === n ? 1 : U.similarity(n, r.title_norm);
      if (s >= U.SIMILAR && s > bestS) { const p = await one(`SELECT ${fields} FROM posts WHERE id = ? AND deleted_at IS NULL`, [r.my_post_id]); if (p) { best = p; bestS = s; via = 'আগে আনা সোর্স-পোস্টের শিরোনাম'; if (s >= 1) break; } }
    }
  }
  if (!best) return null;
  delete best._n;
  return { ...best, score: bestS, via };
}

/* ───────── ১. বেসলাইন: সব পোস্ট শুধু তালিকায় তোলা, AI নয় ───────── */
async function baseline(t0, budgetMs, sum, ev) {
  const st = await getState('auto_sp_base');
  let page = Math.max(1, Number(st.page) || 1); let cnt = Number(st.count) || 0; let pages = Number(st.pages) || 0;
  const map = new Map();
  for (const r of await all("SELECT id, source_url FROM posts WHERE source_url IS NOT NULL AND source_url <> '' AND deleted_at IS NULL")) map.set(U.normLink(r.source_url), r.id);
  await log(`বেসলাইন চলছে — পাতা ${page} থেকে (সোর্সের সব পোস্ট শুধু তালিকায় উঠছে, AI ডাকা হবে না)`);
  for (;;) {
    if (Date.now() - t0 > budgetMs) { await setState('auto_sp_base', { page, pages, count: cnt, done: 0 }); return { done: false, why: `সময় শেষ — পরের রানে পাতা ${page} থেকে চলবে` }; }
    const L = await S.list(page, 'date');
    if (!L) { await setState('auto_sp_base', { page, pages, count: cnt, done: 0 }); return { done: false, why: `সোর্সের REST API সাড়া দেয়নি (${S.lastError})`, error: true }; }
    if (!L.items.length) break;
    const rows = L.items.map((it) => { const linked = map.get(U.normLink(it.link)) || null; return [it.id, it.slug.slice(0, 200), it.link.slice(0, 500), it.title.slice(0, 500), U.normTitle(it.title), it.date, it.modified, linked ? 'done' : 'baseline', linked, linked ? 'আগের সিস্টেমে তৈরি পোস্টের সাথে যুক্ত' : null]; });
    const r = await run('INSERT IGNORE INTO source_posts (source_id, slug, source_link, title_raw, title_norm, source_date, source_modified, status, my_post_id, note, created_at, updated_at) VALUES ?', [rows.map((x) => [...x, nowStr(), nowStr()])]);
    cnt += r.affectedRows; pages = L.pages; page += 1;
    await setState('auto_sp_base', { page, pages, count: cnt, done: 0 });
    if (pages > 0 && page > pages) break;
  }
  await setState('auto_sp_base', { page, pages, count: cnt, done: 1, at: nowStr() });
  sum.baseline = cnt;
  ev('skip', `বেসলাইন সম্পূর্ণ: সোর্সের ${bn(cnt)}টি পোস্ট তালিকায় উঠেছে — AI একবারও ডাকা হয়নি`, 'এখন থেকে শুধু এর পরে আসা নতুন পোস্টই AI পর্যন্ত যাবে।');
  await log(`বেসলাইন সম্পূর্ণ — ${cnt}টি পোস্ট, AI কল ০`);
  return { done: true };
}

/* ───────── ২. নতুন ও বদলানো খোঁজা (AI নয়) ───────── */
async function discover(sum, ev) {
  const check = new Map();
  for (const ob of ['date', 'modified']) {
    for (let page = 1; page <= SCAN_PAGES; page++) {
      const L = await S.list(page, ob);
      if (!L) { if (page === 1 && ob === 'date') return false; break; }
      if (!L.items.length) break;
      const ids = L.items.map((i) => i.id);
      const rows = new Map((await all('SELECT source_id, status, source_date, source_modified, content_hash, my_post_id FROM source_posts WHERE source_id IN (?)', [ids])).map((r) => [Number(r.source_id), r]));
      let changed = 0;
      for (const it of L.items) {
        const r = rows.get(it.id);
        if (!r) {
          const res = await run("INSERT IGNORE INTO source_posts (source_id, slug, source_link, title_raw, title_norm, source_date, source_modified, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,'new',NOW(),NOW())", [it.id, it.slug.slice(0, 200), it.link.slice(0, 500), it.title.slice(0, 500), U.normTitle(it.title), it.date, it.modified]);
          if (res.affectedRows) { sum.new += 1; changed += 1; await decide(it.id, 'new', `নতুন পোস্ট পাওয়া গেছে: ${Array.from(it.title).slice(0, 90).join('')}`); }
          continue;
        }
        const oldDate = Date.parse(String(r.source_date).replace(' ', 'T') + '+06:00') || 0;
        const newDate = Date.parse(it.date.replace(' ', 'T') + '+06:00');
        if (newDate - oldDate > 3600_000 && !['new', 'processing'].includes(r.status)) {
          const res = await run("UPDATE source_posts SET prev_status = status, status='new', source_date=?, source_modified=?, title_raw=?, title_norm=?, approved=0, tries=0, job='create', note='সোর্সে নতুন করে প্রকাশ (তারিখ এগিয়েছে)', updated_at=NOW() WHERE source_id=? AND status NOT IN ('new','processing')", [it.date, it.modified, it.title.slice(0, 500), U.normTitle(it.title), it.id]);
          if (res.affectedRows) { sum.new += 1; changed += 1; await decide(it.id, 'redated', `সোর্সে নতুন করে প্রকাশ (একই পাতা, নতুন তারিখ): ${Array.from(it.title).slice(0, 90).join('')}`); }
          continue;
        }
        if (String(r.source_modified) === it.modified) continue;
        changed += 1;
        if (r.status === 'done' && r.my_post_id) { check.set(it.id, it); continue; }
        if (r.status === 'processing') continue;
        await run('UPDATE source_posts SET source_modified = ?, updated_at = updated_at WHERE source_id = ?', [it.modified, it.id]);
      }
      if (changed === 0 || page >= L.pages) break;
    }
  }
  /* আমাদের পোস্ট আছে এমন সোর্স-পোস্ট বদলালে: লেখা সত্যিই বদলেছে কিনা — ৩টি একসাথে */
  const items = [...check.entries()].slice(0, MAX_DETAIL);
  for (let i = 0; i < items.length; i += 3) {
    await Promise.all(items.slice(i, i + 3).map(async ([sid, it]) => {
      try {
        const d = await S.detail(sid); if (!d) return;
        const scr = S.parse(d.html, d.title || it.title); if (!scr) return;
        const row = await one('SELECT content_hash, status FROM source_posts WHERE source_id = ?', [sid]);
        if (!row || row.status !== 'done') return;
        if (!row.content_hash) await run('UPDATE source_posts SET content_hash=?, source_modified=?, updated_at=NOW() WHERE source_id=?', [scr.hash, it.modified, sid]);
        else if (row.content_hash === scr.hash) await run('UPDATE source_posts SET source_modified=?, updated_at=NOW() WHERE source_id=?', [it.modified, sid]);
        else {
          await run("UPDATE source_posts SET status='update_pending', new_hash=?, source_modified=?, approved=0, note='সোর্সে লেখা বদলেছে — আপডেট করবেন কিনা ঠিক করুন', updated_at=NOW() WHERE source_id=? AND status='done'", [scr.hash, it.modified, sid]);
          sum.upd += 1; await decide(sid, 'update_pending', `সোর্সে লেখা বদলেছে (AI ডাকা হয়নি) — এডমিনের সিদ্ধান্তের অপেক্ষায়: ${Array.from(it.title).slice(0, 80).join('')}`);
          ev('skip', `সোর্সে আপডেট হয়েছে: ${Array.from(it.title).slice(0, 70).join('')}`, 'এডমিন পাতায় "সোর্সে আপডেট" তালিকা থেকে ঠিক করুন।');
        }
      } catch (e) { await log(`আপডেট যাচাইয়ে সমস্যা (সোর্স #${sid}): ${e.message}`, 'warn'); }
    }));
  }
  return true;
}

/* ───────── কাজের সারি ───────── */
async function nextJobs(n, skip) {
  const not = skip.size ? ` AND source_id NOT IN (${[...skip].map(Number).join(',')})` : '';
  const out = [];
  const take = async (sql) => { for (const r of await all(`${sql} LIMIT ${n - out.length}`)) out.push(r); };
  await take(`SELECT * FROM source_posts WHERE approved = 1 AND status IN ('needs_review','update_pending','baseline','skipped_duplicate') ${not} ORDER BY updated_at ASC`);
  if (out.length < n) await take(`SELECT * FROM source_posts WHERE status = 'new' ${not}${out.length ? ` AND source_id NOT IN (${out.map((r) => Number(r.source_id)).join(',')})` : ''} ORDER BY source_date ASC, source_id ASC`);
  if (out.length < n) await take(`SELECT * FROM source_posts WHERE status = 'failed' AND tries < ${MAX_TRIES} AND updated_at < DATE_SUB(NOW(), INTERVAL 20 MINUTE) ${not}${out.length ? ` AND source_id NOT IN (${out.map((r) => Number(r.source_id)).join(',')})` : ''} ORDER BY updated_at ASC`);
  return out.slice(0, n);
}
export const queueCount = async () => Number(await col(`SELECT COUNT(*) FROM source_posts WHERE status = 'new' OR (approved = 1 AND status IN ('needs_review','update_pending','baseline','skipped_duplicate')) OR (status = 'failed' AND tries < ${MAX_TRIES})`, [], 0));

async function failMail(row, why) {
  const to = setting('auto_notify_email', '').trim() || setting('contact_email', '').trim();
  if (!to || !smtpConfigured()) return;
  const base = config.baseUrl || setting('site_url', '');
  await enqueueMail(to, `⚠️ অটো-পোস্ট ব্যর্থ: ${Array.from(row.title_raw || '').slice(0, 80).join('')}`, emailShell({ title: 'অটো-পোস্ট ব্যর্থ', base,
    body: `<h3 style="margin:0 0 8px">⚠️ একটি পোস্ট ${MAX_TRIES} বার চেষ্টা করেও তৈরি হয়নি</h3><p style="margin:0 0 8px">${esc(row.title_raw)}</p><p style="background:#fff7e8;color:#8a5a08;padding:8px 12px;border-radius:10px">কারণ: ${esc(why)}</p><p style="color:#5f716d;font-size:13px">আর নিজে থেকে চেষ্টা হবে না (AI খরচ বাঁচাতে)। অটোমেশন পাতা থেকে “ব্যর্থগুলো আবার চেষ্টা” চাপলে আবার হবে।</p>${btn(`${base}/${setting('admin_slug', 'v2admin')}/automation`, 'অটোমেশন পাতা')}` }));
}

/* ───────── ৪. একটি সোর্স-পোস্ট প্রসেস → created | updated | dup | review | fail | cap | busy ───────── */
async function processOne(row, cats, sum, ev) {
  const sid = Number(row.source_id); const prev = String(row.status); const approved = Number(row.approved) === 1;
  const isUpdate = prev === 'update_pending' || (row.job === 'update' && row.my_post_id);
  const isRedated = !isUpdate && Boolean(row.my_post_id);
  let label = Array.from(String(row.title_raw || '')).slice(0, 70).join('');
  if (!(await claim(sid, prev))) return 'busy';
  const fail = async (why, count = true) => {
    await run("UPDATE source_posts SET status='failed', note=?, tries = tries + ?, updated_at=NOW() WHERE source_id=?", [String(why).slice(0, 250), count ? 1 : 0, sid]);
    const tries = Number(await col('SELECT tries FROM source_posts WHERE source_id = ?', [sid], 0)); sum.failed += 1;
    await decide(sid, 'failed', `ব্যর্থ (চেষ্টা ${tries}/${MAX_TRIES}): ${why} — ${label}`, 'error');
    if (tries >= MAX_TRIES) { await decide(sid, 'gave_up', `${MAX_TRIES} বার ব্যর্থ — আর নিজে চেষ্টা হবে না, এডমিনকে মেইল`, 'error'); await failMail(row, why); ev('fail', `ব্যর্থ (${tries} বার) — আর চেষ্টা হবে না: ${label}`, why); }
    else ev('fail', `ব্যর্থ: ${label}`, `${why} — পরে আবার চেষ্টা হবে।`);
    return 'fail';
  };
  try {
    /* নিরাপত্তা: এই লিংক থেকে আমাদের পোস্ট আগেই আছে? */
    if (!isUpdate && !isRedated && row.source_link && String(row.slug || '').trim()) {
      const want = U.normLink(row.source_link);
      for (const p of await all('SELECT id, source_url FROM posts WHERE is_auto = 1 AND deleted_at IS NULL AND source_url LIKE ?', [`%${String(row.slug).slice(0, 150)}%`])) {
        if (U.normLink(p.source_url) === want) {
          await run("UPDATE source_posts SET status='done', my_post_id=?, approved=0, note=?, updated_at=NOW() WHERE source_id=?", [p.id, 'এই লিংক থেকে পোস্ট আগেই আছে — যুক্ত করা হলো', sid]);
          sum.dup += 1; await decide(sid, 'linked_existing', `এই সোর্স থেকে আমাদের পোস্ট #${p.id} আগেই আছে — AI ছাড়াই যুক্ত: ${label}`); ev('skip', `আগেই আছে (একই সোর্স): ${label}`); return 'dup';
        }
      }
    }
    setStage('সোর্স থেকে লেখা আনা');
    const d = await S.detail(sid);
    if (!d) return await fail(`সোর্স থেকে পোস্টের লেখা আনা যায়নি (${S.lastError})`);
    const title = d.title || String(row.title_raw);
    const scr = S.parse(d.html, title);
    if (!scr || scr.short) return await fail('পোস্টে যথেষ্ট লেখা নেই');
    label = Array.from(title).slice(0, 70).join('');
    await run("UPDATE source_posts SET title_raw=?, title_norm=?, source_link=COALESCE(NULLIF(?, ''), source_link), source_modified=COALESCE(?, source_modified), updated_at=NOW() WHERE source_id=?", [title.slice(0, 500), U.normTitle(title), (d.link || '').slice(0, 500), d.modified, sid]);
    const link = d.link || String(row.source_link); const modified = d.modified || String(row.source_modified); let extraNote = '';
    const today = nowStr().slice(0, 10);

    if (!isUpdate && !approved) {
      if (U.isRoundup(title, link)) { await run("UPDATE source_posts SET status='skipped_duplicate', content_hash=?, note='roundup', updated_at=NOW() WHERE source_id=?", [scr.hash, sid]); sum.dup += 1; await decide(sid, 'skipped_roundup', `সারসংক্ষেপ/তালিকা পাতা — AI ছাড়াই বাদ: ${label}`); ev('skip', `সারসংক্ষেপ/তালিকা পাতা — বাদ: ${label}`, 'এ ধরনের পাতায় অন্য চাকরির সারাংশ থাকে।'); return 'dup'; }
      const dl = U.findDeadline(scr.full);
      if (dl && dl < today) { await run("UPDATE source_posts SET status='skipped_duplicate', content_hash=?, note=?, updated_at=NOW() WHERE source_id=?", [scr.hash, `মেয়াদ শেষ (শেষ তারিখ ${dl})`, sid]); sum.dup += 1; await decide(sid, 'skipped_expired', `আবেদনের শেষ তারিখ পেরিয়ে গেছে (${bn(dl)}) — AI ছাড়াই বাদ: ${label}`); ev('skip', `মেয়াদ শেষ — বাদ: ${label}`); return 'dup'; }
      const srcInfo = { vacancy: U.findVacancy(title, scr.full), start: U.findAppStart(scr.full), deadline: dl };
      if (isRedated) {
        if (row.content_hash && row.content_hash === scr.hash) { await run("UPDATE source_posts SET status='done', note='একই লেখা আবার প্রকাশ — AI নয়', updated_at=NOW() WHERE source_id=?", [sid]); sum.dup += 1; await decide(sid, 'redated_same', `লেখা আগের মতোই — শুধু তারিখ বদলেছে, AI ছাড়াই বাদ: ${label}`); ev('skip', `শুধু তারিখ বদলেছে — বাদ: ${label}`); return 'dup'; }
        const old = await one('SELECT id, title, vacancy, deadline, application_start FROM posts WHERE id = ? AND deleted_at IS NULL', [row.my_post_id]);
        if (old) {
          const cmp = U.compare(srcInfo, old); const mine = `#${old.id} «${Array.from(old.title).slice(0, 50).join('')}»`;
          if (cmp.result === 'dup') { await run("UPDATE source_posts SET status='done', content_hash=?, note=?, updated_at=NOW() WHERE source_id=?", [scr.hash, `আগের পোস্টের সাথে তথ্য এক: ${cmp.why}`.slice(0, 250), sid]); sum.dup += 1; await decide(sid, 'redated_same', `নতুন তারিখে প্রকাশ, কিন্তু আমাদের ${mine}-এর সাথে ${cmp.why} — AI ছাড়াই বাদ: ${label}`); ev('skip', `সাইটে আগেই আছে — বাদ: ${label}`, `মিলেছে ${mine}`); return 'dup'; }
          if (cmp.result === 'unknown') { await run("UPDATE source_posts SET status='needs_review', match_post_id=?, content_hash=?, note=?, updated_at=NOW() WHERE source_id=?", [old.id, scr.hash, `নতুন তারিখে প্রকাশ; ${cmp.why}`.slice(0, 250), sid]); sum.review += 1; await decide(sid, 'needs_review', `নতুন তারিখে প্রকাশ, আমাদের আগের ${mine}-এর সাথে নিশ্চিত মেলানো গেল না (${cmp.why}) — রিভিউতে: ${label}`, 'warn'); ev('skip', `রিভিউ দরকার: ${label}`, `আগের পোস্ট ${mine}; ${cmp.why}`); return 'review'; }
          extraNote = `সোর্সের একই পাতায় নতুন বিজ্ঞপ্তি — আমাদের আগের পোস্ট ${mine} থেকে ${cmp.why}।`; await decide(sid, 'new_despite_title', `নতুন বিজ্ঞপ্তি (আগের পোস্ট ${mine} থেকে ${cmp.why})`);
        }
      }
      const m = isRedated ? null : await matchMyPost(title, sid);
      if (m) {
        const cmp = U.compare(srcInfo, m); const pct = `${bn(Math.round(m.score * 100))}%`; const mine = `#${m.id} «${Array.from(m.title).slice(0, 50).join('')}»`;
        if (cmp.result === 'dup') { await run("UPDATE source_posts SET status='skipped_duplicate', match_post_id=?, content_hash=?, note=?, updated_at=NOW() WHERE source_id=?", [m.id, scr.hash, `ডুপ্লিকেট: ${cmp.why}`.slice(0, 250), sid]); sum.dup += 1; await decide(sid, 'skipped_duplicate', `শিরোনাম ${pct} মিলেছে (${mine}), ${cmp.why} — AI ছাড়াই বাদ: ${label}`); ev('skip', `সাইটে আগেই আছে — বাদ: ${label}`, `মিলেছে ${mine}; ${cmp.why}`); return 'dup'; }
        if (cmp.result === 'unknown') { await run("UPDATE source_posts SET status='needs_review', match_post_id=?, content_hash=?, note=?, updated_at=NOW() WHERE source_id=?", [m.id, scr.hash, cmp.why.slice(0, 250), sid]); sum.review += 1; await decide(sid, 'needs_review', `শিরোনাম ${pct} মিলেছে (${mine}), কিন্তু ${cmp.why} — AI নয়, রিভিউতে: ${label}`, 'warn'); ev('skip', `রিভিউ দরকার: ${label}`, `মিলেছে ${mine}; ${cmp.why}। নিচের তালিকা থেকে ঠিক করুন।`); return 'review'; }
        extraNote = `শিরোনাম আমাদের ${mine}-এর সাথে মেলে, কিন্তু ${cmp.why} — তাই নতুন ধরা হয়েছে।`; await decide(sid, 'new_despite_title', `শিরোনাম ${pct} মিলেছে (${mine}), কিন্তু ${cmp.why} — নতুন নিয়োগ ধরা হলো`);
      }
    }

    /* ---- AI ধাপ ---- */
    const used = await aiUsedToday();
    if (used + sum._inflight >= cap()) { await run('UPDATE source_posts SET status=?, updated_at=NOW() WHERE source_id=?', [prev, sid]); return 'cap'; }
    sum._inflight += 1;
    await run('UPDATE source_posts SET tries = tries + 1, updated_at=NOW() WHERE source_id=?', [sid]);
    sum.ai += 1;
    await decide(sid, 'ai_call', `${isUpdate ? 'আপডেটের জন্য' : 'নতুন পোস্টের জন্য'} AI লিখছে (আজ ${bn(used + 1)}/${bn(cap())}): ${label}`);
    setStage('AI লিখছে'); const t1 = Date.now(); let ai;
    try { ai = await writePost(scr, cats.map((c) => c.name), DIVISIONS); }
    catch (e) {
      sum._inflight -= 1;
      if (e instanceof AutoAIError) {
        if (e.fatal) { await run('UPDATE source_posts SET status=?, tries=GREATEST(tries-1,0), updated_at=NOW() WHERE source_id=?', [prev, sid]); await run("DELETE FROM source_decisions WHERE source_id=? AND decision='ai_call' ORDER BY id DESC LIMIT 1", [sid]).catch(() => {}); sum.ai = Math.max(0, sum.ai - 1); throw e; }
        return await fail(`AI: ${e.message}`);
      }
      throw e;
    }
    sum._inflight -= 1;
    const usage = usageText(ai); await log(`AI লেখা শেষ (${Math.round((Date.now() - t1) / 1000)} সেকেন্ড)${usage ? ` — ${usage}` : ''}`);
    setStage('সেভ');
    if (isUpdate) {
      const p = await one('SELECT id, status, deleted_at FROM posts WHERE id = ?', [row.my_post_id]);
      let postId; let what;
      if (p && !p.deleted_at && Number(p.status) === 0 && (await autoUpdatePost(p.id, ai, scr, modified, cats))) { postId = p.id; what = `খসড়া #${postId} নতুন করে লেখা হয়েছে (রিভিউ বাকি)`; sum._ids.push(postId); }
      else {
        const liveNote = p && !p.deleted_at ? `সোর্সে আপডেট হওয়া পোস্ট #${p.id}-এর নতুন সংস্করণ। লাইভ পোস্ট বদলানো হয়নি — মিলিয়ে দেখে দরকার হলে ওটা হালনাগাদ করুন।` : 'আগের পোস্ট পাওয়া যায়নি — নতুন খসড়া বানানো হলো।';
        const newId = await autoSave(ai, scr, link, modified, cats, { note: liveNote, skipGuard: true });
        if (!newId) return await fail('AI শিরোনাম দেয়নি — সেভ হয়নি');
        postId = p && !p.deleted_at ? p.id : newId; what = `আলাদা খসড়া #${newId} তৈরি${p && !p.deleted_at ? ` (লাইভ #${p.id} অপরিবর্তিত)` : ''}`; sum._ids.push(newId);
      }
      await run("UPDATE source_posts SET status='done', my_post_id=?, content_hash=?, new_hash=NULL, tries=0, approved=0, job='create', note=?, updated_at=NOW() WHERE source_id=?", [postId, scr.hash, what.slice(0, 250), sid]);
      sum.created += 1; await decide(sid, 'updated', `${what} — ${label}${usage ? ` (${usage})` : ''}`); ev('new', `আপডেট তৈরি: ${label}`, what); return 'updated';
    }
    const id = await autoSave(ai, scr, link, modified, cats, { note: extraNote });
    if (!id) return await fail('AI শিরোনাম দেয়নি — সেভ হয়নি');
    await run("UPDATE source_posts SET status='done', my_post_id=?, content_hash=?, tries=0, approved=0, job='create', note=?, updated_at=NOW() WHERE source_id=?", [id, scr.hash, extraNote ? extraNote.slice(0, 250) : null, sid]);
    sum.created += 1; sum._ids.push(id);
    await decide(sid, 'created', `নতুন খসড়া #${id} তৈরি (রিভিউ বাকি): ${Array.from(String(ai.title || '')).slice(0, 80).join('')}${usage ? ` (${usage})` : ''}`);
    ev('new', `নতুন পোস্ট তৈরি: ${Array.from(String(ai.title || label)).slice(0, 80).join('')}`); return 'created';
  } catch (e) {
    if (e instanceof AutoAIError) throw e;
    return await fail(`অপ্রত্যাশিত ত্রুটি: ${String(e.message).slice(0, 160)}`);
  }
}

/* এডমিনকে প্রতিটি নতুন খসড়ার জন্য আলাদা মেইল (কিউতে) */
async function notifyAdmin(ids) {
  const to = setting('auto_notify_email', '').trim() || setting('contact_email', '').trim();
  if (!ids.length || !to || !smtpConfigured()) return;
  const base = config.baseUrl || setting('site_url', ''); const slug = setting('admin_slug', 'v2admin');
  for (const r of await all('SELECT id, title, company, vacancy, deadline, meta_desc, auto_note FROM posts WHERE id IN (?) ORDER BY id', [ids])) {
    const meta = [r.company, r.vacancy ? `পদ: ${r.vacancy}` : '', r.deadline ? `শেষ: ${String(r.deadline).slice(0, 10).split('-').reverse().join('/')}` : ''].filter(Boolean).map(esc).join(' · ');
    await enqueueMail(to, `🆕 ${Array.from(r.title).slice(0, 90).join('')}`, emailShell({ title: r.title, base, preheader: 'নতুন পোস্ট রিভিউর অপেক্ষায়',
      body: `<div style="font-size:12px;font-weight:700;color:#0f766e;margin-bottom:6px">🤖 নতুন পোস্ট রিভিউর অপেক্ষায়</div><h3 style="margin:0 0 6px;font-size:17px;line-height:1.5">${esc(r.title)}</h3>${meta ? `<p style="margin:0 0 10px;color:#5f716d;font-size:13px">${meta}</p>` : ''}${r.meta_desc ? `<p style="margin:0;color:#33443f;font-size:14px">${esc(r.meta_desc)}</p>` : ''}${r.auto_note ? `<p style="margin:10px 0 0;background:#fff7e8;color:#8a5a08;padding:8px 12px;border-radius:10px;font-size:13px">⚠️ যাচাই করুন: ${esc(r.auto_note)}</p>` : ''}<p style="margin:14px 0 0">${btn(`${base}/${slug}/post?id=${r.id}`, 'রিভিউ করে প্রকাশ করুন')}</p>`, footer: 'স্বয়ংক্রিয় বার্তা' }));
  }
}

/* ═══════════ পুরো রান ═══════════ */
export async function runAuto({ manual = false, limit = 0 } = {}) {
  const sum = { found: 0, created: 0, skipped: 0, failed: 0, updated: 0, msg: '', events: [], stop: '', hint: '', fatal: false, new: 0, upd: 0, review: 0, dup: 0, baseline: 0, ai: 0, _ids: [], _inflight: 0 };
  const ev = (type, text, hint = '') => sum.events.push({ type, text, hint });
  if (!manual && setting('auto_enabled', '0') !== '1') { sum.msg = sum.stop = 'অটোমেশন বন্ধ আছে'; return sum; }
  if (!(await acquire())) { sum.msg = sum.stop = 'আগের রান এখনো চলছে'; sum.hint = 'একটু পরে আবার চেষ্টা করুন।'; return sum; }
  const jobId = crypto.randomBytes(6).toString('hex');
  await setSetting('auto_job', JSON.stringify({ state: 'running', id: jobId, at: Math.floor(Date.now() / 1000) }));
  const hb = setInterval(heartbeat, 60_000);
  try {
    const t0 = Date.now(); const budgetMs = 8 * 60_000;
    await log(`${manual ? 'হাতে চালানো শুরু' : 'নির্ধারিত রান শুরু'} (Node, সোর্স ID ভিত্তিক)`);
    await releaseStale();
    const base = await getState('auto_sp_base');
    if (!base.done) {
      setStage('বেসলাইন');
      const r = await baseline(t0, budgetMs, sum, ev);
      if (r.done) { sum.stop = 'বেসলাইন তৈরি হলো (AI কল ০) — পরের রান থেকে শুধু নতুন পোস্ট আসবে'; sum.found = 0; }
      else { sum.stop = `বেসলাইন চলছে: ${r.why}`; sum.fatal = Boolean(r.error); sum.hint = r.error ? 'কিছুক্ষণ পরে আবার চালান। বারবার হলে সোর্স সাইট হয়তো আমাদের সার্ভার ব্লক করছে।' : 'আবার চালালে বাকিটা শেষ হবে।'; sum.found = r.error ? 0 : 1; }
      return finish(sum);
    }
    setStage('সোর্সের তালিকা পড়া');
    if (!(await discover(sum, ev))) {
      const msg = `সোর্সের REST API সাড়া দিচ্ছে না (${S.lastError}) — AI ডাকা হয়নি। REST ঠিক হলে নিজেই ধরা পড়বে।`;
      await log(msg, 'warn'); ev('fail', 'সোর্সের REST API বন্ধ/ব্লক', msg);
      sum.stop = 'সোর্সের REST API সাড়া দিচ্ছে না — কোনো AI ডাকা হয়নি'; sum.hint = 'সাধারণত সাময়িক। পরের রানে নিজেই চেষ্টা করবে।';
      return finish(sum);
    }
    const cats = await all('SELECT id, name, slug FROM categories ORDER BY sort_order, id');
    const lim = limit > 0 ? limit : Math.max(1, Math.min(5, settingInt('auto_batch', 1)));
    const conc = Math.max(1, Math.min(3, settingInt('auto_concurrency', 2)));
    const skip = new Set(); let checked = 0; let capHit = false;
    outer: while (sum.created < lim && checked < MAX_CHECKS) {
      if (Date.now() - t0 > budgetMs) { sum.stop = 'এই রানের সময় শেষ — বাকিগুলো পরের রানে'; break; }
      const batch = await nextJobs(Math.min(conc, lim - sum.created, MAX_CHECKS - checked), skip);
      if (!batch.length) break;
      batch.forEach((r) => skip.add(Number(r.source_id))); checked += batch.length;
      const results = await Promise.allSettled(batch.map((r) => processOne(r, cats, sum, ev)));
      await heartbeat();
      for (const r of results) {
        if (r.status === 'rejected') {
          const e = r.reason;
          if (e instanceof AutoAIError) { await log(`AI: ${e.message}${e.hint ? ` — সমাধান: ${e.hint}` : ''}`, 'error'); sum.failed += 1; ev('stop', `AI সমস্যা: ${e.message}`, e.hint); sum.stop = `AI সমস্যার কারণে থামানো হয়েছে: ${e.message}`; sum.hint = e.hint; sum.fatal = true; break outer; }
          await log(`অপ্রত্যাশিত ত্রুটি: ${e?.message}`, 'error');
        } else if (r.value === 'cap') capHit = true;
      }
      if (capHit) break;
    }
    if (!sum.stop) {
      if (capHit) sum.stop = `আজকের AI সীমা (${cap()}টি) পূর্ণ — কাল আবার চলবে (সীমা সেটিংস থেকে বদলানো যায়)`;
      else if (sum.created >= lim) sum.stop = `এই রানের কাজ শেষ (${bn(lim)}টি) — বাকিগুলো পরের রানে`;
      else if (checked >= MAX_CHECKS) sum.stop = `একবারে ${bn(MAX_CHECKS)}টির বেশি দেখা হয় না — বাকিগুলো পরের রানে`;
      else if (checked === 0) sum.stop = 'নতুন কোনো পোস্ট নেই — AI ডাকার মতো কিছু নেই';
      else sum.stop = 'প্রসেস করার মতো আর কিছু নেই';
    }
    sum.found = capHit ? 0 : await queueCount();
    if (sum._ids.length) { bumpVersion(); await notifyAdmin(sum._ids); }
    return finish(sum);
  } catch (e) {
    await log(`রান ব্যর্থ: ${e.message}`, 'error'); sum.msg = sum.stop = `ত্রুটি: ${e.message}`; sum.fatal = true; return finish(sum);
  } finally {
    clearInterval(hb); setStage('অপেক্ষায়');
    await setSetting('auto_job', JSON.stringify({ state: 'done', id: jobId, at: Math.floor(Date.now() / 1000), sum: { msg: sum.msg, created: sum.created, found: sum.found } }));
    await release();
  }
}

async function finish(sum) {
  sum.skipped = sum.dup + sum.review; sum.updated = sum.upd;
  sum.msg = `নতুন পাওয়া ${bn(sum.new)}, AI দিয়ে তৈরি ${bn(sum.created)}, সোর্সে আপডেট ${bn(sum.upd)}, রিভিউ দরকার ${bn(sum.review)}, ডুপ্লিকেট ${bn(sum.dup)}, ব্যর্থ ${bn(sum.failed)}`;
  await log(`রান শেষ — ${sum.msg} | কেন থামল: ${sum.stop}`);
  const out = { ...sum }; delete out._ids; delete out._inflight;
  try { await setSetting('auto_last_run', nowStr()); await setSetting('auto_last_sum', sum.msg); await setSetting('auto_last_detail', JSON.stringify({ ...out, events: out.events.slice(0, 15), at: nowStr() })); } catch { /* */ }
  return out;
}

/* ───────── এডমিন পাতার জন্য ───────── */
export async function counts() {
  const c = { baseline: 0, new: 0, processing: 0, done: 0, failed: 0, update_pending: 0, needs_review: 0, skipped_duplicate: 0 };
  for (const r of await all('SELECT status, COUNT(*) n FROM source_posts GROUP BY status')) c[r.status] = Number(r.n);
  return c;
}
export { aiUsedToday, cap as dailyCap, decide, MAX_TRIES };
