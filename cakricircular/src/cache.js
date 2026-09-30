'use strict';
/**
 * Tiny in-memory caches.
 *  - page cache: fully rendered public HTML (anonymous GET), cleared on every admin save
 *  - data cache: memoised DB lookups with TTL (categories, banners, ads …)
 * Everything lives in the single Node process, so a save is visible instantly.
 */
const MAX_PAGES = 600;
const pages = new Map();
const data = new Map();
let version = 1;
const listeners = [];

function getPage(key) {
  const hit = pages.get(key);
  if (!hit) return null;
  if (hit.exp < Date.now()) { pages.delete(key); return null; }
  // LRU: refresh position
  pages.delete(key); pages.set(key, hit);
  return hit;
}
function setPage(key, body, { ttl = 120000, status = 200, headers = {} } = {}) {
  if (pages.size >= MAX_PAGES) pages.delete(pages.keys().next().value);
  const etag = `W/"${version.toString(36)}-${hash(body)}"`;
  const entry = { body, status, headers, etag, exp: Date.now() + ttl };
  pages.set(key, entry);
  return entry;
}

async function remember(key, ttlMs, fn) {
  const hit = data.get(key);
  if (hit && hit.exp > Date.now()) return hit.value;
  const value = await fn();
  data.set(key, { value, exp: Date.now() + ttlMs });
  return value;
}

function clear() {
  pages.clear();
  data.clear();
  version++;
  for (const fn of listeners) { try { fn(); } catch (_) { /* ignore */ } }
}
function onClear(fn) { listeners.push(fn); }

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 7) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + str.length.toString(36);
}

module.exports = { getPage, setPage, remember, clear, onClear, version: () => version, stats: () => ({ pages: pages.size, data: data.size }) };
