'use strict';
/**
 * Upload handling: memory storage, size limits, MIME whitelist *and* magic-byte sniffing.
 * Images are re-encoded to WebP with sharp when available (strips metadata, optimises size).
 */
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { err } = require('../lib/http');
const { randomToken } = require('../lib/crypto');
const settings = require('./settings');

let sharp = null;
try { sharp = require('sharp'); } catch { /* optional */ }

const UPLOAD_ROOT = require('../config').UPLOAD_DIR; // persistent (survives re-deploys)

function sniff(buf) {
  if (buf.length < 12) return null;
  const hex = buf.subarray(0, 12).toString('hex');
  if (hex.startsWith('89504e47')) return 'image/png';
  if (hex.startsWith('ffd8ff')) return 'image/jpeg';
  if (hex.startsWith('47494638')) return 'image/gif';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf.subarray(4, 12).toString().startsWith('ftypavif')) return 'image/avif';
  if (buf.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (hex.startsWith('00000100')) return 'image/x-icon';
  const head = buf.subarray(0, 300).toString('utf8').trim().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml';
  return null;
}

const maxBytes = () => Math.max(1, Number(settings.get('upload_max_mb')) || 5) * 1024 * 1024;

function makeMulter(field, allowed) {
  return (req, res, next) => {
    multer({ storage: multer.memoryStorage(), limits: { fileSize: maxBytes(), files: 1, fields: 10 } }).single(field)(req, res, (e) => {
      if (e) return next(err(413, 'file_too_large', `File too large (max ${settings.get('upload_max_mb')} MB)`));
      if (req.file) {
        const real = sniff(req.file.buffer);
        if (!real || !allowed.includes(real)) return next(err(415, 'file_type', 'Unsupported file type'));
        req.file.realType = real;
      }
      next();
    });
  };
}

const image = (field = 'file') => makeMulter(field, ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']);
const attachment = (field = 'file') => makeMulter(field, ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']);
const brand = (field = 'file') => makeMulter(field, ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/x-icon']);

/** Save a public image (avatars, brand assets) — returns a URL path */
async function saveImage(file, dir, { maxSize = 1024, keepFormat = false } = {}) {
  fs.mkdirSync(path.join(UPLOAD_ROOT, dir), { recursive: true });
  const id = randomToken(12);
  if (file.realType === 'image/svg+xml') {
    // Reject active content in SVG
    const s = file.buffer.toString('utf8');
    if (/<script|on\w+\s*=|javascript:|<foreignObject|<iframe|<embed|<object/i.test(s)) throw err(415, 'file_type', 'SVG contains unsafe content');
    fs.writeFileSync(path.join(UPLOAD_ROOT, dir, id + '.svg'), s);
    return `/uploads/${dir}/${id}.svg`;
  }
  if (file.realType === 'image/x-icon') { fs.writeFileSync(path.join(UPLOAD_ROOT, dir, id + '.ico'), file.buffer); return `/uploads/${dir}/${id}.ico`; }
  if (sharp && !keepFormat) {
    const out = await sharp(file.buffer).rotate().resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true }).webp({ quality: 86 }).toBuffer();
    fs.writeFileSync(path.join(UPLOAD_ROOT, dir, id + '.webp'), out);
    return `/uploads/${dir}/${id}.webp`;
  }
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' }[file.realType];
  fs.writeFileSync(path.join(UPLOAD_ROOT, dir, `${id}.${ext}`), file.buffer);
  return `/uploads/${dir}/${id}.${ext}`;
}

/** Private attachment — stored outside any public path, served via an ownership-checked route */
async function savePrivate(file) {
  fs.mkdirSync(path.join(UPLOAD_ROOT, 'attachments'), { recursive: true });
  let buf = file.buffer; let type = file.realType; let ext = type === 'application/pdf' ? 'pdf' : 'bin';
  if (type.startsWith('image/') && sharp) { buf = await sharp(buf).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(); type = 'image/webp'; ext = 'webp'; }
  else if (type.startsWith('image/')) ext = type.split('/')[1];
  const name = `${randomToken(18)}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_ROOT, 'attachments', name), buf);
  return { path: name, mime: type };
}

/** Generate PWA icon set from an uploaded image */
async function makePwaIcons(file) {
  if (!sharp) return null;
  const dir = 'pwa-' + randomToken(6);
  fs.mkdirSync(path.join(UPLOAD_ROOT, 'brand', dir), { recursive: true });
  const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
  for (const s of sizes) await sharp(file.buffer).resize(s, s, { fit: 'cover' }).png().toFile(path.join(UPLOAD_ROOT, 'brand', dir, `icon-${s}.png`));
  for (const s of [192, 512]) {
    const inner = Math.round(s * 0.8);
    const img = await sharp(file.buffer).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    await sharp({ create: { width: s, height: s, channels: 4, background: settings.get('theme_color') || '#1E4FD8' } }).composite([{ input: img, gravity: 'center' }]).png().toFile(path.join(UPLOAD_ROOT, 'brand', dir, `maskable-${s}.png`));
  }
  await sharp(file.buffer).resize(180, 180, { fit: 'cover' }).png().toFile(path.join(UPLOAD_ROOT, 'brand', dir, 'apple-touch-icon.png'));
  return `/uploads/brand/${dir}`;
}

module.exports = { image, attachment, brand, saveImage, savePrivate, makePwaIcons, UPLOAD_ROOT, hasSharp: () => !!sharp };
