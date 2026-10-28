// Access tokens: HS256 JWT, 15 minutes, claims sub = user uuid, sid = session uuid.
// Refresh tokens: opaque 32 random bytes (base64url); only their sha256 is stored.
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { ApiError } from '../errors.js';

export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
export const newRefreshToken = () => crypto.randomBytes(32).toString('base64url');

const ISSUER = 'nirapod';
const AUDIENCE = 'nirapod-app';

export function createTokenService({ secret, ttlS, clock }) {
  const nowS = () => Math.floor(clock.now().getTime() / 1000);
  return {
    ttlS,
    signAccess({ userUuid, sessionUuid }) {
      const iat = nowS();
      return jwt.sign({ sid: sessionUuid, iat, exp: iat + ttlS }, secret, {
        algorithm: 'HS256', subject: userUuid, issuer: ISSUER, audience: AUDIENCE,
      });
    },
    /** @returns {{sub: string, sid: string}} or throws AUTH_TOKEN_EXPIRED / AUTH_REQUIRED */
    verifyAccess(token) {
      try {
        const p = jwt.verify(token, secret, {
          algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE, clockTimestamp: nowS(),
        });
        if (typeof p.sub !== 'string' || typeof p.sid !== 'string') throw new Error('claims');
        return p;
      } catch (e) {
        if (e?.name === 'TokenExpiredError') throw new ApiError('AUTH_TOKEN_EXPIRED');
        throw new ApiError('AUTH_REQUIRED');
      }
    },
  };
}
