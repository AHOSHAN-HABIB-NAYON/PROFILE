// Sessions: one per device. Rotating opaque refresh tokens with reuse detection (DECISIONS D-007).
import crypto from 'node:crypto';
import { ApiError } from '../errors.js';
import { addMs, DAY } from '../clock.js';
import { sha256, newRefreshToken } from './tokens.js';
import { audit } from '../audit.js';

export function createSessionService({ db, cfg, clock, tokens }) {
  const ttlMs = cfg.REFRESH_TTL_DAYS * DAY;

  const pair = (userUuid, sessionUuid, refresh) => ({
    access_token: tokens.signAccess({ userUuid, sessionUuid }),
    refresh_token: refresh,
    token_type: 'Bearer',
    expires_in: tokens.ttlS,
  });

  async function revokeWhere(q, reason, trx = db) {
    return trx('sessions')
      .where(q)
      .whereNull('revoked_at')
      .update({ revoked_at: clock.now(), revoked_reason: reason, fcm_token: null });
  }

  return {
    /**
     * Creates a session for `user` on `device`. A previous active session of the same user on the same
     * device_id is replaced, so the sessions list shows one row per device.
     * @returns {{tokens, session: {id, uuid}, isNewDevice: boolean}}
     */
    async create(user, device = {}, { isChildDevice = false, trx = db } = {}) {
      const now = clock.now();
      let isNewDevice = true;
      if (device?.device_id) {
        const seen = await trx('sessions').where({ user_id: user.id, device_id: device.device_id }).first('id');
        isNewDevice = !seen;
        await revokeWhere({ user_id: user.id, device_id: device.device_id }, 'replaced', trx);
      }
      const refresh = newRefreshToken();
      const uuid = crypto.randomUUID();
      const [id] = await trx('sessions').insert({
        user_id: user.id,
        uuid,
        refresh_token_hash: sha256(refresh),
        rotation_family: crypto.randomUUID(),
        device_id: device?.device_id ?? null,
        device_model: device?.model ?? null,
        os_version: device?.os_version ?? null,
        app_version: device?.app_version ?? null,
        is_child_device: isChildDevice,
        last_used_at: now,
        expires_at: addMs(now, ttlMs),
        created_at: now,
      });
      return { tokens: pair(user.uuid, uuid, refresh), session: { id, uuid }, isNewDevice };
    },

    /**
     * Rotates a refresh token. Replaying a rotated token revokes the whole rotation_family.
     * Child sessions are device-bound: the x-device-id header must match the bound device.
     */
    async refresh(refreshToken, deviceIdHeader) {
      const h = sha256(refreshToken);
      const now = clock.now();
      const s = await db('sessions as s')
        .join('users as u', 'u.id', 's.user_id')
        .where('s.refresh_token_hash', h)
        .first('s.*', 'u.uuid as user_uuid', 'u.status as user_status');

      if (!s) {
        const old = await db('refresh_token_history as h')
          .join('sessions as s', 's.id', 'h.session_id')
          .where('h.token_hash', h)
          .first('s.rotation_family', 's.user_id', 's.uuid');
        if (old) {
          const n = await revokeWhere({ rotation_family: old.rotation_family }, 'refresh_reuse');
          await audit(db, {
            actorId: old.user_id, action: 'auth.refresh_reuse_detected', targetType: 'session', targetId: old.uuid,
            metadata: { revoked: n }, now,
          });
        }
        throw new ApiError('AUTH_REFRESH_INVALID');
      }
      if (s.revoked_at || s.expires_at <= now) throw new ApiError('AUTH_REFRESH_INVALID');
      if (s.user_status !== 'active') {
        throw new ApiError('AUTH_REFRESH_INVALID', { details: { reason: 'account_suspended' } });
      }
      if (s.is_child_device && (!deviceIdHeader || deviceIdHeader !== s.device_id)) {
        throw new ApiError('AUTH_REFRESH_INVALID', { details: { reason: 'device_mismatch' } });
      }

      const next = newRefreshToken();
      const rotated = await db.transaction(async (trx) => {
        const n = await trx('sessions')
          .where({ id: s.id, refresh_token_hash: h })
          .whereNull('revoked_at')
          .update({ refresh_token_hash: sha256(next), last_used_at: now, expires_at: addMs(now, ttlMs) });
        if (n !== 1) return false;
        await trx('refresh_token_history').insert({ session_id: s.id, token_hash: h, retired_at: now });
        // Keep history bounded: hashes retired more than 30 days ago are dropped.
        await trx('refresh_token_history')
          .where('session_id', s.id)
          .where('retired_at', '<', addMs(now, -30 * DAY))
          .del();
        return true;
      });
      if (!rotated) {
        // Lost a race with another refresh of the same token: that is a replay too.
        await revokeWhere({ rotation_family: s.rotation_family }, 'refresh_reuse');
        throw new ApiError('AUTH_REFRESH_INVALID');
      }
      return pair(s.user_uuid, s.uuid, next);
    },

    /** Loads an active session by uuid for the auth middleware. */
    async active(sessionUuid) {
      return db('sessions as s')
        .join('users as u', 'u.id', 's.user_id')
        .where('s.uuid', sessionUuid)
        .first('s.id as session_id', 's.uuid as session_uuid', 's.revoked_at', 's.expires_at',
          's.is_child_device', 's.device_id', 'u.*');
    },

    revokeOne: (sessionId, reason) => revokeWhere({ id: sessionId }, reason),
    revokeAllForUser: (userId, reason, trx = db) => revokeWhere({ user_id: userId }, reason, trx),

    async list(userId, currentSessionId) {
      const rows = await db('sessions')
        .where({ user_id: userId })
        .whereNull('revoked_at')
        .where('expires_at', '>', clock.now())
        .orderBy('last_used_at', 'desc')
        .select('id', 'uuid', 'device_model', 'os_version', 'app_version', 'is_child_device', 'last_used_at',
          'created_at');
      return rows.map((r) => ({
        id: r.uuid,
        device_model: r.device_model,
        os_version: r.os_version,
        app_version: r.app_version,
        is_child_device: !!r.is_child_device,
        created_at: r.created_at,
        last_used_at: r.last_used_at,
        current: r.id === currentSessionId,
      }));
    },
  };
}
