/* ─────────────────────────────────────────────
   নোটিফিকেশন API: পুশ সাবস্ক্রিপশন, ইমেইল সাবস্ক্রিপশন (double opt-in), আনসাবস্ক্রাইব
   ───────────────────────────────────────────── */
import crypto from 'node:crypto';
import { one, run, all } from '../../db.js';
import { hit } from '../../core/ratelimit.js';
import { clientIp } from '../track/track.js';
import { setting } from '../../core/settings.js';
import { html } from '../../core/html.js';
import { renderPage } from '../../ui/layout.js';
import { ic } from '../../ui/icons.js';
import { makeCtx } from '../site/routes.js';
import { sendMail, emailShell, btn, smtpConfigured } from './mailer.js';
import { ensureVapid } from './push.js';
import { config } from '../../config.js';

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const sameHost = (req) => { const o = req.headers.origin || req.headers.referer; if (!o) return true; try { return new URL(o).host.replace(/^www\./, '') === String(req.headers['x-forwarded-host'] || req.headers.host).replace(/^www\./, ''); } catch { return false; } };
const cleanIds = (a, max = 60) => [...new Set((Array.isArray(a) ? a : []).map((x) => parseInt(x, 10)).filter((n) => n > 0))].slice(0, max);

async function msgPage(req, reply, { icon, title, text, ok = true }) {
  const ctx = makeCtx(req);
  const body = html`<div class="card empty" style="padding:48px 20px"><span class="dlg-ic ${ok ? '' : 'err'}" style="width:70px;height:70px;border-radius:50%;display:grid;place-items:center;font-size:1.9rem;background:var(--${ok ? 'ok' : 'bad'}-soft);color:var(--${ok ? 'ok' : 'bad'})">${ic(icon)}</span><h1 style="font-size:1.3rem">${title}</h1><p style="color:var(--text-2);max-width:380px">${text}</p><a class="btn" href="/">${ic('home')}হোমে যান</a></div>`;
  return reply.type('text/html; charset=utf-8').header('Cache-Control', 'no-store').send(await renderPage(ctx, { title: `${title} | ${setting('site_name', 'চাকরি সার্কুলার')}`, desc: title, robots: 'noindex', nav: '', page: 'notify', noAside: true, body }));
}

export async function notifyRoutes(app) {
  await ensureVapid().catch((e) => console.error('[vapid]', e.message));

  app.post('/api/notify/push', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!sameHost(req)) return reply.code(403).send({ ok: false });
    if (!hit(`push:${clientIp(req)}`, 20, 3600_000)) return { ok: false, msg: 'অনেকবার চেষ্টা হয়েছে' };
    const { subscription: s, cats, saved } = req.body || {};
    if (!s?.endpoint || !/^https:\/\//.test(s.endpoint) || !s.keys?.p256dh || !s.keys?.auth || s.endpoint.length > 1000) return { ok: false, msg: 'অবৈধ সাবস্ক্রিপশন' };
    const hash = crypto.createHash('sha1').update(s.endpoint).digest('hex');
    await run(`INSERT INTO push_subscriptions (endpoint_hash, endpoint, p256dh, auth, cats, ua, created_at) VALUES (?,?,?,?,?,?,NOW())
      ON DUPLICATE KEY UPDATE endpoint=VALUES(endpoint), p256dh=VALUES(p256dh), auth=VALUES(auth), cats=VALUES(cats), fails=0`,
    [hash, s.endpoint, s.keys.p256dh, s.keys.auth, cleanIds(cats, 20).join(','), String(req.headers['user-agent'] || '').slice(0, 190)]);
    const row = await one('SELECT id FROM push_subscriptions WHERE endpoint_hash = ?', [hash]);
    await replaceSaved(row.id, cleanIds(saved));
    return { ok: true };
  });
  async function replaceSaved(subId, ids) {
    await run('DELETE FROM push_saved WHERE sub_id = ?', [subId]);
    if (ids.length) await run('INSERT IGNORE INTO push_saved (sub_id, post_id, created_at) VALUES ?', [ids.map((id) => [subId, id, new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 19).replace('T', ' ')])]);
  }
  app.post('/api/notify/saved', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    const { endpoint, ids } = req.body || {};
    if (!endpoint) return { ok: false };
    const row = await one('SELECT id FROM push_subscriptions WHERE endpoint_hash = ?', [crypto.createHash('sha1').update(String(endpoint)).digest('hex')]);
    if (!row) return { ok: false };
    await replaceSaved(row.id, cleanIds(ids));
    return { ok: true };
  });
  app.post('/api/notify/push/remove', async (req) => {
    const { endpoint } = req.body || {};
    if (endpoint) await run('DELETE FROM push_subscriptions WHERE endpoint_hash = ?', [crypto.createHash('sha1').update(String(endpoint)).digest('hex')]);
    return { ok: true };
  });

  app.post('/api/notify/email', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!sameHost(req)) return reply.code(403).send({ ok: false });
    const b = req.body || {};
    if (b.website) return { ok: true, msg: 'ধন্যবাদ!' };
    const ip = clientIp(req);
    if (!hit(`mail:${ip}`, 5, 3600_000)) return { ok: false, msg: 'অনেকবার চেষ্টা হয়েছে। এক ঘণ্টা পরে আবার চেষ্টা করুন।' };
    const email = String(b.email || '').trim().toLowerCase();
    if (!EMAIL.test(email)) return { ok: false, msg: 'সঠিক ইমেইল ঠিকানা দিন।' };
    const mode = b.mode === 'instant' ? 'instant' : 'daily';
    const cats = cleanIds(b.cats, 20).join(',');
    const ex = await one('SELECT * FROM email_subscribers WHERE email = ?', [email]);
    const token = ex?.token || crypto.randomBytes(16).toString('hex');
    if (ex && ex.confirmed && !ex.unsub_at) {
      await run('UPDATE email_subscribers SET mode=?, cats=? WHERE id=?', [mode, cats, ex.id]);
      return { ok: true, msg: 'আপনি আগেই সাবস্ক্রাইব করেছেন — পছন্দ হালনাগাদ করা হয়েছে।' };
    }
    if (ex) await run('UPDATE email_subscribers SET mode=?, cats=?, confirmed=0, unsub_at=NULL, ip=? WHERE id=?', [mode, cats, ip, ex.id]);
    else await run('INSERT INTO email_subscribers (email, token, mode, cats, created_at, ip) VALUES (?,?,?,?,NOW(),?)', [email, token, mode, cats, ip]);
    const base = config.baseUrl || makeCtx(req).base;
    const link = `${base}/notify/confirm?t=${token}`;
    const res = await sendMail(email, `ইমেইল নিশ্চিত করুন — ${setting('site_name', 'চাকরি সার্কুলার')}`, emailShell({ title: 'ইমেইল নিশ্চিত করুন', base,
      body: `<h2 style="margin:0 0 8px;font-size:19px">আর একটি ধাপ বাকি</h2><p style="margin:0 0 12px;color:#4a5d59">নতুন চাকরির খবর ${mode === 'daily' ? 'প্রতিদিন সকালে একটি মেইলে' : 'নতুন বিজ্ঞপ্তি আসা মাত্র'} পেতে নিচের বাটনে চাপ দিয়ে ইমেইল নিশ্চিত করুন।</p>${btn(link, 'ইমেইল নিশ্চিত করুন')}<p style="margin:14px 0 0;font-size:12px;color:#5f716d">আপনি এটি না চাইলে মেইলটি উপেক্ষা করুন — কিছুই হবে না।</p>`,
      footer: 'এটি একটি নিশ্চিতকরণ মেইল।' }));
    if (!res.ok) { console.error('[mail confirm]', res.err); return { ok: false, msg: smtpConfigured() ? 'মেইল পাঠানো যায়নি। একটু পরে আবার চেষ্টা করুন।' : 'ইমেইল সার্ভিস এখনো চালু হয়নি। নোটিফিকেশন বেছে নিন।' }; }
    return { ok: true, msg: 'নিশ্চিতকরণ মেইল পাঠানো হয়েছে — ইনবক্স (বা স্প্যাম) দেখুন।' };
  });

  app.get('/notify/confirm', async (req, reply) => {
    const t = String(req.query.t || '');
    const row = /^[a-f0-9]{32}$/.test(t) ? await one('SELECT * FROM email_subscribers WHERE token = ?', [t]) : null;
    if (!row) return msgPage(req, reply, { icon: 'alert', title: 'লিংকটি সঠিক নয়', text: 'লিংকটি ভুল বা মেয়াদ শেষ হয়ে গেছে। আবার সাবস্ক্রাইব করে দেখুন।', ok: false });
    await run('UPDATE email_subscribers SET confirmed=1, confirmed_at=NOW(), unsub_at=NULL WHERE id=?', [row.id]);
    return msgPage(req, reply, { icon: 'check-circle', title: 'সাবস্ক্রিপশন নিশ্চিত হয়েছে', text: `ধন্যবাদ! এখন থেকে নতুন চাকরির খবর ${row.mode === 'daily' ? 'প্রতিদিন সকালে' : 'সাথে সাথে'} আপনার ইমেইলে পৌঁছে যাবে।` });
  });
  const unsub = async (req, reply) => {
    const t = String((req.query && req.query.t) || '');
    const row = /^[a-f0-9]{32}$/.test(t) ? await one('SELECT * FROM email_subscribers WHERE token = ?', [t]) : null;
    if (!row) return msgPage(req, reply, { icon: 'alert', title: 'লিংকটি সঠিক নয়', text: 'আনসাবস্ক্রাইব লিংকটি ভুল।', ok: false });
    await run('UPDATE email_subscribers SET unsub_at=NOW() WHERE id=?', [row.id]);
    return msgPage(req, reply, { icon: 'bell-off', title: 'সাবস্ক্রিপশন বন্ধ হয়েছে', text: 'আপনাকে আর ইমেইল পাঠানো হবে না। চাইলে যেকোনো সময় আবার সাবস্ক্রাইব করতে পারবেন।' });
  };
  app.get('/notify/unsub', unsub); app.post('/notify/unsub', unsub);
}
