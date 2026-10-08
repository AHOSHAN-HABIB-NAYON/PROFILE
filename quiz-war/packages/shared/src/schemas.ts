import { z } from 'zod';
import { USERNAME_REGEX } from './rules/username';
import { DIFFICULTIES, REPORT_REASONS } from './types';

export const emailSchema = z.string().trim().toLowerCase().email().max(190);
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Use letters and numbers');

export const registerSchema = z.object({ email: emailSchema, password: passwordSchema });
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });
export const usernameSchema = z.string().trim().regex(USERNAME_REGEX, '3–20 letters, numbers, _ or .');

export const profileUpdateSchema = z.object({
  username: usernameSchema.optional(),
  bio: z.string().trim().max(160).nullable().optional(),
  title: z.string().max(40).nullable().optional(),
  frame: z.string().max(40).nullable().optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
});

export const questionInputSchema = z.object({
  categoryId: z.number().int().positive(),
  difficulty: z.enum(DIFFICULTIES),
  language: z.enum(['bn', 'en']).default('bn'),
  text: z.string().trim().min(3).max(1000),
  options: z.array(z.string().trim().min(1).max(300)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().trim().max(2000).nullable().optional(),
  hint: z.string().trim().max(300).nullable().optional(),
  imageUrl: z.string().max(500).nullable().optional(),
  isActive: z.boolean().default(true),
  tags: z.array(z.string().max(40)).max(10).optional(),
});
export type QuestionInput = z.infer<typeof questionInputSchema>;

export const reportSchema = z.object({
  targetUid: z.string().optional(),
  matchId: z.string().max(40).optional(),
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(1000).optional(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
