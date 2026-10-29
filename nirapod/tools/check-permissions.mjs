// Fails if an Android manifest requests anything outside the allowed list in the spec (PERMISSIONS).
// Usage: node check-permissions.mjs [path/to/AndroidManifest.xml ...]
// CI runs it on the source manifest AND the merged release manifest (plugins can add permissions).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';

export const ALLOWED = new Set([
  'android.permission.INTERNET',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_LOCATION',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.VIBRATE',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  // Not user-facing permissions; added by Google Play Billing / FCM libraries respectively and
  // listed in DECISIONS.md D-008. Anything else fails the build.
  'com.android.vending.BILLING',
  'com.google.android.c2dm.permission.RECEIVE',
  // Normal (install-time, never shown) permission that the FCM SDK needs to finish handling a push while the
  // phone sleeps; the spec mandates FCM for SOS. DECISIONS.md D-015. The app itself never takes wake locks.
  'android.permission.WAKE_LOCK',
]);
// Note: com.google.android.gms.permission.AD_ID is NOT allowed (no ad/tracking); the manifest removes it.
const ALLOWED_SUFFIX = ['.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION']; // app-private signature permission from AndroidX

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!files.length) files.push(path.join(ROOT, 'app/android/app/src/main/AndroidManifest.xml'));
let bad = 0;
for (const f of files) {
  const xml = fs.readFileSync(f, 'utf8');
  const removed = new Set([...xml.matchAll(/<uses-permission[^>]*android:name="([^"]+)"[^>]*tools:node="remove"/g)].map((m) => m[1]));
  const used = [...xml.matchAll(/<uses-permission(?:-sdk-\d+)?\s[^>]*android:name="([^"]+)"/g)].map((m) => m[1]).filter((p) => !removed.has(p));
  for (const p of used) {
    if (!ALLOWED.has(p) && !ALLOWED_SUFFIX.some((s) => p.endsWith(s))) { console.error(`${path.relative(ROOT, f)}: forbidden permission ${p}`); bad++; }
  }
  console.log(`${path.relative(ROOT, f)}: ${used.length} permission(s) checked`);
}
if (bad) process.exit(1);
