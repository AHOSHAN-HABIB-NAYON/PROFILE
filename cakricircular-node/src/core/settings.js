/* ─────────────────────────────────────────────
   settings টেবিল (k → v) মেমরিতে — পড়া ০ মিলিসেকেন্ড
   এডমিনে সেভ করলে সাথে সাথে বদলায়; পুরোনো PHP সাইট একই ডাটাবেসে চললেও
   ৩০ সেকেন্ডে নিজে থেকে সিঙ্ক হয়।
   ───────────────────────────────────────────── */
import { all, run } from '../db.js';

let cache = new Map();
let loadedAt = 0;
const TTL = 30_000;
let loading = null;

export async function loadSettings(force = false) {
  if (!force && Date.now() - loadedAt < TTL && cache.size) return cache;
  if (loading) return loading;
  loading = (async () => {
    try {
      const rows = await all('SELECT k, v FROM settings');
      const m = new Map();
      for (const r of rows) m.set(r.k, r.v ?? '');
      cache = m; loadedAt = Date.now();
    } catch { /* ডাটাবেস সাময়িক সমস্যায় পুরোনো মান চলবে */ }
    finally { loading = null; }
    return cache;
  })();
  return loading;
}

/** সিঙ্ক পড়া (loadSettings একবার চলার পর) */
export function setting(k, def = '') {
  const v = cache.get(k);
  return v !== undefined && v !== '' ? v : def;
}
export const settingInt = (k, def = 0) => { const n = parseInt(setting(k, ''), 10); return Number.isFinite(n) ? n : def; };
export const settingOn = (k, def = false) => { const v = setting(k, def ? '1' : '0'); return v === '1' || v === 'true'; };

export async function setSetting(k, v) {
  await run('INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', [k, String(v ?? '')]);
  cache.set(k, String(v ?? ''));
}
export async function setSettings(obj) { for (const [k, v] of Object.entries(obj)) await setSetting(k, v); }
export const allSettings = () => Object.fromEntries(cache);
