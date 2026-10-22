// Images are stored in the database (not on disk) so they survive redeploys on managed hosting.
const fs = require('fs/promises');
const path = require('path');
const { query } = require('../db');
const { bad } = require('./util');

const ROOT = path.join(__dirname, '..', '..', 'uploads'); // old disk uploads, still served if present
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' };

function parseDataUrl(dataUrl, { allow, maxBytes }) {
  const m = /^data:([a-z+/]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m || !allow.includes(m[1])) throw bad(`Image must be one of: ${allow.map((t) => EXT[t]).join(', ')}`);
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > maxBytes) throw bad(`Image is too large (max ${Math.round(maxBytes / 1024)} KB)`);
  if (m[1] === 'image/svg+xml' && /<script|on\w+\s*=|javascript:|<foreignObject/i.test(buf.toString('utf8'))) throw bad('SVG contains scripts');
  return { mime: m[1], buf };
}

async function saveDataUrl(dataUrl, kind, { allow, maxBytes, ownerId = null }) {
  const { mime, buf } = parseDataUrl(dataUrl, { allow, maxBytes });
  const r = await query('INSERT INTO files (owner_id, kind, mime, data) VALUES (?, ?, ?, ?)', [ownerId, kind, mime, buf]);
  return `/files/${r.insertId}.${EXT[mime]}`;
}

async function removeUpload(url) {
  if (!url) return;
  const m = /^\/files\/(\d+)\./.exec(url);
  if (m) { await query('DELETE FROM files WHERE id = ?', [m[1]]); return; }
  if (url.startsWith('/uploads/')) {
    const p = path.normalize(path.join(ROOT, url.slice('/uploads/'.length)));
    if (p.startsWith(ROOT)) await fs.unlink(p).catch(() => {});
  }
}

module.exports = { ROOT, saveDataUrl, removeUpload, parseDataUrl };
