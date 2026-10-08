/**
 * Public player UID: "QW-" + 6 chars from an alphabet without look-alike characters
 * (no 0/O, 1/I/L). ~ 887M combinations; uniqueness is enforced by a DB unique index.
 */
export const UID_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const UID_REGEX = /^QW-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;

export function generateUid(randomInt: (max: number) => number): string {
  let s = 'QW-';
  for (let i = 0; i < 6; i++) s += UID_ALPHABET[randomInt(UID_ALPHABET.length)];
  return s;
}

export function normalizeUid(input: string): string | null {
  let v = input.trim().toUpperCase().replace(/\s+/g, '');
  if (!v.startsWith('QW-')) v = v.startsWith('QW') ? `QW-${v.slice(2)}` : `QW-${v}`;
  return UID_REGEX.test(v) ? v : null;
}
