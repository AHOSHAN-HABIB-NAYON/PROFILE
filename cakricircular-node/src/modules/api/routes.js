/* ─────────────────────────────────────────────
   পাবলিক API: ট্র্যাক, নোটিশ সংখ্যা, রিপোর্ট, সেভ করা পোস্ট
   ───────────────────────────────────────────── */
import { all, col, run } from '../../db.js';
import { hit } from '../../core/ratelimit.js';
import { html } from '../../core/html.js';
import { trackVisit, clientIp } from '../track/track.js';
import { postCard } from '../../ui/components.js';
import { listPosts } from '../site/data.js';

const okOrigin = (req) => {
  const o = req.headers.origin || req.headers.referer;
  if (!o) return true;
  try { return new URL(o).host.replace(/^www\./, '') === String(req.headers['x-forwarded-host'] || req.headers.host).replace(/^www\./, ''); } catch { return false; }
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function apiRoutes(app) {
  app.addHook('onRequest', async (req, reply) => { reply.header('X-Robots-Tag', 'noindex').header('Cache-Control', 'no-store'); });

  app.post('/api/track', async (req, reply) => {
    const p = String(req.body?.path || '/').slice(0, 190);
    trackVisit(req, reply, p);
    return { ok: true };
  });

  app.get('/api/notices', async (req) => {
    const since = Number(req.query.since) || 0;
    const unread = Number(await col('SELECT COUNT(*) FROM notices WHERE is_active = 1 AND UNIX_TIMESTAMP(created_at) > ?', [since], 0));
    const latest = Number(await col('SELECT COALESCE(UNIX_TIMESTAMP(MAX(created_at)), 0) FROM notices WHERE is_active = 1', [], 0));
    return { ok: true, unread, latest };
  });

  app.post('/api/report', async (req, reply) => {
    if (!okOrigin(req)) return reply.code(403).send({ ok: false, msg: 'অনুরোধটি গ্রহণ করা হয়নি।' });
    const b = req.body || {};
    if (b.website) return { ok: true, msg: 'ধন্যবাদ!' }; // হানিপট — বট ধরা
    const ip = clientIp(req);
    if (!hit(`report:${ip}`, 5, 3600_000)) return { ok: false, msg: 'অনেকবার পাঠানো হয়েছে। এক ঘণ্টা পরে আবার চেষ্টা করুন।' };
    const email = String(b.email || '').trim(); const title = String(b.title || '').trim(); const details = String(b.details || '').trim();
    if (!EMAIL.test(email) && !/^[+\d][\d\s-]{6,}$/.test(email)) return { ok: false, msg: 'সঠিক ইমেইল বা ফোন নম্বর দিন।' };
    if (Array.from(title).length < 3) return { ok: false, msg: 'বিষয় লিখুন।' };
    if (Array.from(details).length < 10) return { ok: false, msg: 'বিস্তারিত অন্তত ১০ অক্ষরের লিখুন।' };
    await run('INSERT INTO reports (email, title, details, ip, status, created_at) VALUES (?,?,?,?,0,NOW())', [email.slice(0, 150), title.slice(0, 190), details.slice(0, 2000), ip]);
    return { ok: true, msg: 'ধন্যবাদ! আপনার রিপোর্ট আমাদের কাছে পৌঁছেছে।' };
  });

  /* সেভ করা পোস্টের কার্ড (ব্রাউজার থেকে আইডি পাঠায়) */
  app.get('/api/posts', async (req) => {
    const ids = String(req.query.ids || '').split(',').map((x) => parseInt(x, 10)).filter((n) => n > 0).slice(0, 60);
    if (!ids.length) return { ok: true, html: '', found: [] };
    const rows = await listPosts({ where: 'p.id IN (?)', args: [ids], limit: 60 });
    const order = new Map(ids.map((id, i) => [id, i]));
    rows.sort((a, b) => order.get(a.id) - order.get(b.id));
    return { ok: true, found: rows.map((r) => r.id), html: rows.map((p, i) => String(postCard(p, i))).join('') };
  });
}
