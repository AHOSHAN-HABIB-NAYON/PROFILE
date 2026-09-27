import { describe, expect, it, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import {
  base32Decode,
  base32Encode,
  hotp,
  verifyTotp,
  currentStep,
  generateSecret,
} from '../src/modules/auth/totp';
import { encrypt, decrypt, setEncryptionKey, sha256 } from '../src/infrastructure/crypto';
import { cidrMatch } from '../src/modules/admin/admin.middleware';
import { hashPassword, verifyPassword, passwordSchema } from '../src/modules/auth/passwords';

describe('TOTP (RFC 6238)', () => {
  it('matches RFC 4226 HOTP test vectors', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    expect(['755224', '287082', '359152', '969429', '338314'].map((_, i) => hotp(secret, i))).toEqual([
      '755224',
      '287082',
      '359152',
      '969429',
      '338314',
    ]);
  });
  it('base32 round trip', () => {
    const b = crypto.randomBytes(20);
    expect(base32Decode(base32Encode(b)).equals(b)).toBe(true);
  });
  it('verifies within window and rejects replays', () => {
    const s = generateSecret();
    const now = Date.now();
    const code = hotp(s, currentStep(now));
    const step = verifyTotp(s, code, 0, now);
    expect(step).toBe(currentStep(now));
    expect(verifyTotp(s, code, step!, now)).toBeNull(); // replay
    expect(verifyTotp(s, hotp(s, currentStep(now) - 5), 0, now)).toBeNull(); // too old
    expect(verifyTotp(s, 'abcdef', 0, now)).toBeNull();
  });
});

describe('encryption at rest', () => {
  beforeAll(() => setEncryptionKey(crypto.randomBytes(32).toString('base64')));
  it('round trips and authenticates', () => {
    const c = encrypt('secret value', 'ctx');
    expect(c).not.toContain('secret');
    expect(decrypt(c, 'ctx')).toBe('secret value');
    expect(() => decrypt(c, 'other-ctx')).toThrow();
    const parts = c.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => decrypt(parts.join('.'), 'ctx')).toThrow();
  });
  it('sha256', () =>
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'));
});

describe('passwords', () => {
  it('argon2id hash + verify', async () => {
    const h = await hashPassword('Correct-Horse-9');
    expect(h.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(h, 'Correct-Horse-9')).toBe(true);
    expect(await verifyPassword(h, 'wrong')).toBe(false);
    expect(await verifyPassword(null, 'x')).toBe(false);
  });
  it('policy', () => {
    expect(passwordSchema.safeParse('short').success).toBe(false);
    expect(passwordSchema.safeParse('alllowercase123').success).toBe(false);
    expect(passwordSchema.safeParse('GoodPassw0rd').success).toBe(true);
  });
});

describe('admin IP allowlist', () => {
  it('matches CIDR ranges', () => {
    expect(cidrMatch('10.1.2.3', '10.0.0.0/8')).toBe(true);
    expect(cidrMatch('11.1.2.3', '10.0.0.0/8')).toBe(false);
    expect(cidrMatch('192.168.1.7', '192.168.1.0/24')).toBe(true);
    expect(cidrMatch('::1', '10.0.0.0/8')).toBe(false);
  });
});
