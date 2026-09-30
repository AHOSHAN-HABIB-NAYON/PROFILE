/* ─────────────────────────────────────────────
   ফর্ম পার্সিং: সাধারণ (urlencoded) ও multipart (ফাইলসহ) — একই ইন্টারফেসে
   ───────────────────────────────────────────── */
export async function parseForm(req) {
  const fields = {}; const files = {};
  const put = (k, v) => { if (k in fields) { fields[k] = [].concat(fields[k], v); } else fields[k] = v; };
  if (req.isMultipart && req.isMultipart()) {
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        const buf = await part.toBuffer();
        if (!part.filename || !buf.length) continue;
        (files[part.fieldname] ||= []).push({ name: part.filename, type: part.mimetype, buffer: buf });
      } else {
        const key = part.fieldname.replace(/\[\]$/, '');
        if (part.fieldname.endsWith('[]')) { fields[key] = [].concat(fields[key] || [], part.value); } else put(key, part.value);
      }
    }
  } else {
    for (const [k, v] of Object.entries(req.body || {})) fields[k.replace(/\[\]$/, '')] = v;
  }
  return { fields, files };
}
export const arr = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
export const str = (v, max = 100000) => String(Array.isArray(v) ? v[0] ?? '' : v ?? '').trim().slice(0, max);
export const int = (v, d = 0) => { const n = parseInt(Array.isArray(v) ? v[0] : v, 10); return Number.isFinite(n) ? n : d; };
export const flag = (v) => v !== undefined && v !== null && v !== '' && v !== '0' && v !== 'off';
export const dateOrNull = (v) => { const s = str(v, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };
