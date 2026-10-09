import { describe, expect, it } from 'vitest';
import { apkKeyHashOrigin } from '../src/modules/auth/passkey.service';

describe('apkKeyHashOrigin', () => {
  it('turns a SHA-256 certificate fingerprint into the Android passkey origin', () => {
    expect(apkKeyHashOrigin('90:3A:BC:AA:84:43:DC:01:9F:D0:51:87:42:8C:3F:A5:3C:26:D5:41:93:8A:05:0E:1B:5C:56:18:9C:3E:E5:68')).toBe(
      'android:apk-key-hash:kDq8qoRD3AGf0FGHQow_pTwm1UGTigUOG1xWGJw-5Wg',
    );
  });
  it('ignores malformed fingerprints', () => {
    expect(apkKeyHashOrigin('nope')).toBeNull();
  });
});
