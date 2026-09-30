/* ─────────────────────────────────────────────
   ছোট LRU + TTL ক্যাশ — পাবলিক পেজ মেমরি থেকে যায়, তাই ডাটাবেসে চাপ পড়ে না।
   এডমিনে কিছু বদলালে bump() করলে সব ক্যাশ একসাথে মুছে যায়।
   ───────────────────────────────────────────── */
export class TTLCache {
  constructor(max = 300, ttl = 60_000) { this.max = max; this.ttl = ttl; this.m = new Map(); }
  get(k) {
    const e = this.m.get(k);
    if (!e) return undefined;
    if (e.exp < Date.now()) { this.m.delete(k); return undefined; }
    this.m.delete(k); this.m.set(k, e); // সাম্প্রতিক ব্যবহার সামনে
    return e.v;
  }
  set(k, v, ttl = this.ttl) {
    this.m.set(k, { v, exp: Date.now() + ttl });
    if (this.m.size > this.max) this.m.delete(this.m.keys().next().value);
    return v;
  }
  clear() { this.m.clear(); }
  get size() { return this.m.size; }
}

export const pageCache = new TTLCache(400, 90_000);
export const dataCache = new TTLCache(200, 30_000);
let version = String(Math.floor(Date.now() / 1000));
export const contentVersion = () => version;

/** এডমিনে কিছু বদলালে */
export function bumpVersion() {
  version = String(Math.floor(Date.now() / 1000));
  pageCache.clear(); dataCache.clear();
  return version;
}

/** ফাংশনের ফলাফল ক্যাশ করে ফেরত দেয় */
export async function memo(key, ttl, fn) {
  const hit = dataCache.get(key);
  if (hit !== undefined) return hit;
  const v = await fn();
  dataCache.set(key, v, ttl);
  return v;
}
