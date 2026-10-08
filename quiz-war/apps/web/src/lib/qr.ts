import { normalizeUid } from '@quizwar/shared';
import { PUBLIC_WEB_URL } from './platform';

/** The QR only contains a public profile link — no email or other private data. */
export const profileLink = (uid: string) => `${PUBLIC_WEB_URL.replace(/\/$/, '')}/u/${uid}`;

/** Accepts a scanned profile URL, a deep link or a raw UID. */
export function uidFromScan(text: string): string | null {
  const t = text.trim();
  const m = t.match(/\/u\/(QW-[A-Z0-9]{6})/i);
  return normalizeUid(m ? m[1] : t);
}
