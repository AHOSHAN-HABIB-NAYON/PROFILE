import argon2 from 'argon2';
import { z } from 'zod';

/** OWASP-recommended Argon2id parameters (m=64MiB, t=3, p=1). */
const OPTS = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 } as const;

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password is too long')
  .refine(
    (p) => /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p),
    'Use upper and lower case letters and a number',
  );

export function hashPassword(pw: string): Promise<string> {
  return argon2.hash(pw, OPTS);
}

export async function verifyPassword(hash: string | null, pw: string): Promise<boolean> {
  if (!hash) {
    // Equalise timing for accounts without passwords / unknown accounts.
    await argon2.hash(pw, OPTS).catch(() => undefined);
    return false;
  }
  try {
    return await argon2.verify(hash, pw);
  } catch {
    return false;
  }
}

export function needsRehash(hash: string) {
  return argon2.needsRehash(hash, OPTS);
}

let dummy: string | null = null;
/** Burn equivalent time when the account does not exist (prevents user enumeration by timing). */
export async function dummyVerify(pw: string) {
  dummy ??= await argon2.hash('dummy-password-for-timing', OPTS);
  await argon2.verify(dummy, pw).catch(() => false);
}
