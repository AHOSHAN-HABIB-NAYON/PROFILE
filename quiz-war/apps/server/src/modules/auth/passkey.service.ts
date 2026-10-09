import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { exec, query, queryOne } from '../../db/pool';
import { randomToken } from '../../lib/crypto';
import { AppError, badRequest, unauthorized } from '../../lib/errors';
import type { SettingsService } from '../settings/settings.service';
import { AUTH_COLUMNS, type UserAuthRow } from '../users/users.repo';
import type { AuthService, ClientMeta, TokenPair } from './auth.service';

/** `android:apk-key-hash:<base64url sha256>` — the origin Android Credential Manager reports for our app. */
export function apkKeyHashOrigin(sha256Fingerprint: string) {
  const hex = sha256Fingerprint.replace(/[^0-9a-f]/gi, '');
  if (hex.length !== 64) return null;
  return `android:apk-key-hash:${Buffer.from(hex, 'hex').toString('base64url')}`;
}

/**
 * Google Password Manager reports the hash in standard base64 ("+", "/") while the docs use
 * base64url ("-", "_"), with or without padding. Accept every spelling of the same hash.
 */
export function expandAndroidOrigins(origins: string[]) {
  const out = new Set<string>();
  for (const o of origins) {
    out.add(o);
    const m = /^android:apk-key-hash:(.+)$/.exec(o);
    if (!m) continue;
    const bytes = Buffer.from(m[1]!.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (bytes.length !== 32) continue;
    const std = bytes.toString('base64');
    for (const v of [bytes.toString('base64url'), std, std.replace(/=+$/, '')]) out.add(`android:apk-key-hash:${v}`);
  }
  return [...out];
}

export interface PasskeyConfig {
  rpId: string;
  rpName: string;
  /** Web origins plus `android:apk-key-hash:<hash>` for the Android app. */
  origins: string[];
}

/**
 * WebAuthn / passkeys. Uses discoverable credentials so "Continue with Passkey" works without
 * typing an email. Challenges are stored server-side (single use, 5 minute expiry).
 */
export class PasskeyService {
  /** Last verification failure, shown in the admin Connections card to help setup. */
  lastError: { at: string; stage: 'register' | 'login'; reason: string } | null = null;

  private fail(stage: 'register' | 'login', e: unknown) {
    const reason = e instanceof Error ? e.message : String(e);
    this.lastError = { at: new Date().toISOString(), stage, reason: reason.slice(0, 300) };
    console.warn(`[passkey] ${stage} verification failed: ${reason}`);
  }

  constructor(
    private readonly cfg: PasskeyConfig,
    private readonly auth: AuthService,
    private readonly settings: SettingsService,
  ) {}

  get origins() {
    return this.cfg.origins;
  }

  private ensureEnabled() {
    if (!this.settings.app().passkeyEnabled) throw new AppError(403, 'passkey_disabled', 'Passkey login is currently disabled');
  }

  private async storeChallenge(purpose: 'register' | 'login', challenge: string, userId: number | null) {
    const id = randomToken(16).slice(0, 32);
    await exec(`DELETE FROM webauthn_challenges WHERE expires_at < UTC_TIMESTAMP()`);
    await exec(
      `INSERT INTO webauthn_challenges (id, user_id, purpose, challenge, expires_at) VALUES (?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 MINUTE))`,
      [id, userId, purpose, challenge],
    );
    return id;
  }

  private async takeChallenge(id: string, purpose: 'register' | 'login', userId: number | null) {
    const row = await queryOne<{ challenge: string; user_id: number | null; expires_at: Date }>(
      `SELECT challenge, user_id, expires_at FROM webauthn_challenges WHERE id = ? AND purpose = ?`,
      [id, purpose],
    );
    await exec(`DELETE FROM webauthn_challenges WHERE id = ?`, [id]);
    if (!row || row.expires_at.getTime() < Date.now()) throw badRequest('Passkey request expired, please try again');
    if (purpose === 'register' && Number(row.user_id) !== userId) throw badRequest('Passkey request mismatch');
    return row.challenge;
  }

  async registrationOptions(userId: number) {
    this.ensureEnabled();
    const u = await queryOne<{ uid: string; username: string | null }>(
      `SELECT u.uid, p.username FROM users u JOIN user_profiles p ON p.user_id = u.id WHERE u.id = ?`,
      [userId],
    );
    if (!u) throw unauthorized();
    const existing = await query<{ credential_id: string; transports: string | null }>(
      'SELECT credential_id, transports FROM passkeys WHERE user_id = ?',
      [userId],
    );
    const options = await generateRegistrationOptions({
      rpName: this.cfg.rpName,
      rpID: this.cfg.rpId,
      userName: u.uid,
      userDisplayName: u.username ?? u.uid,
      userID: new TextEncoder().encode(`qw-user-${userId}`),
      attestationType: 'none',
      excludeCredentials: existing.map((c) => ({
        id: c.credential_id,
        transports: (c.transports?.split(',').filter(Boolean) ?? []) as AuthenticatorTransportFuture[],
      })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    });
    const challengeId = await this.storeChallenge('register', options.challenge, userId);
    return { challengeId, options };
  }

  async verifyRegistration(userId: number, challengeId: string, response: RegistrationResponseJSON, name?: string) {
    this.ensureEnabled();
    const expectedChallenge = await this.takeChallenge(challengeId, 'register', userId);
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: this.cfg.origins,
        expectedRPID: this.cfg.rpId,
        requireUserVerification: false,
      });
    } catch (e) {
      this.fail('register', e);
      throw badRequest('Passkey could not be verified');
    }
    if (!verification.verified || !verification.registrationInfo) {
      this.fail('register', new Error('not verified'));
      throw badRequest('Passkey could not be verified');
    }
    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    await exec(
      `INSERT INTO passkeys (user_id, credential_id, public_key, counter, transports, device_type, backed_up, name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        credential.id,
        Buffer.from(credential.publicKey),
        credential.counter,
        (credential.transports ?? []).join(','),
        credentialDeviceType,
        credentialBackedUp ? 1 : 0,
        name?.slice(0, 80) ?? 'Passkey',
      ],
    );
    return { ok: true };
  }

  async loginOptions() {
    this.ensureEnabled();
    const options = await generateAuthenticationOptions({ rpID: this.cfg.rpId, userVerification: 'preferred', allowCredentials: [] });
    const challengeId = await this.storeChallenge('login', options.challenge, null);
    return { challengeId, options };
  }

  async verifyLogin(challengeId: string, response: AuthenticationResponseJSON, meta: ClientMeta): Promise<TokenPair> {
    this.ensureEnabled();
    const expectedChallenge = await this.takeChallenge(challengeId, 'login', null);
    const pk = await queryOne<{ id: number; user_id: number; credential_id: string; public_key: Buffer; counter: number; transports: string | null }>(
      'SELECT id, user_id, credential_id, public_key, counter, transports FROM passkeys WHERE credential_id = ?',
      [response.id],
    );
    if (!pk) {
      await this.auth.logLogin(null, 'passkey', false, 'unknown_credential', meta);
      throw unauthorized('This passkey is not registered');
    }
    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: this.cfg.origins,
        expectedRPID: this.cfg.rpId,
        requireUserVerification: false,
        credential: {
          id: pk.credential_id,
          publicKey: new Uint8Array(pk.public_key),
          counter: Number(pk.counter),
          transports: (pk.transports?.split(',').filter(Boolean) ?? []) as AuthenticatorTransportFuture[],
        },
      });
    } catch (e) {
      this.fail('login', e);
      verification = { verified: false } as const;
    }
    if (!verification.verified) {
      await this.auth.logLogin(pk.user_id, 'passkey', false, 'bad_assertion', meta);
      throw unauthorized('Passkey could not be verified');
    }
    await exec('UPDATE passkeys SET counter = ?, last_used_at = UTC_TIMESTAMP() WHERE id = ?', [verification.authenticationInfo.newCounter, pk.id]);
    const u = await queryOne<UserAuthRow>(`SELECT ${AUTH_COLUMNS} FROM users WHERE id = ?`, [pk.user_id]);
    if (!u) throw unauthorized();
    this.auth.assertCanLogin(u);
    await this.auth.logLogin(u.id, 'passkey', true, null, meta);
    return this.auth.createSession(u.id, meta);
  }

  async list(userId: number) {
    return query<any>(
      'SELECT id, name, device_type AS deviceType, backed_up AS backedUp, created_at AS createdAt, last_used_at AS lastUsedAt FROM passkeys WHERE user_id = ? ORDER BY id DESC',
      [userId],
    );
  }

  async remove(userId: number, id: number) {
    await exec('DELETE FROM passkeys WHERE id = ? AND user_id = ?', [id, userId]);
  }
}
