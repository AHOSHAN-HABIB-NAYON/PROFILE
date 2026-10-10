import sharp from 'sharp';
import { randomToken } from '../../lib/crypto';
import { AppError } from '../../lib/errors';
import type { StorageProvider } from './storage';

const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'heif', 'avif']);
const MAX_INPUT_PIXELS = 40_000_000;

export interface ImageVariant {
  url: string;
  width: number;
  height: number;
  bytes: number;
}

/**
 * Upload → validate (real decode, not just the extension/MIME) → resize → compress →
 * WebP → thumbnail → store. Metadata (EXIF/GPS) is stripped because sharp does not copy it
 * unless asked to.
 */
export class ImageService {
  constructor(
    private readonly storage: StorageProvider,
    private readonly maxBytes: number,
  ) {}

  async validate(buf: Buffer) {
    if (buf.length === 0) throw new AppError(400, 'invalid_image', 'The file is empty');
    if (buf.length > this.maxBytes) throw new AppError(413, 'image_too_large', `Image must be smaller than ${Math.round(this.maxBytes / 1024 / 1024)} MB`);
    let meta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
    try {
      meta = await sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' }).metadata();
    } catch {
      throw new AppError(400, 'invalid_image', 'This file is not a valid image');
    }
    if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) throw new AppError(415, 'unsupported_image', 'Use a JPG, PNG or WebP image');
    if (!meta.width || !meta.height || meta.width < 32 || meta.height < 32) throw new AppError(400, 'image_too_small', 'Image is too small');
    if (meta.width > 8000 || meta.height > 8000) throw new AppError(400, 'image_dimensions', 'Image dimensions are too large');
    return meta;
  }

  private async encode(buf: Buffer, size: number, square: boolean, quality: number) {
    const pipeline = sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS }).rotate();
    const resized = square
      ? pipeline.resize(size, size, { fit: 'cover', position: 'attention' })
      : pipeline.resize(size, size, { fit: 'inside', withoutEnlargement: true });
    const { data, info } = await resized.webp({ quality, effort: 4 }).toBuffer({ resolveWithObject: true });
    return { data, info };
  }

  async avatar(userId: number, buf: Buffer) {
    await this.validate(buf);
    const id = randomToken(9);
    const main = await this.encode(buf, 512, true, 80);
    const thumb = await this.encode(buf, 128, true, 72);
    const url = await this.storage.put(`avatars/${userId}/${id}.webp`, main.data, 'image/webp');
    const thumbUrl = await this.storage.put(`avatars/${userId}/${id}_t.webp`, thumb.data, 'image/webp');
    return {
      main: { url, width: main.info.width, height: main.info.height, bytes: main.data.length } as ImageVariant,
      thumb: { url: thumbUrl, width: thumb.info.width, height: thumb.info.height, bytes: thumb.data.length } as ImageVariant,
    };
  }

  async questionImage(buf: Buffer) {
    await this.validate(buf);
    const out = await this.encode(buf, 1280, false, 82);
    const url = await this.storage.put(`questions/${randomToken(12)}.webp`, out.data, 'image/webp');
    return { url, width: out.info.width, height: out.info.height, bytes: out.data.length };
  }

  /**
   * Category icon: SVG, PNG, JPG or WebP. SVGs are kept as SVG (the phone draws the text with
   * its own fonts — rasterising on the server broke Bangla/English lettering) after stripping
   * scripts, event handlers and outside links; /media also serves them under a no-script CSP.
   * Bitmaps are fitted whole into a transparent 256px WebP.
   */
  async categoryIcon(buf: Buffer, folder: 'categories' | 'promos' = 'categories') {
    if (buf.length === 0) throw new AppError(400, 'invalid_image', 'The file is empty');
    if (buf.length > this.maxBytes) throw new AppError(413, 'image_too_large', 'Image is too large');
    const isSvg = /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(buf.subarray(0, 4096).toString('utf8'));
    if (isSvg) {
      const clean = Buffer.from(sanitizeSvg(buf.toString('utf8')), 'utf8');
      try {
        const meta = await sharp(clean, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' }).metadata();
        if (meta.format !== 'svg') throw new Error('not svg');
      } catch {
        throw new AppError(400, 'invalid_image', 'This file is not a valid SVG or image');
      }
      return { url: await this.storage.put(`${folder}/${randomToken(10)}.svg`, clean, 'image/svg+xml') };
    }
    let meta;
    try {
      meta = await sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' }).metadata();
    } catch {
      throw new AppError(400, 'invalid_image', 'This file is not a valid SVG or image');
    }
    if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) throw new AppError(415, 'unsupported_image', 'Use an SVG, PNG, JPG or WebP file');
    const { data } = await sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 90, alphaQuality: 100 })
      .toBuffer({ resolveWithObject: true });
    return { url: await this.storage.put(`${folder}/${randomToken(10)}.webp`, data, 'image/webp') };
  }

  async squadLogo(squadId: number, buf: Buffer) {
    await this.validate(buf);
    const out = await this.encode(buf, 256, true, 80);
    return this.storage.put(`squads/${squadId}/${randomToken(9)}.webp`, out.data, 'image/webp');
  }

  async remove(url: string | null | undefined) {
    if (url) await this.storage.remove(url);
  }
}

/**
 * Removes everything active from an SVG: scripts, foreignObject/iframes, event handlers,
 * javascript:/external links and the DOCTYPE (entity tricks). Also gives it a viewBox so it
 * scales to any size instead of being clipped.
 */
export function sanitizeSvg(src: string): string {
  let s = src
    .replace(/<\?xml[^>]*>/gi, '')
    .replace(/<!DOCTYPE[^>[]*(\[[\s\S]*?\])?\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|foreignObject|iframe|object|embed|audio|video|handler|listener)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|foreignObject|iframe|object|embed|audio|video|handler|listener)\b[^>]*\/?>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(?:xlink:)?href\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, (m, v: string) => {
      const u = v.replace(/^["']|["']$/g, '').trim();
      return u.startsWith('#') || /^data:image\/(png|jpe?g|webp|gif);/i.test(u) ? m : '';
    })
    .replace(/url\(\s*["']?\s*(?!#)[^)]*\)/gi, 'none')
    .replace(/@import[^;]*;?/gi, '')
    .trim();
  const open = /<svg\b[^>]*>/i.exec(s);
  if (open && !/\sviewBox\s*=/i.test(open[0])) {
    const w = parseFloat(/\swidth\s*=\s*["']?([\d.]+)/i.exec(open[0])?.[1] ?? '');
    const h = parseFloat(/\sheight\s*=\s*["']?([\d.]+)/i.exec(open[0])?.[1] ?? '');
    if (w > 0 && h > 0) s = s.replace(open[0], open[0].replace(/<svg\b/i, `<svg viewBox="0 0 ${w} ${h}"`));
  }
  return s;
}
