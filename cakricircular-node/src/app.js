/* ─────────────────────────────────────────────
   Fastify অ্যাপ তৈরি — টেস্ট ও সার্ভার দুটোই এখান থেকে নেয়
   ───────────────────────────────────────────── */
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import fastifyFormbody from '@fastify/formbody';
import fastifyCompress from '@fastify/compress';
import path from 'node:path';
import zlib from 'node:zlib';
import fs from 'node:fs';
import { config } from './config.js';
import { loadSettings } from './core/settings.js';
import { siteRoutes } from './modules/site/routes.js';
import { apiRoutes } from './modules/api/routes.js';
import { renderPage } from './ui/layout.js';
import { notFoundPage } from './modules/site/pages.js';
import { makeCtx } from './modules/site/routes.js';

const UPLOAD_EXT = /\.(jpe?g|png|webp|gif|avif|pdf)$/i;

export async function buildApp({ logger = false, serverFactory } = {}) {
  const app = Fastify({ logger, ...(serverFactory ? { serverFactory } : {}), trustProxy: config.trustProxy, bodyLimit: 2 * 1024 * 1024, routerOptions: { ignoreTrailingSlash: true, maxParamLength: 300 } });
  await loadSettings(true);
  setInterval(() => loadSettings(true).catch(() => {}), 30_000).unref();

  await app.register(fastifyCookie);
  await app.register(fastifyFormbody);
  await app.register(fastifyCompress, { global: true, threshold: 1024, encodings: ['br', 'gzip', 'deflate'],
    brotliOptions: { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } }, zlibOptions: { level: 6 } });

  /* নিরাপত্তা হেডার + www/http রিডাইরেক্ট */
  app.addHook('onRequest', async (req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff').header('X-Frame-Options', 'SAMEORIGIN')
      .header('Referrer-Policy', 'strict-origin-when-cross-origin').header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
      .removeHeader?.('X-Powered-By');
    if (config.noindex) reply.header('X-Robots-Tag', 'noindex, nofollow');
    if (config.baseUrl.startsWith('https')) reply.header('Strict-Transport-Security', 'max-age=31536000');
    const host = String(req.headers.host || '');
    if (/^www\./i.test(host) && req.method === 'GET') return reply.redirect(`${req.headers['x-forwarded-proto'] || 'https'}://${host.replace(/^www\./i, '')}${req.url}`, 301);
    if (config.baseUrl.startsWith('https') && String(req.headers['x-forwarded-proto'] || '').split(',')[0] === 'http' && req.method === 'GET') return reply.redirect(`https://${host}${req.url}`, 301);
  });

  /* স্ট্যাটিক ফাইল (css/js/fonts/img) — ভার্সনসহ হলে ১ বছর ক্যাশ */
  await app.register(fastifyStatic, {
    root: config.publicDir, prefix: '/', wildcard: false, index: false, cacheControl: false, etag: true, lastModified: true,
    setHeaders(res, p) {
      const set = (k, v) => (typeof res.setHeader === 'function' ? res.setHeader(k, v) : res.header(k, v));
      if (/\.(woff2|png|svg|jpg|webp|ico|css|js)$/i.test(p)) set('Cache-Control', 'public, max-age=31536000, immutable');
      else set('Cache-Control', 'public, max-age=3600');
    },
  });
  /* আপলোড ফোল্ডার — শুধু ছবি ও পিডিএফ, স্ক্রিপ্ট চালানো বন্ধ */
  let uploadsOk = true;
  try { fs.mkdirSync(config.uploadDir, { recursive: true }); fs.accessSync(config.uploadDir, fs.constants.R_OK); }
  catch (e) { uploadsOk = false; console.error(`⚠ UPLOAD_DIR (${config.uploadDir}) খোলা যায়নি: ${e.code || e.message} — ছবি/পিডিএফ দেখা যাবে না। .env-এ UPLOAD_DIR ঠিক করুন।`); }
  if (uploadsOk) await app.register(async (inst) => {
    inst.addHook('onRequest', async (req, reply) => {
      if (!UPLOAD_EXT.test(req.url.split('?')[0])) return reply.code(404).send('Not found');
      reply.header('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox")
        .header('Cache-Control', 'public, max-age=2592000');
    });
    await inst.register(fastifyStatic, { root: config.uploadDir, prefix: '/uploads/', decorateReply: false, index: false, cacheControl: false, dotfiles: 'deny' });
  });

  await app.register(apiRoutes);
  await app.register(siteRoutes);

  const { adminRoutes } = await import('./modules/admin/index.js').catch(() => ({ adminRoutes: null }));
  if (adminRoutes) await app.register(adminRoutes);
  const { notifyRoutes } = await import('./modules/notify/routes.js').catch(() => ({ notifyRoutes: null }));
  if (notifyRoutes) await app.register(notifyRoutes);

  const { schedulerRoutes } = await import('./modules/scheduler/routes.js').catch(() => ({ schedulerRoutes: null }));
  if (schedulerRoutes) await app.register(schedulerRoutes);

  app.setNotFoundHandler(async (req, reply) => {
    const ctx = makeCtx(req);
    if (req.url.startsWith('/api/')) return reply.code(404).send({ ok: false, msg: 'not found' });
    if (req.headers['x-spa'] === '1') { const r = notFoundPage(); return reply.code(404).send({ ...r, body: String(r.body), schema: [] }); }
    return reply.code(404).type('text/html; charset=utf-8').send(await renderPage(ctx, notFoundPage()));
  });
  app.setErrorHandler(async (err, req, reply) => {
    console.error('[error]', req.method, req.url, err.message);
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ ok: false, msg: err.message });
    if (req.url.startsWith('/api/') || req.headers['x-spa'] === '1') return reply.code(500).send({ ok: false, msg: 'সার্ভারে সমস্যা হয়েছে। একটু পরে আবার চেষ্টা করুন।' });
    return reply.code(500).type('text/html; charset=utf-8').send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div style="font:16px system-ui;padding:60px 20px;text-align:center">সাময়িক সমস্যা হচ্ছে। একটু পরে আবার চেষ্টা করুন।</div>');
  });
  return app;
}
