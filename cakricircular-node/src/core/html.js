/* ─────────────────────────────────────────────
   নিরাপদ HTML টেমপ্লেট — `html` ট্যাগ দিয়ে লিখলে সব মান নিজে থেকেই এস্কেপ হয়।
   কোনো বাহ্যিক টেমপ্লেট ইঞ্জিন লাগে না, তাই দ্রুত ও হালকা।
   ───────────────────────────────────────────── */
export class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }

const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => MAP[c]);
export const raw = (s) => new Raw(String(s ?? ''));

function render(v) {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) { let o = ''; for (const x of v) o += render(x); return o; }
  if (v === null || v === undefined || v === false || v === true) return '';
  return esc(v);
}

export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += render(vals[i]) + strings[i + 1];
  return new Raw(out);
}
export const str = (v) => render(v);
export const attr = (o) =>
  raw(Object.entries(o).filter(([, v]) => v !== false && v !== null && v !== undefined)
    .map(([k, v]) => (v === true ? k : `${k}="${esc(v)}"`)).join(' '));
