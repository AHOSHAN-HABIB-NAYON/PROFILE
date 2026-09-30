/* ─────────────────────────────────────────────
   ভিজিটর ও পোস্ট-ভিউ ট্র্যাকিং (write-behind)
   রিকোয়েস্টের সময় শুধু মেমরিতে জমা হয়; প্রতি ৫ সেকেন্ডে একসাথে ডাটাবেসে যায়।
   তাই ভিড় বাড়লেও ডাটাবেস বা প্রসেসে চাপ পড়ে না।
   ───────────────────────────────────────────── */
import crypto from 'node:crypto';
import { getPool, run, one } from '../../db.js';
import { setting } from '../../core/settings.js';
import { todayStr, nowStr } from '../../core/bn.js';

const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|monitor|uptime|curl|wget|python|axios|lighthouse|pagespeed|gtmetrix|chrome-lighthouse/i;
export const isBot = (ua) => !ua || BOT.test(ua);
export const deviceOf = (ua = '') => (/ipad|tablet/i.test(ua) ? 'tablet' : /mobile|android|iphone|ipod/i.test(ua) ? 'mobile' : 'desktop');

export function clientIp(req) {
  const h = req.headers;
  const ip = String(h['cf-connecting-ip'] || h['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
  return ip || '0.0.0.0';
}

/** কুকি থেকে ভিজিটর আইডি; না থাকলে নতুন বানিয়ে কুকি দেয় */
export function visitorId(req, reply) {
  const c = req.cookies?.cc_vid;
  if (c && /^[a-f0-9]{32}$/.test(c)) return c;
  const vid = crypto.randomBytes(16).toString('hex');
  reply.setCookie('cc_vid', vid, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 31536000, secure: req.protocol === 'https' });
  return vid;
}

const visitQ = []; const viewQ = [];
const recent = new Map(); // "vid|path" → time (১ মিনিটে একই পেজ দুবার নয়)
const geoMem = new Map();
const MAX_Q = 2000;

export function trackVisit(req, reply, pathStr) {
  const ua = req.headers['user-agent'];
  if (isBot(ua) || req.headers['x-prefetch'] === '1') return;
  const vid = visitorId(req, reply);
  const p = String(pathStr || '/').slice(0, 190);
  const key = `${vid}|${p}`; const now = Date.now();
  if ((recent.get(key) || 0) > now - 60_000) return;
  recent.set(key, now);
  if (recent.size > 5000) for (const [k, t] of recent) if (t < now - 60_000) recent.delete(k);
  if (visitQ.length < MAX_Q) visitQ.push({ vid, path: p, ip: clientIp(req), device: deviceOf(ua), at: now });
}

export function countPostView(req, reply, postId, isAdmin = false) {
  const ua = req.headers['user-agent'];
  if (isBot(ua) || req.headers['x-prefetch'] === '1' || isAdmin) return;
  const vid = visitorId(req, reply);
  if (viewQ.length < MAX_Q) viewQ.push({ vid, postId, day: todayStr() });
}

async function geoLookup(ip) {
  if (setting('geo_lookup', '1') !== '1' || /^(0\.0\.0\.0|127\.|10\.|192\.168\.|::1)/.test(ip)) return ['', ''];
  if (geoMem.has(ip)) return geoMem.get(ip);
  const c = await one('SELECT country, region FROM geo_cache WHERE ip = ? LIMIT 1', [ip]).catch(() => null);
  if (c) { const r = [c.country || '', c.region || '']; geoMem.set(ip, r); return r; }
  let country = ''; let region = '';
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 2500);
    const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName`, { signal: ctl.signal });
    clearTimeout(t);
    const j = await res.json();
    if (j.status === 'success') { country = j.country || ''; region = j.regionName || ''; }
  } catch { /* আউটগোয়িং ব্লক থাকলে অজানা */ }
  await run('INSERT IGNORE INTO geo_cache (ip, country, region, created_at) VALUES (?,?,?,NOW())', [ip, country, region]).catch(() => {});
  geoMem.set(ip, [country, region]);
  if (geoMem.size > 3000) geoMem.delete(geoMem.keys().next().value);
  return [country, region];
}

let flushing = false;
export async function flush() {
  if (flushing || (!visitQ.length && !viewQ.length)) return;
  flushing = true;
  const vs = visitQ.splice(0, visitQ.length); const ws = viewQ.splice(0, viewQ.length);
  try {
    const pool = getPool();
    if (vs.length) {
      const vids = [...new Set(vs.map((v) => v.vid))];
      const [known] = await pool.query('SELECT vid FROM visitors WHERE vid IN (?)', [vids]);
      const have = new Set(known.map((r) => r.vid));
      const perVid = new Map(vs.map((v) => [v.vid, v]));
      for (const [vid, v] of perVid) {
        const n = vs.filter((x) => x.vid === vid).length;
        if (have.has(vid)) await pool.query('UPDATE visitors SET last_seen = NOW(), hits = hits + ? WHERE vid = ?', [n, vid]);
        else {
          const [country, region] = await geoLookup(v.ip);
          await pool.query('INSERT IGNORE INTO visitors (vid, country, region, device, first_seen, last_seen, hits) VALUES (?,?,?,?,NOW(),NOW(),?)', [vid, country, region, v.device, n]);
        }
      }
      await pool.query('INSERT INTO visits (vid, path, day, created_at) VALUES ?', [vs.map((v) => [v.vid, v.path, todayStr(v.at), nowStr(v.at)])]);
    }
    if (ws.length) {
      for (const w of ws) {
        const [r] = await pool.query('INSERT IGNORE INTO post_views (post_id, vid, day) VALUES (?,?,?)', [w.postId, w.vid, w.day]);
        if (r.affectedRows > 0) await pool.query('UPDATE posts SET views = views + 1 WHERE id = ?', [w.postId]);
      }
    }
  } catch (e) { console.error('[track] flush:', e.message); }
  finally { flushing = false; }
}

let timer;
export function startTracker() { if (!timer) { timer = setInterval(flush, 5000); timer.unref?.(); } }
export async function stopTracker() { clearInterval(timer); timer = null; await flush(); }

/* পুরোনো লগ পরিষ্কার — দিনে একবার */
export async function pruneOld() {
  await run('DELETE FROM visits WHERE day < DATE_SUB(CURDATE(), INTERVAL 400 DAY) LIMIT 5000').catch(() => {});
  await run('DELETE FROM post_views WHERE day < DATE_SUB(CURDATE(), INTERVAL 400 DAY) LIMIT 5000').catch(() => {});
  await run('DELETE FROM visitors WHERE last_seen < DATE_SUB(NOW(), INTERVAL 400 DAY) LIMIT 5000').catch(() => {});
  await run('DELETE FROM login_attempts WHERE created_at < DATE_SUB(NOW(), INTERVAL 2 DAY)').catch(() => {});
}
