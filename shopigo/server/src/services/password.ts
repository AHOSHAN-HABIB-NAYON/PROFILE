import { hash, verify } from '@node-rs/argon2';

// Argon2id, OWASP-recommended parameters.
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashPassword = (plain: string) => hash(plain, OPTS);
export const verifyPassword = async (stored: string, plain: string) => {
  try { return await verify(stored, plain); } catch { return false; }
};

export function passwordProblems(pw: string): string | null {
  if (pw.length < 10) return 'Password must be at least 10 characters';
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password must contain upper-case, lower-case letters and a number';
  return null;
}
