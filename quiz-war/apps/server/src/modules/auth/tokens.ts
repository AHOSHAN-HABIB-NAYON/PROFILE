import { jwtVerify, SignJWT } from 'jose';
import { unauthorized } from '../../lib/errors';

export interface AccessClaims {
  sub: number;
  sid: number;
}

const enc = (s: string) => new TextEncoder().encode(s);

export async function signAccessToken(secret: string, claims: AccessClaims, ttlSec: number, audience = 'quizwar'): Promise<string> {
  return new SignJWT({ sid: claims.sid })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(claims.sub))
    .setIssuedAt()
    .setIssuer('quizwar')
    .setAudience(audience)
    .setExpirationTime(`${ttlSec}s`)
    .sign(enc(secret));
}

export async function verifyAccessToken(secret: string, token: string, audience = 'quizwar'): Promise<AccessClaims> {
  try {
    const { payload } = await jwtVerify(token, enc(secret), { issuer: 'quizwar', audience, algorithms: ['HS256'] });
    const sub = Number(payload.sub);
    const sid = Number(payload.sid);
    if (!Number.isInteger(sub) || !Number.isInteger(sid)) throw new Error('bad claims');
    return { sub, sid };
  } catch {
    throw unauthorized('Your session has expired');
  }
}
