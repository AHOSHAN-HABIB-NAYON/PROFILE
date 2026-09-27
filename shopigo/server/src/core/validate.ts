import type { ZodSchema, ZodTypeDef } from 'zod';
import { z } from 'zod';
import { badRequest } from './errors.js';

export function parse<T>(schema: ZodSchema<T, ZodTypeDef, unknown>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) fields[issue.path.join('.') || '_'] = issue.message;
    const first = result.error.issues[0];
    throw badRequest(first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'Invalid input', fields);
  }
  return result.data;
}

/** Bangladeshi mobile number → canonical 01XXXXXXXXX */
export function normalizeBdPhone(input: string): string | null {
  const digits = input.replace(/[^\d]/g, '').replace(/^(?:00)?880/, '0').replace(/^(?=1[3-9])/, '0');
  return /^01[3-9]\d{8}$/.test(digits) ? digits : null;
}

/** Converts Bangla digits (০-৯) to ASCII. */
export function asciiDigits(s: string): string {
  return s.replace(/[০-৯]/g, (c) => String(c.charCodeAt(0) - 0x09e6));
}

export const zPhone = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const p = normalizeBdPhone(asciiDigits(v));
    if (!p) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'সঠিক মোবাইল নম্বর দিন (01XXXXXXXXX)' });
      return z.NEVER;
    }
    return p;
  });

export const zBool = z.union([z.boolean(), z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0'), z.literal(1), z.literal(0)]).transform((v) => v === true || v === 'true' || v === '1' || v === 1);
export const zId = z.coerce.number().int().positive();
export const zMoney = z.coerce.number().min(0).max(100_000_000);
export const zOptionalMoney = z.union([z.literal(''), z.null(), z.undefined(), zMoney]).transform((v) => (v === '' || v === undefined ? null : v));
export const zOptionalDate = z.union([z.literal(''), z.null(), z.undefined(), z.coerce.date()]).transform((v) => (v === '' || v === undefined ? null : v));

/** Strips tags from plain-text inputs (names, addresses...). */
export function plain(s: string): string {
  return s.replace(/<[^>]*>/g, '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
}
export const zText = (max: number) => z.string().max(max).transform(plain);

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ঀ-৿]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
  return base || Math.random().toString(36).slice(2, 10);
}

export function pageParams(q: Record<string, unknown>, defLimit = 20, maxLimit = 100) {
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number(q.limit) || defLimit));
  return { page, limit, offset: (page - 1) * limit };
}
