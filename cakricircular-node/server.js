/* ─────────────────────────────────────────────
   চাকরি সার্কুলার — সার্ভার এন্ট্রি (Hostinger: Startup file = server.js)
   একটাই Node প্রসেস চলে; অটোমেশন, ইমেইল ও রিমাইন্ডার এর ভেতরেই চলে।
   ───────────────────────────────────────────── */
import { config } from './src/config.js';
import { buildApp } from './src/app.js';
import { migrate } from './src/migrate.js';
import { startTracker, stopTracker, pruneOld } from './src/modules/track/track.js';
import { closePool } from './src/db.js';
import v8 from 'node:v8';

/* শেয়ার্ড হোস্টিংয়ের মেমরি লিমিট মেনে চলতে হিপ সীমিত রাখি (.env-এ MAX_HEAP_MB বদলানো যায়) */
try { v8.setFlagsFromString(`--max-old-space-size=${Number(process.env.MAX_HEAP_MB) || 256}`); } catch { /* */ }

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));

await migrate();
const app = await buildApp({ logger: false });
startTracker();
pruneOld();
setInterval(pruneOld, 6 * 3600_000).unref();

if (config.scheduler) {
  const { startScheduler } = await import('./src/modules/scheduler/scheduler.js').catch(() => ({}));
  if (startScheduler) startScheduler();
}
if (!config.sessionSecretFromEnv) console.warn('⚠ SESSION_SECRET সেট করা নেই — রিস্টার্টে এডমিন লগআউট হয়ে যাবে। .env-এ দিন।');

const port = config.port;
await app.listen({ port, host: process.env.HOST || '0.0.0.0' });
console.log(`✔ চাকরি সার্কুলার চালু: http://localhost:${port}  (v${config.appVersion})`);

async function shutdown() { await stopTracker(); await app.close(); await closePool(); process.exit(0); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
