/* ছোট ইন-মেমরি রেট লিমিটার (আইপি ভিত্তিক) — বট ও অপব্যবহার ঠেকাতে */
const buckets = new Map();
export function hit(key, limit, windowMs) {
  const now = Date.now();
  const e = buckets.get(key);
  if (!e || e.reset < now) { buckets.set(key, { n: 1, reset: now + windowMs }); return true; }
  e.n += 1;
  return e.n <= limit;
}
setInterval(() => { const now = Date.now(); for (const [k, e] of buckets) if (e.reset < now) buckets.delete(k); }, 60_000).unref?.();
