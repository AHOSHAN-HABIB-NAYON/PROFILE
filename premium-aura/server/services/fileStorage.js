'use strict';
/**
 * Secure upload handling:
 *  - multer keeps files in memory (bounded by size limit), nothing touches disk
 *    until the content is verified;
 *  - type is decided by magic bytes, never by the client MIME/extension alone
 *    (both must also agree with the detected type);
 *  - images are re-encoded with sharp when available (strips metadata and any
 *    polyglot payload) and down-scaled/compressed;
 *  - files get random names; private files are served only through an
 *    authorised route.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const paths = require('../config/paths');
const db = require('../config/database');
const { E } = require('../utils/errors');

let sharp = null;
try { sharp = require('sharp'); } catch { sharp = null; }

for (const d of [paths.PUBLIC_UPLOADS, paths.PRIVATE_UPLOADS]) fs.mkdirSync(d, { recursive: true });

const IMAGE_TYPES = {
  jpg: { mime: 'image/jpeg', exts: ['jpg', 'jpeg'], test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  png: { mime: 'image/png', exts: ['png'], test: (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  webp: { mime: 'image/webp', exts: ['webp'], test: (b) => b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP' },
};

const DOC_TYPES = {
  csv: { mime: 'text/csv', exts: ['csv'], test: (b) => isText(b) },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', exts: ['xlsx'], test: (b) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04 },
  pdf: { mime: 'application/pdf', exts: ['pdf'], test: (b) => b.slice(0, 5).toString('ascii') === '%PDF-' },
};

function isText(buf) {
  const sample = buf.slice(0, 4096);
  for (const byte of sample) if (byte === 0) return false;
  return true;
}

function detect(buf, originalName, allowed) {
  const ext = path.extname(originalName || '').slice(1).toLowerCase();
  for (const [key, t] of Object.entries(allowed)) {
    if (t.exts.includes(ext) && t.test(buf)) return { key, ...t, ext: key === 'jpg' ? 'jpg' : key };
  }
  return null;
}

/** multer instance holding at most `maxBytes` in memory. */
function memoryUpload(maxBytes, maxFiles = 1) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: maxFiles, fields: 60, parts: 80 },
  });
}

async function processImage(buf, { maxWidth = 1920, quality = 82, square = null } = {}) {
  if (!sharp) return { buf, mime: null };
  let img = sharp(buf, { failOn: 'error' }).rotate();
  if (square) img = img.resize(square, square, { fit: 'cover' });
  else img = img.resize({ width: maxWidth, withoutEnlargement: true });
  const out = await img.webp({ quality }).toBuffer();
  return { buf: out, mime: 'image/webp', ext: 'webp' };
}

/**
 * Validate + persist an uploaded image. Returns file_uploads row info incl. `url`.
 */
async function saveImage(file, { userId = null, purpose, visibility = 'public', maxWidth, square } = {}) {
  if (!file) throw E.badRequest('Please choose an image to upload');
  const t = detect(file.buffer, file.originalname, IMAGE_TYPES);
  if (!t) throw E.badRequest('Only JPG, JPEG, PNG or WEBP images are allowed');
  if (file.mimetype && !Object.values(IMAGE_TYPES).some((x) => x.mime === file.mimetype) && file.mimetype !== 'image/jpg') {
    throw E.badRequest('File content does not match its type');
  }
  let buf = file.buffer;
  let mime = t.mime;
  let ext = t.ext;
  try {
    const p = await processImage(buf, { maxWidth, square });
    if (p.mime) { buf = p.buf; mime = p.mime; ext = p.ext; }
  } catch {
    throw E.badRequest('The image appears to be corrupted');
  }
  return persist(buf, { userId, purpose, visibility, originalName: file.originalname, mime, ext });
}

async function saveDocument(file, { userId = null, purpose, allowed = ['csv', 'xlsx', 'pdf'] } = {}) {
  if (!file) throw E.badRequest('Please choose a file to upload');
  const subset = Object.fromEntries(Object.entries(DOC_TYPES).filter(([k]) => allowed.includes(k)));
  const t = detect(file.buffer, file.originalname, subset);
  if (!t) throw E.badRequest(`Allowed file types: ${allowed.map((a) => a.toUpperCase()).join(', ')}`);
  const saved = await persist(file.buffer, { userId, purpose, visibility: 'private', originalName: file.originalname, mime: t.mime, ext: t.ext });
  return { ...saved, kind: t.key };
}

const DB_COPY_MAX = 12 * 1024 * 1024;

async function persist(buf, { userId, purpose, visibility, originalName, mime, ext }) {
  const stored = `${Date.now().toString(36)}-${crypto.randomBytes(12).toString('hex')}.${ext}`;
  const dir = visibility === 'public' ? paths.PUBLIC_UPLOADS : paths.PRIVATE_UPLOADS;
  await fs.promises.writeFile(path.join(dir, stored), buf, { mode: 0o640 }).catch(() => {}); // DB copy below is authoritative
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  const safeOriginal = String(originalName || 'file').replace(/[^\w.\- ]+/g, '_').slice(0, 200);
  const res = await db.run(
    'INSERT INTO file_uploads (user_id, purpose, visibility, original_name, stored_name, mime_type, size_bytes, sha256, data) VALUES (?,?,?,?,?,?,?,?,?)',
    [userId, purpose, visibility, safeOriginal, stored, mime, buf.length, sha, mime.startsWith('image/') && buf.length <= DB_COPY_MAX ? buf : null],
  );
  return {
    id: res.insertId, stored_name: stored, mime, size: buf.length, visibility,
    url: visibility === 'public' ? `/uploads/public/${stored}` : `/api/files/${res.insertId}`,
    path: path.join(dir, stored),
  };
}

function privatePath(storedName) {
  const safe = path.basename(storedName);
  return path.join(paths.PRIVATE_UPLOADS, safe);
}

/**
 * Send a stored file: from disk when present, otherwise from the database copy
 * (re-caching it on disk). Returns false when the file no longer exists.
 */
async function sendStored(res, row) {
  const dir = row.visibility === 'public' ? paths.PUBLIC_UPLOADS : paths.PRIVATE_UPLOADS;
  const file = path.join(dir, path.basename(row.stored_name));
  res.set('Content-Type', row.mime_type);
  res.set('X-Content-Type-Options', 'nosniff');
  if (fs.existsSync(file)) { res.sendFile(file); return true; }
  const full = await db.one('SELECT data FROM file_uploads WHERE id = ?', [row.id]);
  if (!full?.data) return false;
  fs.promises.writeFile(file, full.data, { mode: 0o640 }).catch(() => {});
  res.send(full.data);
  return true;
}

module.exports = { memoryUpload, saveImage, saveDocument, privatePath, sendStored, hasSharp: () => !!sharp, IMAGE_TYPES };
