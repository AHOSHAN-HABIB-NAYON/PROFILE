'use strict';
/**
 * Upload handling: magic-byte validation, automatic image compression,
 * banner crop (856×292), PDF storage. Files land in the persistent uploads dir.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');

let sharp = null;
try { sharp = require('sharp'); sharp.cache(false); sharp.concurrency(1); } catch (_) { sharp = null; }

const IMAGE_SIGS = [
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', ext: 'png', test: (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/gif', ext: 'gif', test: (b) => b.slice(0, 4).toString('ascii') === 'GIF8' },
  { mime: 'image/webp', ext: 'webp', test: (b) => b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP' },
  { mime: 'image/avif', ext: 'avif', test: (b) => b.slice(4, 12).toString('ascii').startsWith('ftypavi') },
];

function detectImage(buf) {
  if (!buf || buf.length < 12) return null;
  return IMAGE_SIGS.find((s) => s.test(buf)) || null;
}
function isPdf(buf) { return buf && buf.length > 5 && buf.slice(0, 5).toString('ascii') === '%PDF-'; }

/**
 * Target size scales with the original: 1MB→~100KB … 5MB→~450KB.
 * Small images (<1MB) aim for ~10% but never below 40KB.
 */
function targetBytes(originalBytes) {
  const mb = originalBytes / (1024 * 1024);
  if (mb <= 1) return Math.max(40 * 1024, Math.min(100 * 1024, originalBytes * 0.5));
  const kb = 100 + (Math.min(mb, 8) - 1) * 87.5;
  return Math.round(kb * 1024);
}

function subdir() {
  const d = new Date();
  const rel = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  const abs = path.join(config.uploadsDir(), rel);
  fs.mkdirSync(abs, { recursive: true });
  return { rel, abs };
}
function randomName(ext) { return `${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}.${ext}`; }

async function encodeToTarget(pipelineFactory, target) {
  let quality = 82;
  let out = await pipelineFactory().webp({ quality, effort: 4 }).toBuffer();
  while (out.length > target && quality > 38) {
    quality -= out.length > target * 1.6 ? 14 : 7;
    out = await pipelineFactory().webp({ quality, effort: 4 }).toBuffer();
  }
  return out;
}

/**
 * Save an uploaded image.
 * kind: 'thumb' (max 1200px wide, size-scaled target), 'banner' (856×292 crop, ~200KB),
 *       'avatar' (400×400), 'logo' (max 512, keeps transparency), 'ad', 'favicon'
 */
async function saveImage(buf, kind = 'thumb') {
  const sig = detectImage(buf);
  if (!sig) throw new Error('শুধু JPG, PNG, WEBP, GIF বা AVIF ছবি আপলোড করা যাবে');
  if (buf.length > 12 * 1024 * 1024) throw new Error('ছবির সাইজ সর্বোচ্চ ১২MB হতে পারবে');
  const { rel, abs } = subdir();

  if (!sharp) {
    const name = randomName(sig.ext);
    fs.writeFileSync(path.join(abs, name), buf);
    return `${rel}/${name}`;
  }

  let factory; let target;
  switch (kind) {
    case 'banner':
      factory = () => sharp(buf, { failOn: 'none' }).rotate().resize(856, 292, { fit: 'cover', position: 'attention' });
      target = 200 * 1024;
      break;
    case 'hero':
      factory = () => sharp(buf, { failOn: 'none' }).rotate().resize(1920, 1080, { fit: 'inside', withoutEnlargement: true });
      target = 260 * 1024;
      break;
    case 'avatar':
      factory = () => sharp(buf, { failOn: 'none' }).rotate().resize(400, 400, { fit: 'cover', position: 'attention' });
      target = 60 * 1024;
      break;
    case 'logo':
    case 'favicon':
      factory = () => sharp(buf, { failOn: 'none' }).resize(512, 512, { fit: 'inside', withoutEnlargement: true });
      target = 80 * 1024;
      break;
    case 'ad':
      factory = () => sharp(buf, { failOn: 'none', animated: sig.ext === 'gif' }).rotate().resize(1456, 600, { fit: 'inside', withoutEnlargement: true });
      target = 220 * 1024;
      break;
    default:
      factory = () => sharp(buf, { failOn: 'none' }).rotate().resize(1200, 1200, { fit: 'inside', withoutEnlargement: true });
      target = targetBytes(buf.length);
  }
  const out = await encodeToTarget(factory, target);
  const name = randomName('webp');
  fs.writeFileSync(path.join(abs, name), out);
  return `${rel}/${name}`;
}

async function savePdf(buf) {
  if (!isPdf(buf)) throw new Error('ফাইলটি সঠিক PDF নয়');
  if (buf.length > 15 * 1024 * 1024) throw new Error('PDF সর্বোচ্চ ১৫MB হতে পারবে');
  const { rel, abs } = subdir();
  const name = randomName('pdf');
  fs.writeFileSync(path.join(abs, name), buf);
  return `${rel}/${name}`;
}

function removeFile(rel) {
  if (!rel || rel.includes('..')) return;
  fs.unlink(path.join(config.uploadsDir(), rel), () => {});
}

function url(rel) {
  if (!rel) return '';
  if (/^https?:\/\//.test(rel) || rel.startsWith('/')) return rel;
  return `/uploads/${rel}`;
}

/** Generate PWA icons from an uploaded logo (or default SVG). */
async function makeIcons(sourceBuf, outDir, bg = '#ffffff') {
  if (!sharp) return false;
  fs.mkdirSync(outDir, { recursive: true });
  for (const size of [48, 72, 96, 144, 192, 512]) {
    await sharp(sourceBuf).resize(size, size, { fit: 'contain', background: bg }).png().toFile(path.join(outDir, `icon-${size}.png`));
  }
  // maskable: logo at 70% on solid background
  const inner = await sharp(sourceBuf).resize(358, 358, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 4, background: bg } }).composite([{ input: inner, gravity: 'center' }]).png().toFile(path.join(outDir, 'maskable-512.png'));
  await sharp(sourceBuf).resize(180, 180, { fit: 'contain', background: bg }).png().toFile(path.join(outDir, 'apple-touch-icon.png'));
  return true;
}

module.exports = { saveImage, savePdf, removeFile, url, detectImage, isPdf, targetBytes, makeIcons, hasSharp: () => !!sharp };
