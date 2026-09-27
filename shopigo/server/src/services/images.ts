import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp, { type Metadata, type OutputInfo } from 'sharp';
import { badRequest } from '../core/errors.js';
import { UPLOADS_DIR, safeJoin } from '../core/paths.js';

sharp.cache({ memory: 64, files: 0, items: 50 });
sharp.concurrency(2);

export const IMAGE_SIZES = { thumb: 240, md: 640, lg: 1280 } as const;
export type ImageSize = keyof typeof IMAGE_SIZES;
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'avif', 'gif', 'heif', 'tiff']);
const MAX_PIXELS = 40_000_000;

export interface ProcessedImage { path: string; width: number; height: number; bytes: number }

function relBase(folder: string): string {
  if (!/^[a-z0-9_-]+$/.test(folder)) throw badRequest('Invalid upload folder');
  const now = new Date();
  const ym = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${folder}/${ym}/${crypto.randomBytes(10).toString('hex')}`;
}

/** Validates by decoding (not by trusting the client MIME type). */
async function inspect(buffer: Buffer) {
  let meta: Metadata;
  try {
    meta = await sharp(buffer, { limitInputPixels: MAX_PIXELS }).metadata();
  } catch {
    throw badRequest('The uploaded file is not a valid image');
  }
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) throw badRequest('Unsupported image format. Use JPG, PNG, WebP or AVIF.');
  if (!meta.width || !meta.height) throw badRequest('Could not read image dimensions');
  return meta;
}

/**
 * Stores a responsive set:  <base>-{thumb,md,lg}.{avif,webp}  + <base>-lg.jpg
 * (the JPEG is used for social previews / old browsers). A 5 MB camera photo
 * typically ends up ~60–150 KB per WebP variant.
 */
export async function processImage(buffer: Buffer, folder: string, quality = 78): Promise<ProcessedImage> {
  await inspect(buffer);
  const base = relBase(folder);
  const dir = path.dirname(safeJoin(UPLOADS_DIR, base));
  await fs.mkdir(dir, { recursive: true });
  const q = Math.min(95, Math.max(40, quality));
  const source = sharp(buffer, { limitInputPixels: MAX_PIXELS }).rotate(); // honours EXIF orientation, strips metadata
  let lgInfo: OutputInfo | null = null;
  let bytes = 0;
  for (const [size, width] of Object.entries(IMAGE_SIZES)) {
    const resized = source.clone().resize({ width, height: width, fit: 'inside', withoutEnlargement: true });
    const webp = await resized.clone().webp({ quality: q, effort: 4 }).toFile(safeJoin(UPLOADS_DIR, `${base}-${size}.webp`));
    const avif = await resized.clone().avif({ quality: Math.max(35, q - 18), effort: 3 }).toFile(safeJoin(UPLOADS_DIR, `${base}-${size}.avif`));
    bytes += webp.size + avif.size;
    if (size === 'lg') {
      lgInfo = webp;
      const jpg = await resized.clone().flatten({ background: '#ffffff' }).jpeg({ quality: q, mozjpeg: true }).toFile(safeJoin(UPLOADS_DIR, `${base}-lg.jpg`));
      bytes += jpg.size;
    }
  }
  return { path: base, width: lgInfo?.width ?? 0, height: lgInfo?.height ?? 0, bytes };
}

/** Square PNG icons for favicon / PWA: <base>-{32,180,192,512}.png */
export async function processIcon(buffer: Buffer, folder = 'branding'): Promise<ProcessedImage> {
  await inspect(buffer);
  const base = relBase(folder);
  await fs.mkdir(path.dirname(safeJoin(UPLOADS_DIR, base)), { recursive: true });
  let bytes = 0;
  for (const size of [32, 180, 192, 512]) {
    const out = await sharp(buffer, { limitInputPixels: MAX_PIXELS })
      .rotate()
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(safeJoin(UPLOADS_DIR, `${base}-${size}.png`));
    bytes += out.size;
  }
  return { path: base, width: 512, height: 512, bytes };
}

/** Logo keeps its aspect ratio and transparency (PNG + WebP). */
export async function processLogo(buffer: Buffer): Promise<ProcessedImage> {
  await inspect(buffer);
  const base = relBase('branding');
  await fs.mkdir(path.dirname(safeJoin(UPLOADS_DIR, base)), { recursive: true });
  const img = sharp(buffer, { limitInputPixels: MAX_PIXELS }).rotate().resize({ height: 160, width: 640, fit: 'inside', withoutEnlargement: true });
  const webp = await img.clone().webp({ quality: 90 }).toFile(safeJoin(UPLOADS_DIR, `${base}-logo.webp`));
  const png = await img.clone().png({ compressionLevel: 9 }).toFile(safeJoin(UPLOADS_DIR, `${base}-logo.png`));
  return { path: base, width: webp.width, height: webp.height, bytes: webp.size + png.size };
}

export async function deleteImageSet(base: string): Promise<void> {
  if (!base) return;
  const dir = path.dirname(safeJoin(UPLOADS_DIR, base));
  const prefix = path.basename(base) + '-';
  try {
    for (const f of await fs.readdir(dir)) if (f.startsWith(prefix)) await fs.unlink(path.join(dir, f)).catch(() => {});
  } catch { /* already gone */ }
}

export function imageUrl(base: string | null | undefined, size: ImageSize = 'md', fmt: 'webp' | 'avif' | 'jpg' = 'webp'): string | null {
  if (!base) return null;
  if (/^https?:\/\//.test(base)) return base;
  if (fmt === 'jpg') return `/uploads/${base}-lg.jpg`;
  return `/uploads/${base}-${size}.${fmt}`;
}
