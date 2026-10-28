// Family codes (child join codes and adult invite codes): 6 characters, uppercase letters and digits
// without ambiguous characters (no I, L, O, 0, 1).
import crypto from 'node:crypto';

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const FAMILY_CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{6}$`);

export function newFamilyCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
  return s;
}

/** Uppercases and removes spaces/dashes the user may type or paste. */
export const normalizeFamilyCode = (s) => String(s ?? '').toUpperCase().replace(/[\s-]/g, '');
