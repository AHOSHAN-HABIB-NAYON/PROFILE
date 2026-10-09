import { SmtpMailer } from '../modules/auth/mailer';
import { normalizeUid, type PublicConfig } from '@quizwar/shared';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Public, unauthenticated endpoints: config, health, Android App Links, SEO share pages. */
export async function publicRoutes(app: FastifyInstance, ctx: AppContext, staticWeb: { web: boolean; webIndex?: string | null; isBot?: (ua?: string) => boolean } = { web: false }) {
  app.get('/api/v1/config', async (_req, reply): Promise<PublicConfig> => {
    reply.header('cache-control', 'public, max-age=30');
    const a = ctx.settings.app();
    const g = ctx.settings.game();
    return {
      ...a,
      game: { match: g.match, powerUps: g.powerUps, levels: g.levels, penalties: g.penalties, leagues: g.ranked.leagues, aiEnabled: g.ai.enabled },
      googleClientId: ctx.env.GOOGLE_CLIENT_ID ?? null,
      vapidPublicKey: ctx.env.VAPID_PUBLIC_KEY ?? null,
      emailEnabled: ctx.mailer instanceof SmtpMailer,
    };
  });

  app.get('/health', async () => ({ ok: true, uptime: Math.round(process.uptime()) }));
  app.get('/health/ready', async (_req, reply) => {
    try {
      const { db } = await import('../db/pool');
      await db().query('SELECT 1');
      return { ok: true };
    } catch {
      return reply.status(503).send({ ok: false });
    }
  });

  /** Android App Links verification — lets https://<domain>/u/QW-… open the installed app. */
  app.get('/.well-known/assetlinks.json', async (_req, reply) => {
    reply.header('content-type', 'application/json');
    const fingerprints = (ctx.env.ANDROID_SHA256_CERT_FINGERPRINTS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    return [
      {
        relation: ['delegate_permission/common.handle_all_urls', 'delegate_permission/common.get_login_creds'],
        target: { namespace: 'android_app', package_name: ctx.env.ANDROID_PACKAGE_NAME, sha256_cert_fingerprints: fingerprints },
      },
    ];
  });

  /**
   * Server-rendered share page for public profiles (/u/QW-XXXXXX). Crawlers and link previews
   * get real text + Open Graph tags; browsers are sent on to the SPA profile page.
   */
  app.get('/u/:uid', async (req, reply) => {
    reply.header('content-type', 'text/html; charset=utf-8');
    // Same-origin hosting: real browsers get the SPA; only crawlers get the share page.
    if (staticWeb.web && staticWeb.webIndex && !staticWeb.isBot?.(req.headers['user-agent'])) return staticWeb.webIndex;
    const uid = normalizeUid(String((req.params as any).uid));
    const web = ctx.env.PUBLIC_WEB_URL.replace(/\/$/, '');
    if (!uid) return reply.status(404).send('<!doctype html><title>Not found</title><p>Player not found</p>');
    let p: Awaited<ReturnType<typeof ctx.profile.publicProfile>> | null = null;
    try {
      p = await ctx.profile.publicProfile(uid);
    } catch {
      p = null;
    }
    if (!p) return reply.status(404).send(`<!doctype html><title>Player not found · QUIZ WAR</title><p>Player not found. <a href="${web}">Play QUIZ WAR</a></p>`);
    const league = ctx.settings.game().ranked.leagues.find((l) => l.key === p!.user.league);
    const title = `${p.user.username} (${p.user.uid}) · QUIZ WAR: Bangladesh`;
    const desc = `${league?.icon ?? ''} ${league?.name ?? ''} · Level ${p.user.level} · Rating ${p.user.rating} · ${p.stats.wins} wins · ${p.stats.winRate}% win rate. Challenge ${p.user.username} on QUIZ WAR!`;
    const target = `${web}/u/${p.user.uid}`;
    reply.header('cache-control', 'public, max-age=300');
    return `<!doctype html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${esc(target)}">
<meta property="og:type" content="profile"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(target)}">${p.user.avatarUrl ? `<meta property="og:image" content="${esc(p.user.avatarUrl)}">` : ''}
<meta name="twitter:card" content="summary">
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'ProfilePage', mainEntity: { '@type': 'Person', name: p.user.username, identifier: p.user.uid } }).replace(/</g, '\\u003c')}</script>
<meta http-equiv="refresh" content="0;url=${esc(target)}?from=share">
<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:40px auto;padding:0 16px;color:#0f172a}a{color:#1d4ed8}</style></head>
<body><h1>${esc(p.user.username)}</h1><p>UID: <strong>${esc(p.user.uid)}</strong></p><p>${esc(desc)}</p>
<p><a href="${esc(target)}">Open profile in QUIZ WAR</a></p></body></html>`;
  });
}
