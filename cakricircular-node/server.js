/* ─────────────────────────────────────────────
   চাকরি সার্কুলার — সার্ভার এন্ট্রি (Hostinger: Startup file = server.js)
   একটাই Node প্রসেস। অটোমেশন, ইমেইল ও রিমাইন্ডার এর ভেতরেই চলে।

   ▸ পোর্ট সাথে সাথে খোলে — ডাটাবেস/কনফিগে সমস্যা থাকলে ক্র্যাশ করে 503 না দিয়ে
     পরিষ্কার একটি "কী সমস্যা" পাতা দেখায় এবং নিজে থেকে আবার চেষ্টা করে।
   ───────────────────────────────────────────── */
import http from 'node:http';
import v8 from 'node:v8';
import { config } from './src/config.js';

/* শেয়ার্ড হোস্টিংয়ের মেমরি লিমিট মেনে চলতে হিপ সীমিত রাখি (.env-এ MAX_HEAP_MB বদলানো যায়) */
try { v8.setFlagsFromString(`--max-old-space-size=${Number(process.env.MAX_HEAP_MB) || 256}`); } catch { /* */ }

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));

const state = { phase: 'starting', error: null, tries: 0, since: Date.now() };
let appHandler = null;
let pendingHandler = null;

/* ─── সমস্যার পাতা ─── */
function classify(e) {
  const code = e?.code || e?.errno || e?.name || 'UNKNOWN';
  const hints = {
    ER_ACCESS_DENIED_ERROR: 'ডাটাবেসের ইউজারনেম বা পাসওয়ার্ড (DB_USER / DB_PASS) ভুল।',
    ER_BAD_DB_ERROR: 'ডাটাবেসের নাম (DB_NAME) ভুল, অথবা ডাটাবেসটি নেই।',
    ECONNREFUSED: 'ডাটাবেস সার্ভারে সংযোগ হচ্ছে না। DB_HOST ঠিক আছে কিনা দেখুন (hPanel → Databases-এ দেওয়া হোস্ট; না হলে localhost / 127.0.0.1 দুটোই চেষ্টা করুন)।',
    ENOTFOUND: 'DB_HOST-এর নামটি চেনা যাচ্ছে না — hPanel → Databases → Management-এ দেখানো হোস্ট বসান।',
    ETIMEDOUT: 'ডাটাবেসে সংযোগের সময় শেষ। Hostinger-এ Remote MySQL-এ এই অ্যাপের আইপি অনুমতি দিতে হতে পারে, অথবা ভুল DB_HOST।',
    EAI_AGAIN: 'DB_HOST-এর নাম খোঁজা যাচ্ছে না — হোস্টের নামটি আবার দেখুন।',
    ER_DBACCESS_DENIED_ERROR: 'এই ইউজারের এই ডাটাবেসে অনুমতি নেই — hPanel-এ ইউজারকে ডাটাবেসের সাথে যুক্ত করুন।',
  };
  return { code: String(code), hint: hints[code] || 'অপ্রত্যাশিত সমস্যা — নিচের কোডটি আমাকে পাঠান।', message: String(e?.message || e).slice(0, 400) };
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function diagnostic(req, res) {
  const url = (req.url || '/').split('?')[0];
  if (url === '/healthz') { res.writeHead(state.phase === 'ready' ? 200 : 503, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: state.phase === 'ready', phase: state.phase, error: state.error?.code || null })); }
  /* টেস্ট সাবডোমেইনে (NOINDEX=true) বা ডেভেলপমেন্টে পুরো বার্তা দেখাই; আসল সাইটে শুধু কোড */
  const detail = config.noindex || !config.isProd;
  const e = state.error;
  const body = `<!doctype html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="20"><title>সাইট প্রস্তুত হচ্ছে</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#0b1211;color:#e6f0ee;padding:20px}.c{max-width:520px;width:100%}h1{font-size:1.3rem;margin:0 0 6px}p{color:#a3b5b1;line-height:1.7}.b{background:#121c1a;border:1px solid #243431;border-radius:16px;padding:14px 16px;margin-top:14px}code{display:block;background:#0b1211;border-radius:10px;padding:10px 12px;margin-top:8px;word-break:break-word;color:#5eead4;font-size:.85rem}.ok{color:#fbbf24}</style></head><body><div class="c">
${e ? `<h1>⚠️ সাইট চালু করা যাচ্ছে না</h1><p class="ok">${esc(e.hint)}</p><div class="b"><b>ত্রুটির কোড:</b><code>${esc(e.code)}</code>${detail ? `<code>${esc(e.message)}</code>` : ''}<p style="margin:10px 0 0;font-size:.85rem">এই পাতা প্রতি ২০ সেকেন্ডে নিজে রিফ্রেশ হয়; ঠিক হলেই সাইট খুলে যাবে। Environment variables বদলালে অ্যাপ Restart করুন।</p></div>` : `<h1>সাইট প্রস্তুত হচ্ছে…</h1><p>কয়েক সেকেন্ড অপেক্ষা করুন — পাতাটি নিজে রিফ্রেশ হবে।</p>`}
</div></body></html>`;
  res.writeHead(503, { 'content-type': 'text/html; charset=utf-8', 'retry-after': '20', 'cache-control': 'no-store' });
  res.end(body);
}

/* ─── পোর্ট সাথে সাথে খুলি ─── */
const server = http.createServer((req, res) => (appHandler ? appHandler(req, res) : diagnostic(req, res)));
server.keepAliveTimeout = 65_000;
server.listen(config.port, process.env.HOST || '0.0.0.0', () => console.log(`✔ পোর্ট ${config.port} খোলা (v${config.appVersion}) — প্রস্তুতি চলছে…`));

/* ─── আসল প্রস্তুতি: ডাটাবেস + অ্যাপ। ব্যর্থ হলে ২০ সেকেন্ড পরে আবার ─── */
async function init() {
  state.tries += 1;
  try {
    const { migrate } = await import('./src/migrate.js');
    await migrate();
    const { buildApp } = await import('./src/app.js');
    const tracker = await import('./src/modules/track/track.js');
    const app = await buildApp({ logger: false, serverFactory: (handler) => { pendingHandler = handler; return server; } });
    await app.ready();
    appHandler = pendingHandler; /* সব প্লাগইন তৈরি হওয়ার পরেই রিকোয়েস্ট নিই */
    tracker.startTracker(); tracker.pruneOld(); setInterval(tracker.pruneOld, 6 * 3600_000).unref();
    if (config.scheduler) { const { startScheduler } = await import('./src/modules/scheduler/scheduler.js'); startScheduler(); }
    if (!config.sessionSecretFromEnv) console.warn('⚠ SESSION_SECRET সেট করা নেই — রিস্টার্টে এডমিন লগআউট হয়ে যাবে।');
    state.phase = 'ready'; state.error = null;
    console.log(`✔ চাকরি সার্কুলার চালু — ডাটাবেস ঠিক আছে (চেষ্টা ${state.tries})`);
    const { closePool } = await import('./src/db.js');
    const shutdown = async () => { try { await tracker.stopTracker(); await app.close(); await closePool(); } catch { /* */ } process.exit(0); };
    process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
  } catch (e) {
    appHandler = null; state.phase = 'error'; state.error = classify(e);
    console.error(`✘ প্রস্তুতি ব্যর্থ (চেষ্টা ${state.tries}): [${state.error.code}] ${state.error.message}`);
    setTimeout(init, 20_000);
  }
}
init();
