import multer from 'multer';
import { badRequest } from '../core/errors.js';

const IMAGE_MIME = /^image\/(jpeg|png|webp|avif|gif|heic|heif|tiff)$/;

/** Memory storage: files never touch disk until they have been decoded & re-encoded by sharp. */
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 12, fields: 200, fieldSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!IMAGE_MIME.test(file.mimetype)) return cb(badRequest(`"${file.originalname}" is not a supported image (JPG, PNG, WebP, AVIF)`));
    cb(null, true);
  },
});
