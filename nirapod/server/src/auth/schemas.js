// Shared request schemas (zod).
import { z } from 'zod';

export const LANGUAGES = ['en', 'bn', 'hi', 'ur', 'ar', 'es', 'id', 'ms'];
export const language = z.enum(LANGUAGES);

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ message: 'Enter a valid email address.' }));

const short = (max) => z.string().trim().max(max).optional();

export const device = z
  .object({
    device_id: z.string().trim().min(1).max(64).optional(),
    model: short(100),
    manufacturer: short(60),
    os_version: short(40),
    app_version: short(20),
  })
  .optional();

export const sixDigitCode = z.string().trim().regex(/^[0-9]{6}$/, 'The code has 6 digits.');

/** Names: 1-60 characters in any script (counted by code point), trimmed, no control characters. */
export const displayName = z
  .string()
  .trim()
  .refine((s) => Array.from(s).length >= 1 && Array.from(s).length <= 60, 'Use 1 to 60 characters.')
  .refine((s) => !/[\p{Cc}\p{Cs}]/u.test(s), 'The name contains characters that are not allowed.');
