import type { Request } from 'express';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  type AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
import { UAParser } from 'ua-parser-js';
import { exec, one, query } from '../../infrastructure/db';
import { redis } from '../../infrastructure/redis';
import { randomToken, sha256 } from '../../infrastructure/crypto';
import { loadEnv } from '../../config/env';
import { getSetting } from '../settings/settings.service';
import type { PrincipalType } from './principal';
import { userAgent } from './sessions';

/**
 * WebAuthn / passkeys via SimpleWebAuthn. Challenges are single-use, random, stored server-side
 * (Redis, 5 min) and bound to a challenge id; all attestation/assertion verification happens here.
 */
function rp() {
  const u = new URL(loadEnv().APP_URL);
  return { rpID: u.hostname, origin: u.origin, rpName: getSetting('site.name') };
}

async function storeChallenge(data: object) {
  const id = randomToken(18);
  await redis().set(`wa:${sha256(id)}`, JSON.stringify(data), 'EX', 300);
  return id;
}

async function takeChallenge<T>(id: string): Promise<T | null> {
  const key = `wa:${sha256(id)}`;
  const v = await redis().getdel(key);
  return v ? (JSON.parse(v) as T) : null;
}

export async function registrationOptions(
  pt: PrincipalType,
  pid: number,
  userName: string,
  displayName: string,
) {
  const { rpID, rpName } = rp();
  const existing = await query<{ credential_id: string; transports: string | null }>(
    'SELECT credential_id, transports FROM passkeys WHERE principal_type = ? AND principal_id = ?',
    [pt, pid],
  );
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName,
    userDisplayName: displayName,
    userID: new TextEncoder().encode(`${pt}:${pid}`),
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({
      id: c.credential_id,
      transports: c.transports ? (c.transports.split(',') as AuthenticatorTransportFuture[]) : undefined,
    })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  });
  const challengeId = await storeChallenge({ kind: 'reg', pt, pid, challenge: options.challenge });
  return { options, challengeId };
}

export async function verifyRegistration(
  pt: PrincipalType,
  pid: number,
  challengeId: string,
  response: RegistrationResponseJSON,
  name: string,
  req: Request,
) {
  const ch = await takeChallenge<{ kind: string; pt: string; pid: number; challenge: string }>(challengeId);
  if (!ch || ch.kind !== 'reg' || ch.pt !== pt || ch.pid !== pid)
    throw new Error('Passkey challenge expired. Try again.');
  const { rpID, origin } = rp();
  const v = await verifyRegistrationResponse({
    response,
    expectedChallenge: ch.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
  });
  if (!v.verified || !v.registrationInfo) throw new Error('Passkey could not be verified');
  const { credential, credentialDeviceType, credentialBackedUp, aaguid } = v.registrationInfo;
  const ua = new UAParser(userAgent(req)).getResult();
  const info = [ua.browser.name, ua.os.name, ua.device.model].filter(Boolean).join(' · ') || null;
  const r = await exec(
    `INSERT INTO passkeys (principal_type, principal_id, credential_id, public_key, counter, transports, device_type, backed_up, aaguid, name, device_info)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [
      pt,
      pid,
      credential.id,
      Buffer.from(credential.publicKey),
      credential.counter,
      credential.transports?.join(',') ?? null,
      credentialDeviceType,
      credentialBackedUp ? 1 : 0,
      aaguid,
      name.slice(0, 100),
      info,
    ],
  );
  return { id: r.insertId };
}

/** Authentication options. With pt/pid (step-up/2FA) restrict to that principal's credentials. */
export async function authenticationOptions(scope: { pt: PrincipalType; pid?: number }) {
  const { rpID } = rp();
  const allow = scope.pid
    ? await query<{ credential_id: string; transports: string | null }>(
        'SELECT credential_id, transports FROM passkeys WHERE principal_type = ? AND principal_id = ?',
        [scope.pt, scope.pid],
      )
    : [];
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
    allowCredentials: allow.map((c) => ({
      id: c.credential_id,
      transports: c.transports ? (c.transports.split(',') as AuthenticatorTransportFuture[]) : undefined,
    })),
  });
  const challengeId = await storeChallenge({
    kind: 'auth',
    pt: scope.pt,
    pid: scope.pid ?? null,
    challenge: options.challenge,
  });
  return { options, challengeId };
}

export async function verifyAuthentication(
  challengeId: string,
  response: AuthenticationResponseJSON,
): Promise<{ pt: PrincipalType; pid: number; passkeyId: number; userVerified: boolean }> {
  const ch = await takeChallenge<{ kind: string; pt: PrincipalType; pid: number | null; challenge: string }>(
    challengeId,
  );
  if (!ch || ch.kind !== 'auth') throw new Error('Passkey challenge expired. Try again.');
  const cred = await one<{
    id: number;
    principal_type: PrincipalType;
    principal_id: number;
    credential_id: string;
    public_key: Buffer;
    counter: string;
    transports: string | null;
  }>(
    'SELECT id, principal_type, principal_id, credential_id, public_key, counter, transports FROM passkeys WHERE credential_id = ?',
    [response.id],
  );
  if (!cred || cred.principal_type !== ch.pt || (ch.pid && Number(cred.principal_id) !== ch.pid)) {
    throw new Error('Unknown passkey');
  }
  const { rpID, origin } = rp();
  const v = await verifyAuthenticationResponse({
    response,
    expectedChallenge: ch.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
    credential: {
      id: cred.credential_id,
      publicKey: new Uint8Array(cred.public_key),
      counter: Number(cred.counter),
      transports: cred.transports
        ? (cred.transports.split(',') as AuthenticatorTransportFuture[])
        : undefined,
    },
  });
  if (!v.verified) throw new Error('Passkey verification failed');
  await exec('UPDATE passkeys SET counter = ?, last_used_at = NOW(3) WHERE id = ?', [
    v.authenticationInfo.newCounter,
    cred.id,
  ]);
  return {
    pt: cred.principal_type,
    pid: Number(cred.principal_id),
    passkeyId: Number(cred.id),
    userVerified: v.authenticationInfo.userVerified,
  };
}
