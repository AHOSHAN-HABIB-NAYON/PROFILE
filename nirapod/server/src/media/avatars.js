// Profile photo pipeline (server side). The app already crops/resizes/strips, but the server never trusts it:
// 1. magic bytes must say JPEG, PNG, WebP or HEIC/HEIF (the declared content type is ignored);
// 2. decode, auto-rotate by EXIF, then re-encode to 512x512 and 128x128 JPEG with ALL metadata removed
//    (sharp drops EXIF/XMP/ICC/IPTC unless asked to keep them);
// 3. random file names (crypto.randomUUID), written under UPLOAD_DIR/avatars, served read-only at /media/avatars.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import { ApiError } from '../errors.js';

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const SIZES = { full: 512, thumb: 128 };
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const HEIC = new Set(['image/heic', 'image/heif']);
export const PUBLIC_PREFIX = '/media/avatars/';
const OWN_FILE = /^\/media\/avatars\/[0-9a-f-]{36}\.jpg$/;

export function avatarDir(uploadDir) {
  return path.resolve(uploadDir, 'avatars');
}

export async function processAvatar(buffer) {
  const type = await fileTypeFromBuffer(buffer);
  if (!type || !ALLOWED.has(type.mime)) {
    throw new ApiError('UNSUPPORTED_MEDIA', { message: 'Please choose a JPEG, PNG, WebP or HEIC photo.' });
  }
  const encode = (size) =>
    sharp(buffer, { failOn: 'error', limitInputPixels: 50_000_000 })
      .rotate() // apply EXIF orientation before metadata is dropped
      .resize(size, size, { fit: 'cover', position: 'attention' })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  try {
    return { full: await encode(SIZES.full), thumb: await encode(SIZES.thumb) };
  } catch {
    if (HEIC.has(type.mime)) {
      throw new ApiError('UNSUPPORTED_MEDIA', {
        message: 'HEIC photos cannot be processed on the server. Please upload the photo as JPEG.',
        details: { reason: 'heic_unsupported' },
      });
    }
    throw new ApiError('UNSUPPORTED_MEDIA', { message: 'This photo could not be read. Please choose another one.' });
  }
}

/** Writes both sizes with fresh random names. @returns stored relative paths */
export async function storeAvatar(uploadDir, { full, thumb }) {
  const dir = avatarDir(uploadDir);
  await fs.mkdir(dir, { recursive: true });
  const fullName = `${crypto.randomUUID()}.jpg`;
  const thumbName = `${crypto.randomUUID()}.jpg`;
  await fs.writeFile(path.join(dir, fullName), full, { flag: 'wx', mode: 0o644 });
  await fs.writeFile(path.join(dir, thumbName), thumb, { flag: 'wx', mode: 0o644 });
  return { avatar_url: PUBLIC_PREFIX + fullName, avatar_thumb_url: PUBLIC_PREFIX + thumbName };
}

/** Deletes files we own (never Google URLs, never anything outside the avatar dir). */
export async function deleteStored(uploadDir, ...stored) {
  for (const s of stored) {
    if (typeof s !== 'string' || !OWN_FILE.test(s)) continue;
    await fs.rm(path.join(avatarDir(uploadDir), path.basename(s)), { force: true });
  }
}
