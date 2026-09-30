/* ─────────────────────────────────────────────
   ছবি ও পিডিএফ আপলোড: sharp দিয়ে রিসাইজ + কম্প্রেস (লক্ষ্য সাইজে)
   sharp না চললে (কিছু হোস্টিংয়ে) মূল ছবিই সেভ হয়, সাইট থামে না।
   ───────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';

let sharpLib;
async function sharp() { if (sharpLib === undefined) { try { sharpLib = (await import('sharp')).default; sharpLib.concurrency(1); sharpLib.cache({ memory: 50, items: 20 }); } catch { sharpLib = null; } } return sharpLib; }

const ok = /^image\/(jpe?g|png|webp|gif|avif)$/i;
export const uploadPath = (folder, file) => path.join(config.uploadDir, folder, file);
const rid = () => crypto.randomBytes(8).toString('hex');

/** @returns {Promise<{file?:string, err?:string}>} */
export async function saveImage(f, { folder = 'posts', maxW = 1600, ratio = null, targetKB = 0, square = false } = {}) {
  if (!f || !f.buffer?.length) return { err: 'ছবি পাওয়া যায়নি।' };
  if (f.buffer.length > 12 * 1024 * 1024) return { err: 'ছবির সাইজ ১২ এমবির বেশি।' };
  const s = await sharp();
  fs.mkdirSync(path.join(config.uploadDir, folder), { recursive: true });
  const isImg = ok.test(f.type || '') || /\.(jpe?g|png|webp|gif|avif)$/i.test(f.name || '');
  if (!isImg) return { err: 'শুধু JPG, PNG বা WebP ছবি দিন।' };
  if (!s) { const ext = (path.extname(f.name) || '.jpg').toLowerCase(); const file = rid() + ext; fs.writeFileSync(uploadPath(folder, file), f.buffer); return { file }; }
  try {
    let img = s(f.buffer, { failOn: 'none' }).rotate();
    const meta = await img.metadata();
    if (!meta.width) return { err: 'ছবিটি পড়া যায়নি।' };
    const r = square ? 1 : ratio;
    if (r) {
      const w = Math.min(maxW, meta.width); const h = Math.round(w / r);
      img = img.resize(w, h, { fit: 'cover', position: 'attention' });
    } else img = img.resize({ width: Math.min(maxW, meta.width), withoutEnlargement: true });
    img = img.flatten({ background: '#ffffff' });
    let q = 82; let out = await img.clone().jpeg({ quality: q, mozjpeg: true }).toBuffer();
    if (targetKB) { while (out.length > targetKB * 1024 && q > 38) { q -= 7; out = await img.clone().jpeg({ quality: q, mozjpeg: true }).toBuffer(); } }
    const file = `${rid()}.jpg`;
    fs.writeFileSync(uploadPath(folder, file), out);
    return { file };
  } catch (e) { return { err: 'ছবি প্রসেস করা যায়নি — অন্য ছবি দিয়ে চেষ্টা করুন।' }; }
}

export function savePdf(f, name) {
  if (!f || !f.buffer?.length) return { err: 'পিডিএফ পাওয়া যায়নি।' };
  if (f.buffer.length > 15 * 1024 * 1024) return { err: `পিডিএফ ${Math.round(f.buffer.length / 1048576)} এমবি — ১৫ এমবির কম দিন (ilovepdf দিয়ে কমিয়ে নিন)।` };
  if (f.buffer.slice(0, 5).toString() !== '%PDF-') return { err: 'এটি বৈধ পিডিএফ নয়।' };
  fs.mkdirSync(path.join(config.uploadDir, 'pdf'), { recursive: true });
  const file = name || `${rid()}.pdf`;
  fs.writeFileSync(uploadPath('pdf', file), f.buffer);
  return { file };
}
export const removeFile = (folder, file) => { if (file && !/[\\/]/.test(file)) { try { fs.unlinkSync(uploadPath(folder, file)); } catch { /* নেই */ } } };
export const fileExists = (folder, file) => { try { return fs.existsSync(uploadPath(folder, file)); } catch { return false; } };
