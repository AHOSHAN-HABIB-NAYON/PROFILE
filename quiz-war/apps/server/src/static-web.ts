import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { existsSync, readFileSync } from 'node:fs';
import { findUp } from './db/migrate';

const BOT_UA = /bot|crawler|spider|facebookexternalhit|twitterbot|whatsapp|telegram|slack|discord|linkedin/i;

/**
 * Single-server mode (e.g. Hostinger Node.js hosting, no nginx): the API process also serves
 * the game (apps/web/dist) at / and the admin panel (apps/admin/dist) at /v2admin/.
 * Enabled automatically when the builds exist; disable with SERVE_STATIC=false.
 */
export async function registerStaticWeb(app: FastifyInstance) {
  if (process.env.SERVE_STATIC === 'false') return { web: false as const };
  const webDir = findUp('apps/web/dist');
  const adminDir = findUp('apps/admin/dist');
  const hasWeb = existsSync(`${webDir}/index.html`);
  const hasAdmin = existsSync(`${adminDir}/index.html`);
  if (!hasWeb && !hasAdmin) return { web: false as const };

  const webIndex = hasWeb ? readFileSync(`${webDir}/index.html`, 'utf8') : null;
  const adminIndex = hasAdmin ? readFileSync(`${adminDir}/index.html`, 'utf8') : null;

  if (hasWeb) {
    await app.register(fastifyStatic, {
      root: webDir,
      prefix: '/',
      wildcard: false,
      decorateReply: false,
      index: false,
      setHeaders: (res, filePath) => {
        res.header('Cache-Control', filePath.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
  }
  if (hasAdmin) {
    await app.register(fastifyStatic, { root: adminDir, prefix: '/v2admin/', wildcard: false, decorateReply: false, index: false });
  }

  // SPA fallback (used by app.ts' not-found handler): unknown GET pages return the app shell.
  const spaFallback = (req: FastifyRequest, reply: FastifyReply) => {
    const url = req.url.split('?')[0];
    const isApi = url.startsWith('/api/') || url.startsWith('/socket.io') || url.startsWith('/media/') || url.startsWith('/health');
    if (req.method === 'GET' && !isApi) {
      if (url.startsWith('/v2admin') && adminIndex) return reply.type('text/html').header('X-Robots-Tag', 'noindex').send(adminIndex);
      if (webIndex && !/\.[a-z0-9]{2,5}$/i.test(url)) return reply.type('text/html').header('Cache-Control', 'no-cache').send(webIndex);
    }
    return null;
  };
  return { web: hasWeb, webIndex, spaFallback, isBot: (ua: string | undefined) => BOT_UA.test(ua ?? '') };
}
