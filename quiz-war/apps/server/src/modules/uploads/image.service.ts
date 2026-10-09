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

  async squadLogo(squadId: number, buf: Buffer) {
    await this.validate(buf);
    const out = await this.encode(buf, 256, true, 80);
    return this.storage.put(`squads/${squadId}/${randomToken(9)}.webp`, out.data, 'image/webp');
  }

  async remove(url: string | null | undefined) {
    if (url) await this.storage.remove(url);
  }
}
