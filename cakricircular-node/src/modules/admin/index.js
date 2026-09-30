/* ─────────────────────────────────────────────
   এডমিন রাউটার: লগইন, পারমিশন, CSRF, ফ্ল্যাশ বার্তা, সব মডিউলের ডিসপ্যাচ
   পথ: /{admin_slug}/...   (সেটিংস থেকে বদলানো যায়)
   ───────────────────────────────────────────── */
import bcrypt from 'bcryptjs';
import multipart from '@fastify/multipart';
import { one, run, col } from '../../db.js';
import { setting } from '../../core/settings.js';
import { config } from '../../config.js';
import { makeSession, readSession, cookieName, setAdminCookie, clearAdminCookie, csrfFor } from '../../core/auth.js';
import { clientIp } from '../track/track.js';
import { bumpVersion } from '../../core/cache.js';
import { parseForm } from '../../core/forms.js';
import { shell, loginPage } from './layout.js';
import { html } from '../../core/html.js';

const modules = {};
async function load() {
  const names = ['dashboard', 'posts', 'post', 'categories', 'banners', 'ads', 'notices', 'team', 'reports', 'analytics', 'automation', 'notify', 'users', 'settings', 'profile', 'preview'];
  for (const n of names) { try { modules[n] = (await import(`./pages/${n}.js`)).default; } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') console.error(`[admin] ${n}:`, e.message); } }
}

export async function adminRoutes(app) {
  await load();
  await app.register(multipart, { limits: { fileSize: 16 * 1024 * 1024, files: 12, fields: 200, parts: 260 } });

  const handler = async (req, reply) => {
    const slug = setting('admin_slug', config.defaultAdminSlug);
    const { a, b } = req.params;
    if (a !== slug) return reply.callNotFound();
    reply.header('X-Robots-Tag', 'noindex, nofollow').header('Cache-Control', 'no-store');
    const token = req.cookies?.[cookieName];
    const sess = readSession(token);
    const me = sess ? await one('SELECT * FROM admins WHERE id = ? AND is_active = 1', [sess.id]) : null;
    const au = (p = '') => `/${slug}${p ? `/${p}` : ''}`;

    /* ─── লগআউট ─── */
    if (b === 'logout') { clearAdminCookie(reply); return reply.redirect(au(), 303); }

    /* ─── লগইন ─── */
    if (!me) {
      const csrf = csrfFor('login');
      let err = '';
      if (req.method === 'POST') {
        const ip = clientIp(req);
        const f = (await parseForm(req)).fields;
        const fails = Number(await col("SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND created_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)", [ip], 0));
        if (fails >= 6) err = 'অনেকবার ভুল হয়েছে। ১৫ মিনিট পরে আবার চেষ্টা করুন।';
        else if (f._t !== csrf) err = 'সেশন মেয়াদ শেষ। পেজ রিফ্রেশ করে আবার চেষ্টা করুন।';
        else {
          const u = await one('SELECT * FROM admins WHERE username = ? AND is_active = 1', [String(f.username || '').trim()]);
          /* পুরোনো PHP-র $2y$ হ্যাশ bcryptjs সরাসরি চেনে */
          const okPw = u && (await bcrypt.compare(String(f.password || ''), String(u.pass).replace(/^\$2y\$/, '$2a$')));
          if (okPw) {
            await run('UPDATE admins SET last_login = NOW() WHERE id = ?', [u.id]);
            await run('DELETE FROM login_attempts WHERE ip = ?', [ip]);
            setAdminCookie(req, reply, makeSession(u.id));
            return reply.redirect(au(), 303);
          }
          await run('INSERT INTO login_attempts (ip, username, created_at) VALUES (?,?,NOW())', [ip, String(f.username || '').slice(0, 60)]);
          err = 'ইউজারনেম বা পাসওয়ার্ড ভুল।';
        }
      }
      return reply.type('text/html; charset=utf-8').send(loginPage({ slug, err, token: csrf }));
    }

    /* ─── পারমিশন ─── */
    const perms = (() => { try { return JSON.parse(me.perms || '[]') || []; } catch { return []; } })();
    const can = (p) => !p || me.role === 'super' || perms.includes('all') || perms.includes(p);
    const key = b || 'dashboard';
    const mod = modules[key];
    if (!mod) return reply.callNotFound();
    if (mod.perm && !can(mod.perm)) {
      return reply.type('text/html; charset=utf-8').send(shell({ me, slug, nav: key, title: 'প্রবেশাধিকার নেই', can, body: html`<div class="a-card" style="text-align:center;padding:40px"><h2>এই অংশে আপনার প্রবেশাধিকার নেই।</h2></div>` }));
    }

    const csrf = csrfFor(token);
    const isPost = req.method === 'POST';
    let form = { fields: {}, files: {} };
    if (isPost) {
      form = await parseForm(req);
      if (form.fields._t !== csrf) return reply.code(419).type('text/plain; charset=utf-8').send('সেশন মেয়াদ শেষ। পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।');
    }
    const flashRaw = req.cookies?.ccflash;
    let flash = null;
    if (flashRaw) { try { flash = JSON.parse(decodeURIComponent(flashRaw)); } catch { /* */ } reply.clearCookie('ccflash', { path: '/' }); }
    const go = (path, t, m) => { if (m) reply.setCookie('ccflash', encodeURIComponent(JSON.stringify({ t, m })), { path: '/', maxAge: 60, httpOnly: true, sameSite: 'lax' }); if (isPost) bumpVersion(); return reply.redirect(path.startsWith('/') ? path : au(path), 303); };
    const ctx = { req, reply, me, can, slug, au, csrf, form, fields: form.fields, files: form.files, query: req.query || {}, sub: null, flash, go, isPost,
      page: (title, body, opts = {}) => { if (isPost) bumpVersion(); return reply.type('text/html; charset=utf-8').send(shell({ me, slug, nav: opts.nav || key, title, body, flash: opts.flash ?? flash, can, counts: ctx.counts })); },
      json: (o) => reply.type('application/json; charset=utf-8').send(o) };
    ctx.counts = {
      review: Number(await col('SELECT COUNT(*) FROM posts WHERE review_pending = 1 AND deleted_at IS NULL', [], 0)),
      reports: Number(await col('SELECT COUNT(*) FROM reports WHERE status = 0', [], 0)),
    };
    const out = await (isPost ? (mod.post || mod.get) : mod.get)(ctx);
    return out;
  };
  app.route({ method: ['GET', 'POST'], url: '/:a', handler });
  app.route({ method: ['GET', 'POST'], url: '/:a/:b', handler });
}
