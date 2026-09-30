'use strict';
/**
 * Content automation pipeline
 *   1. scrape source WordPress sites (REST API)
 *   2. decide what is new / changed / duplicate / expired / roundup — WITHOUT AI
 *   3. send only the new ones to OpenAI (1–3 in parallel, daily limit)
 *   4. AI rewrites & extracts structured fields
 *   5. save as DRAFT (never auto-publishes)
 *   6. mail the admin
 * A DB lock prevents overlapping runs; a lock without heartbeat for 10 minutes is released.
 */
const db = require('../db');
const settings = require('../settings');
const cache = require('../cache');
const mailer = require('../util/mailer');
const uploads = require('../util/uploads');
const notify = require('../notify');
const { clean, strip, truncate, safeUrl, esc } = require('../util/html');
const { slugify, similarity, findDates, findVacancies, enNum, bnNum } = require('../util/bn');
const { explain } = require('./errors');

const LOCK_KEY = 'auto_lock';
const STALE_MS = 10 * 60 * 1000;
const UA = 'Mozilla/5.0 (compatible; CakriCircularBot/2.0; +https://cakricircular.com)';

const ROUNDUP = /(সকল|আজকের|সাপ্তাহিক|সপ্তাহের|চাকরির\s*খবর\s*(পত্রিকা|\d|[০-৯])|জব\s*নিউজ|চাকরির\s*পত্রিকা|job\s*news(paper)?|weekly|round\s*-?up|all\s+(govt|government|job)|top\s*\d+\s*jobs?|একসাথে|একনজরে\s*সব|সব\s*(সরকারি|চাকরি))/i;

/* ------------------------------------------------------------------ lock */
async function acquire(runId) {
  await db.query("INSERT IGNORE INTO settings (k, v) VALUES (?, '')", [LOCK_KEY]);
  const now = Date.now();
  const res = await db.query(
    "UPDATE settings SET v = ? WHERE k = ? AND (v = '' OR CAST(SUBSTRING_INDEX(v, ':', 1) AS UNSIGNED) < ?)",
    [`${now}:${runId}`, LOCK_KEY, now - STALE_MS],
  );
  return res.affectedRows === 1;
}
async function heartbeat(runId) {
  await db.query("UPDATE settings SET v = ? WHERE k = ? AND SUBSTRING_INDEX(v, ':', -1) = ?", [`${Date.now()}:${runId}`, LOCK_KEY, String(runId)]);
}
async function release(runId) {
  await db.query("UPDATE settings SET v = '' WHERE k = ? AND SUBSTRING_INDEX(v, ':', -1) = ?", [LOCK_KEY, String(runId)]);
}
async function isLocked() {
  const v = await db.val('SELECT v FROM settings WHERE k = ?', [LOCK_KEY]);
  if (!v) return false;
  return Date.now() - Number(String(v).split(':')[0]) < STALE_MS;
}
async function unlock() {
  const v = await db.val('SELECT v FROM settings WHERE k = ?', [LOCK_KEY]);
  const runId = v ? String(v).split(':')[1] : null;
  await db.query("UPDATE settings SET v = '' WHERE k = ?", [LOCK_KEY]);
  if (runId) await db.query("UPDATE automation_runs SET status = 'failed', error = 'লক ম্যানুয়ালি মুক্ত করা হয়েছে', finished_at = NOW() WHERE id = ? AND status = 'running'", [runId]);
}
/** Mark runs whose lock went stale (process crashed / restarted) as failed. */
async function reapStale() {
  const running = await db.query("SELECT id FROM automation_runs WHERE status = 'running' AND started_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE)");
  if (!running.length) return;
  if (await isLocked()) return;
  for (const r of running) {
    await db.query("UPDATE automation_runs SET status = 'failed', error = 'কাজটি ১০ মিনিটের বেশি আটকে ছিল, স্বয়ংক্রিয়ভাবে মুক্ত করা হয়েছে', finished_at = NOW() WHERE id = ?", [r.id]);
    await db.insert('automation_logs', { run_id: r.id, level: 'warn', step: 0, message: 'আটকে থাকা কাজ ১০ মিনিট পর মুক্ত করা হয়েছে' });
  }
}

/* ------------------------------------------------------------------ run context */
class Run {
  constructor(id) { this.id = id; this.stats = { found: 0, fresh: 0, skipped: 0, ai_calls: 0, drafts: 0, tokens_in: 0, tokens_out: 0, cost: 0 }; this.step = 0; }
  async log(message, level = 'info') {
    await db.insert('automation_logs', { run_id: this.id, level, step: this.step, message: String(message).slice(0, 2000) });
    await heartbeat(this.id);
  }
  async setStep(n) { this.step = n; await db.update('automation_runs', { step: n }, 'id = ?', [this.id]); await heartbeat(this.id); }
  async save(extra = {}) { await db.update('automation_runs', { ...this.stats, cost: Number(this.stats.cost.toFixed(5)), ...extra }, 'id = ?', [this.id]); }
}

let running = false;

/** Kick off a run in the background. */
async function start(trigger = 'scheduler') {
  if (running) return { ok: false, error: 'অটোমেশন ইতিমধ্যে চলছে' };
  if (trigger === 'scheduler' && !settings.bool('auto_enabled')) return { ok: false, error: 'অটোমেশন বন্ধ আছে' };
  if (!settings.get('openai_key')) return { ok: false, error: 'OpenAI API কী দেওয়া হয়নি (অটোমেশন → সেটিংস)' };
  if (!sources().length) return { ok: false, error: 'কোনো সোর্স URL দেওয়া হয়নি' };
  await reapStale();
  const runId = await db.insert('automation_runs', { trigger_by: trigger, status: 'running' });
  if (!(await acquire(runId))) {
    await db.update('automation_runs', { status: 'skipped', error: 'আরেকটি রান চলছে (লক)', finished_at: new Date() }, 'id = ?', [runId]);
    return { ok: false, error: 'আরেকটি রান চলছে — একসাথে দুইবার চালানো যাবে না' };
  }
  running = true;
  const run = new Run(runId);
  execute(run).catch(async (e) => {
    await run.log(`ত্রুটি: ${explain(e)}`, 'error').catch(() => {});
    await run.save({ status: 'failed', error: explain(e), finished_at: new Date() }).catch(() => {});
  }).finally(async () => {
    running = false;
    await release(runId).catch(() => {});
  });
  return { ok: true, runId };
}

/** Run synchronously (used by the cron URL and tests). */
async function runNow(trigger = 'cron') {
  const r = await start(trigger);
  if (!r.ok) return r;
  while (running) await new Promise((res) => setTimeout(res, 300));
  const row = await db.one('SELECT * FROM automation_runs WHERE id = ?', [r.runId]);
  return { ok: row.status === 'done', run: row };
}

function sources() { return String(settings.get('auto_sources') || '').split(/\s+/).map((s) => s.trim().replace(/\/+$/, '')).filter((s) => /^https?:\/\//.test(s)); }

async function execute(run) {
  await run.log(`অটোমেশন শুরু (${run.id})`);

  /* 1 — scrape */
  await run.setStep(1);
  const batch = settings.int('auto_batch', 6);
  const items = [];
  for (const src of sources()) {
    try {
      const got = await scrape(src, batch);
      await run.log(`${hostOf(src)} থেকে ${bnNum(got.length)} টি পোস্ট পাওয়া গেছে`);
      items.push(...got);
    } catch (e) {
      await run.log(`${hostOf(src)}: ${explain(e)}`, 'error');
    }
  }
  run.stats.found = items.length;
  await run.save();
  if (!items.length) {
    await run.log('কোনো পোস্ট পাওয়া যায়নি', 'warn');
    await run.setStep(6);
    return finish(run);
  }

  /* 2 — dedupe / filter without AI */
  await run.setStep(2);
  const todo = await triage(run, items);
  const usedToday = Number(await db.val('SELECT COALESCE(SUM(ai_calls),0) FROM automation_runs WHERE started_at >= CURDATE() AND id <> ?', [run.id]));
  const remaining = Math.max(0, settings.int('auto_daily_limit', 40) - usedToday);
  const selected = todo.slice(0, Math.min(batch, remaining));
  run.stats.fresh = todo.length;
  await run.save();
  await run.log(`নতুন/পরিবর্তিত: ${bnNum(todo.length)} টি, বাদ: ${bnNum(run.stats.skipped)} টি${todo.length > selected.length ? ` — দৈনিক AI সীমার কারণে ${bnNum(selected.length)} টি প্রসেস হবে` : ''}`);
  if (!selected.length) {
    if (todo.length && !remaining) await run.log('আজকের AI সীমা শেষ, বাকিগুলো পরের দিন প্রসেস হবে', 'warn');
    await run.setStep(6);
    return finish(run);
  }

  /* 3+4 — AI (parallel pool) */
  await run.setStep(3);
  await run.log(`${bnNum(selected.length)} টি পোস্ট OpenAI তে পাঠানো হচ্ছে (একসাথে ${bnNum(settings.int('auto_parallel', 2))} টি)`);
  await run.setStep(4);
  const categories = await db.query('SELECT id, name FROM categories WHERE active = 1 ORDER BY sort');
  const created = [];
  await pool(selected, Math.min(3, Math.max(1, settings.int('auto_parallel', 2))), async (item) => {
    try {
      const ai = await rewrite(item, categories, run);
      /* 5 — save draft */
      if (ai.is_roundup) { await markItem(item, 'skipped', 'AI: সারাংশ/রাউন্ডআপ পোস্ট'); run.stats.skipped++; await run.log(`বাদ (রাউন্ডআপ): ${truncate(item.title, 70)}`); return; }
      if (ai.is_expired) { await markItem(item, 'expired', 'AI: মেয়াদোত্তীর্ণ'); run.stats.skipped++; await run.log(`বাদ (মেয়াদোত্তীর্ণ): ${truncate(item.title, 70)}`); return; }
      const postId = await saveDraft(item, ai, categories);
      await markItem(item, 'processed', item.changed ? 'পরিবর্তিত — খসড়া আপডেট' : 'খসড়া তৈরি', postId);
      run.stats.drafts++;
      created.push({ id: postId, title: ai.title || item.title, changed: item.changed });
      await run.log(`খসড়া ${item.changed ? 'আপডেট' : 'তৈরি'}: ${truncate(ai.title || item.title, 80)}`, 'ok');
    } catch (e) {
      await markItem(item, 'failed', explain(e).slice(0, 250));
      await run.log(`ব্যর্থ: ${truncate(item.title, 60)} — ${explain(e)}`, 'error');
      if (e.fatal) throw e;
    } finally {
      await run.save();
    }
  });
  await run.setStep(5);
  await run.log(`${bnNum(created.length)} টি খসড়া সংরক্ষিত (প্রকাশ করা হয়নি — রিভিউ করুন)`);
  if (created.length) cache.clear();

  /* 6 — mail admin */
  await run.setStep(6);
  if (created.length) {
    await notify.adminNotice('automation', `অটোমেশন: ${bnNum(created.length)} টি নতুন খসড়া`, created.map((c) => c.title).slice(0, 3).join(' • '), '/posts?status=auto');
    await mailAdmin(run, created);
  }
  return finish(run);
}

async function finish(run) {
  await run.save({ status: 'done', finished_at: new Date() });
  await run.log(`শেষ — পাওয়া ${bnNum(run.stats.found)}, নতুন ${bnNum(run.stats.fresh)}, খসড়া ${bnNum(run.stats.drafts)}, খরচ $${run.stats.cost.toFixed(4)}`, 'ok');
  await db.query('DELETE FROM automation_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL 14 DAY)');
}

async function pool(list, n, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(n, list.length) }, async () => {
    while (i < list.length) { const item = list[i++]; await fn(item); }
  });
  await Promise.all(workers);
}

/* ------------------------------------------------------------------ 1. scrape */
function hostOf(u) { try { return new URL(u).host; } catch (_) { return u; } }

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { 'User-Agent': UA, Accept: 'application/json', ...(opts.headers || {}) }, signal: AbortSignal.timeout(opts.timeout || 25000) });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status; err.body = text.slice(0, 600); err.url = url;
    throw err;
  }
  try { return JSON.parse(text); } catch (_) {
    const err = new Error('invalid json'); err.code = 'BAD_JSON'; err.body = text.slice(0, 300); err.url = url; throw err;
  }
}

async function scrape(src, batch) {
  const perPage = Math.min(50, Math.max(10, batch * 4));
  const qs = new URLSearchParams({ per_page: String(perPage), orderby: 'date', order: 'desc', _embed: 'wp:featuredmedia' });
  const start = settings.get('auto_start_date');
  if (start) qs.set('after', `${start}T00:00:00`);
  const list = await fetchJson(`${src}/wp-json/wp/v2/posts?${qs}`);
  if (!Array.isArray(list)) { const e = new Error('not a list'); e.code = 'BAD_JSON'; throw e; }
  const site = hostOf(src);
  return list.map((p) => {
    const media = p._embedded && p._embedded['wp:featuredmedia'] && p._embedded['wp:featuredmedia'][0];
    return {
      site, sourceId: String(p.id), date: p.date || '', modified: p.modified || p.date || '',
      link: p.link || '', title: strip(p.title && p.title.rendered).replace(/&#8211;|&#8212;/g, '-').slice(0, 480),
      html: (p.content && p.content.rendered) || '', excerpt: strip(p.excerpt && p.excerpt.rendered),
      image: media && (media.source_url || (media.media_details && media.media_details.sizes && media.media_details.sizes.full && media.media_details.sizes.full.source_url)) || '',
    };
  });
}

/* ------------------------------------------------------------------ 2. triage (no AI) */
function factsOf(text) {
  const dates = findDates(text).filter((d) => d.getFullYear() >= 2015);
  const future = dates.filter((d) => d > new Date());
  return { vacancies: findVacancies(text), dates, deadline: dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null, hasFuture: future.length > 0 };
}
function sameDay(a, b) { return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

async function triage(run, items) {
  const out = [];
  const keys = items.map((i) => [i.site, i.sourceId]);
  const known = new Map();
  for (let k = 0; k < keys.length; k += 200) {
    const chunk = keys.slice(k, k + 200);
    const rows = await db.raw(`SELECT * FROM automation_items WHERE (source_site, source_id) IN (${chunk.map(() => '(?, ?)').join(',')})`, chunk.flat());
    for (const r of rows) known.set(`${r.source_site}|${r.source_id}`, r);
  }
  const recent = await db.query("SELECT id, title, vacancies, deadline, status FROM posts WHERE status <> 'trash' AND created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY) ORDER BY id DESC LIMIT 3000");
  const startDate = settings.get('auto_start_date') ? new Date(`${settings.get('auto_start_date')}T00:00:00`) : null;
  const seenTitles = [];

  for (const it of items) {
    const key = `${it.site}|${it.sourceId}`;
    const prev = known.get(key);
    const facts = factsOf(`${it.title} ${strip(it.html)}`);
    it.facts = facts;

    if (prev) {
      const sameVersion = prev.source_modified === it.modified && prev.source_date === it.date;
      if (sameVersion && !['failed', 'new'].includes(prev.status)) continue; // already handled — silent
      if (prev.status === 'processed' && prev.post_id) {
        const post = await db.one('SELECT id, status FROM posts WHERE id = ?', [prev.post_id]);
        if (post && post.status === 'published') {
          await markItem(it, 'processed', prev.source_date !== it.date ? 'সোর্সে তারিখ বদলেছে — প্রকাশিত পোস্ট যাচাই করুন' : 'সোর্সে পরিবর্তন — প্রকাশিত পোস্ট যাচাই করুন', post.id);
          await notify.adminNotice('automation', 'সোর্স পোস্ট পরিবর্তিত হয়েছে', it.title, `/posts/${post.id}`);
          await run.log(`পরিবর্তন শনাক্ত (প্রকাশিত পোস্ট, হাত দেওয়া হয়নি): ${truncate(it.title, 70)}`, 'warn');
          continue;
        }
        if (post) { it.changed = true; it.postId = post.id; }
      }
    }
    if (startDate && it.date && new Date(it.date) < startDate) { await skip(run, it, 'skipped', 'শুরুর তারিখের আগের পোস্ট', false); continue; }
    if (ROUNDUP.test(it.title)) { await skip(run, it, 'skipped', 'সারাংশ/রাউন্ডআপ পোস্ট'); continue; }
    if (facts.dates.length && !facts.hasFuture) {
      const newest = facts.deadline;
      if (newest && newest < new Date(Date.now() - 86400000)) { await skip(run, it, 'expired', 'মেয়াদোত্তীর্ণ (সব তারিখ পার হয়ে গেছে)'); continue; }
    }
    if (!it.changed) {
      const dup = findDuplicate(it, recent, seenTitles);
      if (dup) { await skip(run, it, 'duplicate', dup); continue; }
    }
    seenTitles.push({ title: it.title, facts });
    await markItem(it, 'new', it.changed ? 'পরিবর্তিত' : 'নতুন');
    out.push(it);
  }
  return out;
}

function factsMatch(a, b) {
  const vA = a.vacancies; const vB = b.vacancies;
  const vacMatch = vA && vB && vA === vB;
  const dateMatch = a.deadline && b.deadline && sameDay(a.deadline, b.deadline);
  const noFacts = !(vA && vB) && !(a.deadline && b.deadline);
  return vacMatch || dateMatch || noFacts;
}

function findDuplicate(it, recent, seen) {
  for (const s of seen) {
    if (similarity(it.title, s.title) >= 0.85 && factsMatch(it.facts, s.facts)) return 'ডুপ্লিকেট (একই রানে একই পোস্ট)';
  }
  for (const p of recent) {
    const sim = similarity(it.title, p.title);
    if (sim < 0.85) continue;
    const pf = { vacancies: findVacancies(`পদসংখ্যা ${enNum(p.vacancies || '')}`), deadline: p.deadline ? new Date(p.deadline) : null };
    if (factsMatch(it.facts, pf)) return `ডুপ্লিকেট (মিল ${bnNum(Math.round(sim * 100))}% — পোস্ট #${bnNum(p.id)})`;
  }
  return null;
}

async function skip(run, it, status, reason, count = true) {
  await markItem(it, status, reason);
  if (count) run.stats.skipped++;
  await run.log(`বাদ: ${truncate(it.title, 70)} — ${reason}`);
}

async function markItem(it, status, reason = '', postId = undefined) {
  await db.query(
    `INSERT INTO automation_items (source_site, source_id, source_modified, source_date, title, link, status, reason, post_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE source_modified = VALUES(source_modified), source_date = VALUES(source_date), title = VALUES(title), link = VALUES(link),
       status = VALUES(status), reason = VALUES(reason), post_id = COALESCE(VALUES(post_id), post_id), updated_at = NOW()`,
    [it.site, it.sourceId, it.modified, it.date, it.title.slice(0, 500), it.link.slice(0, 500), status, String(reason).slice(0, 255), postId === undefined ? (it.postId || null) : postId],
  );
}

/* ------------------------------------------------------------------ 3/4. AI rewrite */
function prompt(item, categories) {
  const catNames = categories.map((c) => c.name).join(', ');
  const today = new Date().toISOString().slice(0, 10);
  const system = `তুমি একজন অভিজ্ঞ বাংলা চাকরির খবর সম্পাদক। নিচের সোর্স পোস্ট থেকে তথ্য নিয়ে সম্পূর্ণ নিজের ভাষায়, নির্ভুল, পরিষ্কার ও প্রফেশনাল বাংলায় একটি নতুন পোস্ট লিখবে।
নিয়ম:
- কোনো তথ্য বানাবে না; সোর্সে না থাকলে ফাঁকা ("") রাখবে।
- content_html এ শুধু <h2>, <h3>, <p>, <ul>, <ol>, <li>, <b>, <table>, <tr>, <th>, <td>, <a> ট্যাগ ব্যবহার করবে। শুরুতে ২-৩ লাইনের ভূমিকা, তারপর "এক নজরে" টেবিল, যোগ্যতা, আবেদনের নিয়ম, গুরুত্বপূর্ণ তারিখ।
- সোর্স সাইটের নাম, লিংক বা বিজ্ঞাপন রাখবে না।
- সংখ্যা ও তারিখ লেখায় বাংলা অঙ্ক ব্যবহার করবে; কিন্তু start_date/deadline ফিল্ড ISO (YYYY-MM-DD)।
- category অবশ্যই এই তালিকা থেকে একটি: ${catNames}
- যদি পোস্টটি অনেকগুলো চাকরির সারাংশ/রাউন্ডআপ/পত্রিকা হয় তাহলে is_roundup=true।
- আবেদনের শেষ তারিখ আজকের (${today}) আগে হলে is_expired=true।
${settings.get('auto_prompt_extra') ? `- অতিরিক্ত নির্দেশনা: ${settings.get('auto_prompt_extra')}` : ''}
শুধু JSON ফেরত দেবে, এই কী গুলো সহ:
{"title","excerpt","content_html","organization","vacancies","salary","division","district","job_type","education","start_date","deadline","apply_url","category","keywords":[],"meta_title","meta_description","is_roundup":false,"is_expired":false}`;
  const body = truncate(strip(item.html.replace(/<\/(p|li|tr|h\d)>/gi, '\n')).replace(/\n{2,}/g, '\n'), 9000);
  const links = [...item.html.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]).filter((u) => !u.includes(item.site)).slice(0, 8);
  return [
    { role: 'system', content: system },
    { role: 'user', content: `শিরোনাম: ${item.title}\nপ্রকাশ: ${item.date}\n\nকনটেন্ট:\n${body}\n\nবাহ্যিক লিংক (আবেদন/PDF হতে পারে):\n${links.join('\n') || 'নেই'}` },
  ];
}

async function callOpenAI(messages, attempt = 0) {
  const base = (settings.get('openai_base') || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = settings.get('openai_model') || 'gpt-4o-mini';
  const payload = { model, messages, response_format: { type: 'json_object' } };
  if (!/^(gpt-5|o\d)/.test(model)) payload.temperature = 0.4;
  try {
    return await fetchJson(`${base}/chat/completions`, {
      method: 'POST', timeout: 90000,
      headers: { Authorization: `Bearer ${settings.get('openai_key')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    const retryable = e.status === 429 && !/insufficient_quota/.test(e.body || '') || (e.status >= 500) || e.name === 'TimeoutError';
    if (retryable && attempt < 2) {
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
      return callOpenAI(messages, attempt + 1);
    }
    if (e.status === 401 || /insufficient_quota/.test(e.body || '')) e.fatal = true;
    throw e;
  }
}

async function rewrite(item, categories, run) {
  const res = await callOpenAI(prompt(item, categories));
  run.stats.ai_calls++;
  const usage = res.usage || {};
  run.stats.tokens_in += usage.prompt_tokens || 0;
  run.stats.tokens_out += usage.completion_tokens || 0;
  run.stats.cost += ((usage.prompt_tokens || 0) * parseFloat(settings.get('auto_price_in') || 0) + (usage.completion_tokens || 0) * parseFloat(settings.get('auto_price_out') || 0)) / 1e6;
  const text = res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content;
  let data;
  try { data = JSON.parse(String(text || '').replace(/^```(json)?|```$/g, '').trim()); } catch (_) { const e = new Error('AI JSON parse'); e.code = 'AI_JSON'; throw e; }
  if (!data || typeof data !== 'object') { const e = new Error('AI JSON parse'); e.code = 'AI_JSON'; throw e; }
  return data;
}

/* ------------------------------------------------------------------ 5. save draft */
function isoDate(v, end = false) {
  const s = enNum(String(v || '')).trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  const d = new Date(`${s.slice(0, 10)}T${end ? '23:59:00' : '00:00:00'}`);
  return isNaN(d) ? null : d;
}

async function uniqueSlug(base, excludeId = 0) {
  let slug = base || `post-${Date.now().toString(36)}`;
  for (let i = 2; await db.one('SELECT id FROM posts WHERE slug = ? AND id <> ?', [slug, excludeId]); i++) slug = `${base}-${bnNum(i)}`;
  return slug;
}

async function fetchImage(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    const len = Number(res.headers.get('content-length') || 0);
    if (len > 10 * 1024 * 1024) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return await uploads.saveImage(buf, 'thumb');
  } catch (_) { return null; }
}

async function saveDraft(item, ai, categories) {
  const catName = String(ai.category || '').trim();
  const cat = categories.find((c) => c.name === catName) || categories.find((c) => catName && (c.name.includes(catName) || catName.includes(c.name)));
  const defaultCat = settings.int('auto_default_category', 0);
  const title = strip(ai.title || item.title).slice(0, 500);
  const keywords = Array.isArray(ai.keywords) ? ai.keywords.map((k) => strip(k)).filter(Boolean).slice(0, 12).join(', ') : strip(ai.keywords || '');
  const deadline = isoDate(ai.deadline, true) || (item.facts.hasFuture ? item.facts.deadline : null);
  const row = {
    title, category_id: (defaultCat || (cat && cat.id)) || null,
    organization: strip(ai.organization).slice(0, 250), vacancies: strip(ai.vacancies).slice(0, 100), salary: strip(ai.salary).slice(0, 180),
    division: strip(ai.division).slice(0, 80), district: strip(ai.district).slice(0, 80), job_type: strip(ai.job_type).slice(0, 80), education: strip(ai.education).slice(0, 250),
    start_date: isoDate(ai.start_date), deadline,
    content: clean(ai.content_html || ''), excerpt: strip(ai.excerpt).slice(0, 600),
    apply_url: safeUrl(ai.apply_url).slice(0, 500), source_url: item.link.slice(0, 500),
    keywords: keywords.slice(0, 500), meta_title: strip(ai.meta_title).slice(0, 250), meta_desc: strip(ai.meta_description).slice(0, 500),
    status: 'draft', auto_generated: 1, source_key: `${item.site}|${item.sourceId}`.slice(0, 191), updated_at: new Date(),
  };
  if (!row.content) row.content = clean(`<p>${esc(item.excerpt)}</p>`);
  if (item.changed && item.postId) {
    await db.update('posts', row, "id = ? AND status = 'draft'", [item.postId]);
    return item.postId;
  }
  row.slug = await uniqueSlug(slugify(title));
  row.thumbnail = await fetchImage(item.image);
  return db.insert('posts', { ...row, created_at: new Date() });
}

/* ------------------------------------------------------------------ 6. mail */
async function mailAdmin(run, created) {
  const to = settings.get('auto_notify_email');
  if (!to || !mailer.configured()) { await run.log('নোটিফাই ইমেইল/SMTP সেট করা নেই — মেইল পাঠানো হয়নি', 'warn'); return; }
  const base = `https://${settings.get('site_domain')}${settings.adminPath()}`;
  try {
    await mailer.send({
      to, subject: `অটোমেশন: ${bnNum(created.length)} টি নতুন খসড়া রিভিউয়ের অপেক্ষায়`,
      html: `<p>অটোমেশন নিচের খসড়াগুলো তৈরি করেছে। যাচাই করে প্রকাশ করুন:</p><ol>${created.map((c) => `<li style="margin-bottom:8px"><a href="${base}/posts/${c.id}">${esc(c.title)}</a>${c.changed ? ' <small>(আপডেট)</small>' : ''}</li>`).join('')}</ol>
<p style="color:#64748b;font-size:13px">AI কল: ${bnNum(run.stats.ai_calls)} · আনুমানিক খরচ: $${run.stats.cost.toFixed(4)}</p>
<p><a href="${base}/posts?status=auto" style="display:inline-block;background:#15803d;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">সব খসড়া দেখুন</a></p>`,
    });
    await run.log(`এডমিনকে মেইল পাঠানো হয়েছে (${to})`, 'ok');
  } catch (e) {
    await run.log(`মেইল পাঠানো যায়নি: ${e.message}`, 'warn');
  }
}

async function testKey() {
  try {
    const base = (settings.get('openai_base') || 'https://api.openai.com/v1').replace(/\/+$/, '');
    await fetchJson(`${base}/models`, { headers: { Authorization: `Bearer ${settings.get('openai_key')}` }, timeout: 15000 });
    return { ok: true, model: settings.get('openai_model') };
  } catch (e) { return { ok: false, error: explain(e) }; }
}

module.exports = { start, runNow, isLocked, unlock, reapStale, testKey, triage, findDuplicate, factsOf, ROUNDUP, isRunning: () => running };
