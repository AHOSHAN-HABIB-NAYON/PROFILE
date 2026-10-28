// Password hashing (bcrypt) and the password rules shared with the app:
// at least 8 characters, at least one letter and one number, not in the common-password list.
import bcrypt from 'bcrypt';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const LIST_FILE = path.resolve(here, '../../data/common-passwords.txt');

export const COMMON_PASSWORDS = new Set(
  fs
    .readFileSync(LIST_FILE, 'utf8')
    .split('\n')
    .map((l) => l.trim().toLowerCase())
    .filter((l) => l && !l.startsWith('#')),
);

export const MIN_LENGTH = 8;
// bcrypt only uses the first 72 bytes; longer passwords are rejected instead of silently truncated.
export const MAX_BYTES = 72;

/**
 * @returns {string[]} the rules this password breaks: min_length, max_length, letter, number, common.
 */
export function passwordProblems(pw) {
  if (typeof pw !== 'string') return ['min_length', 'letter', 'number'];
  const problems = [];
  if (Array.from(pw).length < MIN_LENGTH) problems.push('min_length');
  if (Buffer.byteLength(pw, 'utf8') > MAX_BYTES) problems.push('max_length');
  if (!/\p{L}/u.test(pw)) problems.push('letter');
  if (!/\p{Nd}/u.test(pw)) problems.push('number');
  if (COMMON_PASSWORDS.has(pw.trim().toLowerCase())) problems.push('common');
  return problems;
}

export const hashPassword = (pw, cost) => bcrypt.hash(pw, cost);

// A real hash compared against when the account does not exist, so response time does not reveal it.
let dummyHash;
export async function verifyPassword(pw, hash, cost) {
  if (!hash) {
    dummyHash ??= await bcrypt.hash('nirapod-dummy-password-1', cost);
    await bcrypt.compare(String(pw), dummyHash);
    return false;
  }
  return bcrypt.compare(String(pw), hash);
}
