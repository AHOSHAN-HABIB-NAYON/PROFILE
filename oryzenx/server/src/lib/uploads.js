const fs = require('fs/promises');
const path = require('path');
const { bad, randomToken } = require('./util');

const ROOT = path.join(__dirname, '..', '..', 'uploads');
const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' };

// Accepts a data URL ("data:image/png;base64,...") and writes it under uploads/<folder>/.
// The app compresses images before upload, so limits stay small.
async function saveDataUrl(dataUrl, folder, { allow, maxBytes, name }) {
  const m = /^data:([a-z+/]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m || !allow.includes(m[1])) throw bad(`Image must be one of: ${allow.map((t) => TYPES[t]).join(', ')}`);
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > maxBytes) throw bad(`Image is too large (max ${Math.round(maxBytes / 1024)} KB)`);
  if (m[1] === 'image/svg+xml' && /<script|on\w+\s*=|javascript:/i.test(buf.toString('utf8'))) throw bad('SVG contains scripts');
  const dir = path.join(ROOT, folder);
  await fs.mkdir(dir, { recursive: true });
  const file = `${name || randomToken(9)}-${Date.now().toString(36)}.${TYPES[m[1]]}`;
  await fs.writeFile(path.join(dir, file), buf);
  return `/uploads/${folder}/${file}`;
}

async function removeUpload(url) {
  if (!url || !url.startsWith('/uploads/')) return;
  const p = path.normalize(path.join(ROOT, url.slice('/uploads/'.length)));
  if (p.startsWith(ROOT)) await fs.unlink(p).catch(() => {});
}

module.exports = { ROOT, saveDataUrl, removeUpload };
