/* অটোমেশন: সেটিংস, এখনই চালান, লাইভ লগ, রিভিউ/আপডেট/ব্যর্থ তালিকা */
import crypto from 'node:crypto';
import { all, col, one, run } from '../../../db.js';
import { html } from '../../../core/html.js';
import { ic } from '../../../ui/icons.js';
import { card, field, input, sel, swRow, stat, csrfField } from '../layout.js';
import { setting, setSetting, settingInt } from '../../../core/settings.js';
import { str, int, flag } from '../../../core/forms.js';
import { bn, bnDateTime, timeAgo } from '../../../core/bn.js';
import { runAuto, isRunning, counts, getState, aiUsedToday, dailyCap, decide, stage } from '../../automation/engine.js';
import { config } from '../../../config.js';

const short = (s, n) => Array.from(String(s || '')).slice(0, n).join('');

export default {
  perm: 'settings',
  async post(c) {
    const f = c.fields; const au = c.au;
    if (f.do === 'save') {
      await setSetting('auto_enabled', flag(f.auto_enabled) ? '1' : '0');
      await setSetting('auto_model', str(f.auto_model, 80) || 'gpt-5.6-luna');
      await setSetting('auto_notify_email', str(f.auto_notify_email, 150));
      await setSetting('auto_source', str(f.auto_source, 200).replace(/\/+$/, '') || 'https://bdgovtjob.net');
      if (/^\d{4}-\d{2}-\d{2}$/.test(str(f.auto_start_date))) await setSetting('auto_start_date', str(f.auto_start_date));
      await setSetting('auto_batch', Math.max(1, Math.min(5, int(f.auto_batch, 1))));
      await setSetting('auto_concurrency', Math.max(1, Math.min(3, int(f.auto_concurrency, 2))));
      await setSetting('auto_interval', Math.max(5, Math.min(720, int(f.auto_interval, 30))));
      await setSetting('auto_daily_cap', Math.max(1, Math.min(200, int(f.auto_daily_cap, 10))));
      for (const k of ['auto_price_in', 'auto_price_out']) { const v = str(f[k]); await setSetting(k, v !== '' && Number(v) >= 0 ? String(Number(v)) : ''); }
      if (str(f.auto_openai_key)) await setSetting('auto_openai_key', str(f.auto_openai_key));
      if (flag(f.clear_key)) await setSetting('auto_openai_key', '');
      return c.go('automation', 'ok', 'অটোমেশনের সেটিংস সেভ হয়েছে।');
    }
    if (f.do === 'run') {
      if (await isRunning()) return c.json({ ok: true, busy: true });
      runAuto({ manual: true, limit: Math.max(1, Math.min(5, int(f.limit, 1))) }).catch((e) => console.error('[auto]', e.message));
      return c.json({ ok: true, started: true });
    }
    if (f.do === 'sp_act') {
      const sid = int(f.id); const act = str(f.act); const row = sid ? await one('SELECT * FROM source_posts WHERE source_id = ?', [sid]) : null;
      let out = { ok: false, msg: 'পোস্টটি পাওয়া যায়নি — পাতা রিফ্রেশ করুন।' };
      if (row) {
        const st = row.status; const t = short(row.title_raw, 70);
        if (act === 'ai' && ['needs_review', 'baseline', 'skipped_duplicate'].includes(st)) { await run("UPDATE source_posts SET approved=1, note='এডমিন AI দিয়ে তৈরি করতে বলেছেন', updated_at=NOW() WHERE source_id=?", [sid]); await decide(sid, 'admin_ai', `এডমিন নতুন হিসেবে তৈরি করতে বলেছেন (AI) — ${t}`); out = { ok: true, run: true, msg: 'সারিতে রাখা হলো — এখনই তৈরি হচ্ছে' }; }
        else if (act === 'skip' && ['needs_review', 'baseline'].includes(st)) { await run("UPDATE source_posts SET status='skipped_duplicate', approved=0, note='এডমিন ডুপ্লিকেট বলেছেন', updated_at=NOW() WHERE source_id=?", [sid]); await decide(sid, 'admin_skip', `এডমিন ডুপ্লিকেট বলে বাদ দিয়েছেন — ${t}`); out = { ok: true, msg: 'বাদ দেওয়া হলো' }; }
        else if (act === 'update' && st === 'update_pending') { await run("UPDATE source_posts SET approved=1, job='update', note='এডমিন আপডেট করতে বলেছেন', updated_at=NOW() WHERE source_id=?", [sid]); await decide(sid, 'admin_update', `এডমিন আপডেট করতে বলেছেন (AI) — ${t}`); out = { ok: true, run: true, msg: 'সারিতে রাখা হলো — এখনই আপডেট হচ্ছে' }; }
        else if (act === 'ignore' && st === 'update_pending') { await run("UPDATE source_posts SET status='done', content_hash=COALESCE(new_hash, content_hash), new_hash=NULL, approved=0, note='এডমিন সোর্সের আপডেট বাদ দিয়েছেন', updated_at=NOW() WHERE source_id=?", [sid]); await decide(sid, 'admin_ignore', `এডমিন সোর্সের আপডেট বাদ দিয়েছেন — ${t}`); out = { ok: true, msg: 'আপডেট বাদ — যেমন ছিল তেমনই থাকল' }; }
        else out = { ok: false, msg: 'এই অবস্থায় এটা করা যায় না — পাতা রিফ্রেশ করুন।' };
      }
      if (out.run && !(await isRunning())) runAuto({ manual: true, limit: 1 }).catch(() => {});
      return c.json(out);
    }
    if (f.do === 'sp_retry') { const r = await run("UPDATE source_posts SET tries=0, updated_at=DATE_SUB(NOW(), INTERVAL 1 HOUR), note='এডমিন আবার চেষ্টা করতে বলেছেন' WHERE status='failed'"); return c.go('automation', 'ok', r.affectedRows ? `${bn(r.affectedRows)}টি ব্যর্থ পোস্ট আবার চেষ্টার সারিতে — “এখনই চালান” চাপলে বা পরের রানে হবে।` : 'ব্যর্থ কোনো পোস্ট নেই।'); }
    if (f.do === 'sp_rebaseline') {
      if (await isRunning()) return c.go('automation', 'err', 'একটি রান এখন চলছে — শেষ হলে আবার চাপুন।');
      await run("UPDATE source_posts SET status='done', content_hash=COALESCE(new_hash, content_hash), new_hash=NULL, approved=0, note='রিসেট: আগের অবস্থায়', updated_at=NOW() WHERE status IN ('update_pending','failed') AND my_post_id IS NOT NULL");
      const r = await run("UPDATE source_posts SET status='baseline', approved=0, tries=0, note='রিসেট করে বেসলাইনে', updated_at=NOW() WHERE status IN ('new','failed','needs_review','skipped_duplicate') AND my_post_id IS NULL");
      await setSetting('auto_sp_base', JSON.stringify({ page: 1, count: 0, done: 0 }));
      return c.go('automation', 'ok', `রিসেট হয়েছে (${bn(r.affectedRows)}টি বেসলাইনে)। পরের রানে সোর্সের সব পোস্ট আবার বেসলাইনে উঠবে — AI ডাকা হবে না।`);
    }
    if (f.do === 'new_key') { await setSetting('auto_cron_key', crypto.randomBytes(16).toString('hex')); return c.go('automation', 'ok', 'নতুন cron কী তৈরি হয়েছে — URL cron ব্যবহার করলে সেখানেও বদলে নিন।'); }
    return c.go('automation');
  },

  async get(c) {
    if (c.query.json === 'status') {
      const rows = (await all('SELECT level, msg, created_at FROM auto_log ORDER BY id DESC LIMIT 40')).map((l) => ({ ...l, t: String(l.created_at).slice(5, 16).replace('-', '/').replace(' ', ' ') }));
      let job = {}; try { job = JSON.parse(setting('auto_job', '{}')); } catch { /* */ }
      const live = await isRunning();
      if (job.state === 'running' && !live) job.state = 'dead';
      return c.json({ ok: true, rows, job, stage: live ? stage.v : '', pending: Number(await col('SELECT COUNT(*) FROM posts WHERE review_pending = 1 AND deleted_at IS NULL', [], 0)) });
    }
    if (!setting('auto_cron_key')) await setSetting('auto_cron_key', crypto.randomBytes(16).toString('hex'));
    const au = c.au; const s = (k, d = '') => setting(k, d);
    const [cn, used, pending, today, review, upd, fail, base] = await Promise.all([counts(), aiUsedToday(), col('SELECT COUNT(*) FROM posts WHERE review_pending = 1 AND deleted_at IS NULL', [], 0), col('SELECT COUNT(*) FROM posts WHERE is_auto = 1 AND DATE(published_at) = CURDATE()', [], 0),
      all("SELECT sp.*, p.title my_title FROM source_posts sp LEFT JOIN posts p ON p.id = sp.match_post_id WHERE sp.status = 'needs_review' ORDER BY sp.updated_at DESC LIMIT 50"),
      all("SELECT sp.*, p.title my_title, p.status my_status FROM source_posts sp LEFT JOIN posts p ON p.id = sp.my_post_id WHERE sp.status = 'update_pending' ORDER BY sp.updated_at DESC LIMIT 50"),
      all("SELECT * FROM source_posts WHERE status = 'failed' ORDER BY updated_at DESC LIMIT 30"),
      all("SELECT * FROM source_posts WHERE status = 'baseline' AND my_post_id IS NULL ORDER BY source_date DESC LIMIT 30")]);
    const dec = await all('SELECT d.*, sp.title_raw FROM source_decisions d LEFT JOIN source_posts sp ON sp.source_id = d.source_id ORDER BY d.id DESC LIMIT 30');
    const logs = await all('SELECT * FROM auto_log ORDER BY id DESC LIMIT 40');
    const bs = await getState('auto_sp_base'); const enabled = s('auto_enabled', '0') === '1'; const hasKey = Boolean(s('auto_openai_key'));
    let detail = null; try { detail = JSON.parse(s('auto_last_detail', '')); } catch { /* */ }
    const base_ = config.baseUrl || s('site_url', '') || `https://${c.req.headers.host}`;
    const cronUrl = `${base_}/cron/tick?key=${s('auto_cron_key')}`;
    const IC = { new: ['check-circle', 'ok'], skip: ['arrow-r', ''], fail: ['alert', 'warn'], stop: ['x-circle', 'err'] };
    const item = (r, acts, sub = '') => html`<div class="ad-row" data-sid="${r.source_id}"><div class="grow"><a class="ttl" href="${r.source_link}" target="_blank" rel="noopener">${r.title_raw}</a><div class="sub">${sub}${r.note ? ` · ${r.note}` : ''}</div></div><div class="row-act">${acts}</div></div>`;
    const actBtn = (act, label, cls = '') => html`<button type="button" class="btn sm ${cls}" data-spact="${act}">${label}</button>`;
    return c.page('অটোমেশন', html`
${!hasKey ? html`<div class="msg err">${ic('key')}OpenAI API key দেওয়া হয়নি — এটা ছাড়া অটোমেশন চলবে না। নিচে বসিয়ে সেভ করুন।</div>` : ''}
<div class="grid stats">${stat({ icon: 'bot', tone: enabled ? 'g' : 'r', label: 'অবস্থা', value: enabled ? 'চালু' : 'বন্ধ', sub: `প্রতি ${bn(settingInt('auto_interval', 30))} মিনিটে` })}${stat({ icon: 'clock', tone: 'y', label: 'রিভিউ বাকি', value: bn(pending), sub: pending ? html`<a href="${au('posts?review=1')}">এখনই দেখুন</a>` : 'সব দেখা হয়েছে' })}${stat({ icon: 'sparkles', tone: 'p', label: 'আজ AI ব্যবহার', value: `${bn(used)}/${bn(dailyCap())}`, sub: `আজ তৈরি ${bn(today)}` })}${stat({ icon: 'history', tone: '', label: 'শেষ রান', value: s('auto_last_run') ? timeAgo(s('auto_last_run')) : '—', sub: s('auto_last_sum', 'এখনো চলেনি') })}</div>
${card('এখনই চালান', 'play', html`<p class="hint" style="margin-top:0">পেছনে চলে — সাইট বা এই পাতা আটকায় না। নতুন পোস্ট এলে AI লেখে, <b>খসড়া</b> হিসেবে রাখে, আপনাকে মেইল করে — নিজে প্রকাশ করে না।</p>
<div class="run-box" id="runBox" hidden>${ic('refresh', 'spin')}<span id="runStatus">চলছে…</span></div>
<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" type="button" id="autoRun">${ic('bot')}এখনই চালান</button>
<form method="post" style="display:inline">${csrfField(c.csrf)}<input type="hidden" name="do" value="sp_retry"><button class="btn sec">${ic('refresh')}ব্যর্থগুলো আবার চেষ্টা</button></form></div>
${detail ? html`<div style="margin-top:14px;display:grid;gap:6px"><div class="sub" style="font-weight:700">শেষ রানের ফলাফল · ${timeAgo(detail.at)}</div>${(detail.events || []).map((x) => { const [i, t] = IC[x.type] || IC.skip; return html`<div class="msg ${t === 'ok' ? 'ok' : t === 'err' ? 'err' : 'info'}" style="margin:0;align-items:flex-start;font-weight:600;font-size:.84rem">${ic(i)}<div><b>${x.text}</b>${x.hint ? html`<div style="font-weight:500;opacity:.85;font-size:.78rem">${x.hint}</div>` : ''}</div></div>`; })}
<div class="msg ${detail.fatal ? 'err' : 'info'}" style="margin:0;align-items:flex-start;font-size:.84rem">${ic(detail.fatal ? 'alert' : 'info')}<div><b>কেন থামল: ${detail.stop || '—'}</b>${detail.hint ? html`<div style="font-weight:500;font-size:.78rem">সমাধান: ${detail.hint}</div>` : ''}</div></div></div>` : ''}`)}
<div class="grid g2">
${card('সোর্স ট্র্যাকিং', 'layers', html`<div class="grid auto" style="grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px">${[['baseline', 'বেসলাইন', ''], ['new', 'নতুন (অপেক্ষায়)', ''], ['done', 'সম্পন্ন', 'ok'], ['needs_review', 'রিভিউ দরকার', 'warn'], ['update_pending', 'সোর্সে আপডেট', 'warn'], ['failed', 'ব্যর্থ', 'err'], ['skipped_duplicate', 'ডুপ্লিকেট/বাদ', '']].map(([k, l]) => html`<div class="stat" style="padding:10px"><span class="sx"><b style="font-size:1.15rem">${bn(cn[k] || 0)}</b><span>${l}</span></span></div>`)}</div>
<p class="hint">বেসলাইন: ${bs.done ? html`সম্পূর্ণ (${bn(bs.count || 0)}টি পোস্ট তালিকাভুক্ত)` : html`চলছে — পাতা ${bn(bs.page || 1)}`}।</p>
<form method="post" style="margin-top:8px">${csrfField(c.csrf)}<input type="hidden" name="do" value="sp_rebaseline"><button class="btn sm sec" data-confirm="সব অপেক্ষমাণ কাজ বেসলাইনে চলে যাবে (AI হবে না)। নিশ্চিত?">${ic('refresh')}রিসেট ও নতুন বেসলাইন</button></form>`)}
${card('সেটিংস', 'cog', html`<form method="post">${csrfField(c.csrf)}<input type="hidden" name="do" value="save">
${swRow('auto_enabled', enabled, 'অটোমেশন চালু', 'নির্ধারিত সময় পরপর নিজে থেকে সোর্স দেখে নতুন পোস্ট খসড়া বানায়')}
<div class="grid g2" style="margin-top:8px">${field('সোর্স সাইট (WordPress)', input('auto_source', s('auto_source', 'https://bdgovtjob.net')))}${field('শুরুর তারিখ', input('auto_start_date', s('auto_start_date', '2026-09-22'), { type: 'date' }))}
${field('OpenAI মডেল', input('auto_model', s('auto_model', 'gpt-5.6-luna')))}${field('OpenAI API key', input('auto_openai_key', '', { type: 'password', ph: hasKey ? '•••••• (বদলাতে চাইলে লিখুন)' : 'sk-…', extra: 'autocomplete="new-password"' }))}
${field('প্রতি রানে সর্বোচ্চ নতুন পোস্ট', sel('auto_batch', s('auto_batch', '1'), [1, 2, 3, 4, 5].map((x) => [x, x])))}${field('একসাথে AI কল (দ্রুত করতে)', sel('auto_concurrency', s('auto_concurrency', '2'), [[1, '১ (ধীর, নিরাপদ)'], [2, '২ (প্রস্তাবিত)'], [3, '৩ (দ্রুত)']]))}
${field('কত মিনিট পরপর চলবে', input('auto_interval', s('auto_interval', '30'), { type: 'number' }))}${field('দিনে সর্বোচ্চ AI কল', input('auto_daily_cap', s('auto_daily_cap', '10'), { type: 'number' }))}
${field('খরচ: প্রতি ১ মিলিয়ন ইনপুট টোকেন ($)', input('auto_price_in', s('auto_price_in'), { ph: 'ঐচ্ছিক' }))}${field('খরচ: প্রতি ১ মিলিয়ন আউটপুট টোকেন ($)', input('auto_price_out', s('auto_price_out'), { ph: 'ঐচ্ছিক' }))}
${field('নতুন খসড়ার খবর যাবে যে ইমেইলে', input('auto_notify_email', s('auto_notify_email', s('contact_email'))))}</div>
${hasKey ? html`<label style="display:flex;gap:8px;align-items:center;font-size:.84rem;margin-top:8px"><input type="checkbox" name="clear_key" value="1"> key মুছে ফেলুন</label>` : ''}
<button class="btn" type="submit" style="margin-top:12px">${ic('save')}সংরক্ষণ</button></form>
<p class="hint">ইমেইল পাঠানোর SMTP সেটিং: <a href="${au('notify')}"><u>নোটিফিকেশন ও ইমেইল</u></a> পাতায়।</p>`)}</div>
${card('ঐচ্ছিক: Hostinger cron (অ্যাপকে জাগিয়ে রাখতে)', 'clock', html`<p class="hint" style="margin-top:0">অ্যাপের ভেতরের শিডিউলারই সব কাজ চালায়। Hostinger অ্যাপ ঘুমিয়ে গেলে শিডিউলারও থামে — তাই hPanel → Advanced → Cron Jobs-এ <b>প্রতি ৫–১০ মিনিটে</b> নিচের একটা হালকা কমান্ড বসান:</p>
<div class="code">curl -fsS "${cronUrl}" &gt; /dev/null</div>
<form method="post" style="margin-top:8px">${csrfField(c.csrf)}<input type="hidden" name="do" value="new_key"><button class="btn sm sec" data-confirm="পুরোনো cron URL কাজ করবে না — নিশ্চিত?">${ic('key')}নতুন কী তৈরি করুন</button></form>`)}
${review.length ? card(`রিভিউ দরকার (${bn(review.length)})`, 'alert', html`${review.map((r) => item(r, html`${actBtn('ai', 'নতুন — AI দিয়ে তৈরি')}${actBtn('skip', 'ডুপ্লিকেট — বাদ', 'sec')}`, r.my_title ? `আমাদের পোস্ট: ${short(r.my_title, 60)}` : ''))}`) : ''}
${upd.length ? card(`সোর্সে আপডেট হয়েছে (${bn(upd.length)})`, 'refresh', html`${upd.map((r) => item(r, html`${actBtn('update', 'আপডেট করুন (AI)')}${actBtn('ignore', 'বাদ দিন', 'sec')}`, r.my_title ? `আমাদের পোস্ট: ${short(r.my_title, 60)} (${Number(r.my_status) ? 'প্রকাশিত' : 'খসড়া'})` : ''))}`) : ''}
${fail.length ? card(`ব্যর্থ (${bn(fail.length)})`, 'x-circle', html`${fail.map((r) => item(r, '', `চেষ্টা ${bn(r.tries)}`))}`) : ''}
${base.length ? html`<details class="a-card"><summary style="cursor:pointer;font-weight:700">বেসলাইনের তালিকা (সর্বশেষ ৩০টি) — দরকারে হাতে AI দিয়ে আনুন</summary><div style="margin-top:12px">${base.map((r) => item(r, html`${actBtn('ai', 'AI দিয়ে তৈরি করুন')}`, bnDateTime(r.source_date)))}</div></details>` : ''}
${card('সিদ্ধান্তের খাতা (সর্বশেষ ৩০)', 'list-check', html`<div class="logbox">${dec.map((d) => html`<div class="al"><span class="t">${String(d.created_at).slice(5, 16)}</span><span><b>${d.decision}</b> — ${d.reason}</span></div>`)}</div>`)}
${card('লাইভ লগ', 'activity', html`<div class="logbox" id="autoLog">${logs.map((l) => html`<div class="al ${l.level}"><span class="t">${String(l.created_at).slice(5, 16)}</span><span>${l.msg}</span></div>`)}</div>`)}
<script>document.addEventListener('click',function(e){var b=e.target.closest('[data-spact]');if(!b)return;var row=b.closest('[data-sid]');var f=new URLSearchParams();f.set('do','sp_act');f.set('id',row.dataset.sid);f.set('act',b.dataset.spact);f.set('_t',document.querySelector('input[name=_t]').value);b.disabled=true;fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:f.toString()}).then(function(r){return r.json()}).then(function(j){admToast(j.msg||'',j.ok?'ok':'err');if(j.ok){row.style.opacity='.45';row.querySelectorAll('button').forEach(function(x){x.disabled=true})}else b.disabled=false})});</script>`);
  },
};
