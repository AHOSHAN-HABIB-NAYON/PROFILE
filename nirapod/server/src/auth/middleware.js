// Bearer-token auth. Missing/invalid token -> AUTH_REQUIRED, expired -> AUTH_TOKEN_EXPIRED,
// revoked or expired session -> AUTH_REFRESH_INVALID, suspended/deleted user -> AUTH_REFRESH_INVALID (reason).
import { ApiError } from '../errors.js';

export function requireAuth({ tokens, sessions, clock }) {
  return async (req, res, next) => {
    try {
      const m = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') || '');
      if (!m) throw new ApiError('AUTH_REQUIRED');
      const claims = tokens.verifyAccess(m[1]);
      const row = await sessions.active(claims.sid);
      if (!row || row.uuid !== claims.sub || row.revoked_at || row.expires_at <= clock.now()) {
        throw new ApiError('AUTH_REFRESH_INVALID');
      }
      if (row.status !== 'active') throw new ApiError('AUTH_REFRESH_INVALID', { details: { reason: 'account_suspended' } });
      const { session_id, session_uuid, is_child_device, device_id, revoked_at, expires_at, ...user } = row;
      req.user = user;
      req.session = { id: session_id, uuid: session_uuid, isChildDevice: !!is_child_device, deviceId: device_id };
      next();
    } catch (e) {
      next(e);
    }
  };
}
