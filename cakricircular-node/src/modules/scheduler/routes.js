/* hPanel-এর ঐচ্ছিক cron (৫–১০ মিনিটে একটা হালকা কল) — অ্যাপকে জাগিয়ে রাখে ও কাজ ধরিয়ে দেয় */
import crypto from 'node:crypto';
import { setting, setSetting } from '../../core/settings.js';
import { tick } from './scheduler.js';

export async function schedulerRoutes(app) {
  if (!setting('auto_cron_key')) await setSetting('auto_cron_key', crypto.randomBytes(16).toString('hex'));
  app.get('/cron/tick', async (req, reply) => {
    reply.header('Cache-Control', 'no-store').header('X-Robots-Tag', 'noindex');
    const key = String(req.query.key || ''); const real = setting('auto_cron_key');
    if (!real || key.length !== real.length || !crypto.timingSafeEqual(Buffer.from(key), Buffer.from(real))) return reply.code(403).type('text/plain').send('Forbidden');
    tick().catch(() => {});            // কাজ পেছনে চলবে, কলার সাথে সাথে ছাড়া পায়
    return reply.type('text/plain').send('ok');
  });
}
