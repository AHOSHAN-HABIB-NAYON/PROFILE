// 6-digit email codes (verify_email, reset_password).
// Rules: stored as an HMAC (never in clear), 10-minute expiry, only the newest code works,
// 5 wrong attempts -> 15-minute lock, resend 30 s after the last send and at most 5 sends per hour.
import crypto from 'node:crypto';
import { ApiError } from '../errors.js';
import { addMs, secondsUntil, MINUTE, HOUR } from '../clock.js';

export const CODE_TTL_MS = 10 * MINUTE;
export const MAX_ATTEMPTS = 5;
export const LOCK_MS = 15 * MINUTE;
export const RESEND_GAP_MS = 30_000;
export const MAX_SENDS_PER_HOUR = 5;

export const newSixDigitCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

/**
 * Throttle keyed by a hash of purpose + email, applied BEFORE looking up the account, so the answer is the same
 * whether or not the email exists (no account enumeration). Kept in process memory with the injectable clock.
 * (Single-instance deployment; a multi-instance VPS setup needs a shared store, see docs/handoffs.)
 */
export function createSendThrottle({ clock, key }) {
  const sends = new Map(); // hash -> [Date...]
  const id = (purpose, email) => crypto.createHmac('sha256', key).update(`${purpose}:${email}`).digest('hex');
  function recent(h, now) {
    const list = (sends.get(h) || []).filter((t) => now - t < HOUR);
    sends.set(h, list);
    return list;
  }
  return {
    /** @returns {number|null} seconds to wait, or null when a send is allowed now */
    retryAfter(purpose, email) {
      const now = clock.now();
      const list = recent(id(purpose, email), now);
      if (list.length >= MAX_SENDS_PER_HOUR) return secondsUntil(now, addMs(list[0], HOUR));
      const last = list[list.length - 1];
      if (last && now - last < RESEND_GAP_MS) return secondsUntil(now, addMs(last, RESEND_GAP_MS));
      return null;
    },
    record(purpose, email) {
      const now = clock.now();
      recent(id(purpose, email), now).push(now);
    },
    clear: () => sends.clear(),
  };
}

export function createCodeService({ db, clock, key }) {
  const hash = (userId, purpose, code) =>
    crypto.createHmac('sha256', key).update(`${userId}:${purpose}:${code}`).digest('hex');

  async function activeLock(userId, purpose, now) {
    return db('email_codes')
      .where({ user_id: userId, purpose })
      .where('locked_until', '>', now)
      .orderBy('locked_until', 'desc')
      .first('locked_until');
  }

  return {
    /**
     * Creates a new code if the DB-side limits allow it (resend gap, 5 per hour, not locked).
     * @returns {{code: string}|{blocked: 'locked'|'rate_limited', retry_after_s: number}}
     */
    async issue(userId, purpose) {
      const now = clock.now();
      const lock = await activeLock(userId, purpose, now);
      if (lock) return { blocked: 'locked', retry_after_s: secondsUntil(now, lock.locked_until) };
      const lastHour = await db('email_codes')
        .where({ user_id: userId, purpose })
        .where('created_at', '>', addMs(now, -HOUR))
        .orderBy('created_at', 'asc')
        .select('created_at');
      if (lastHour.length >= MAX_SENDS_PER_HOUR) {
        return { blocked: 'rate_limited', retry_after_s: secondsUntil(now, addMs(lastHour[0].created_at, HOUR)) };
      }
      const last = lastHour[lastHour.length - 1];
      if (last && now - last.created_at < RESEND_GAP_MS) {
        return { blocked: 'rate_limited', retry_after_s: secondsUntil(now, addMs(last.created_at, RESEND_GAP_MS)) };
      }
      // Only the newest code works.
      await db('email_codes').where({ user_id: userId, purpose }).whereNull('consumed_at').update({ consumed_at: now });
      const code = newSixDigitCode();
      await db('email_codes').insert({
        user_id: userId, purpose, code_hash: hash(userId, purpose, code), attempts: 0,
        expires_at: addMs(now, CODE_TTL_MS), created_at: now,
      });
      return { code };
    },

    /**
     * Checks a code. Throws AUTH_LOCKED (details.retry_after_s), CODE_EXPIRED or CODE_INVALID
     * (details.attempts_left). On success the code is consumed.
     */
    async verify(userId, purpose, code) {
      const now = clock.now();
      const lock = await activeLock(userId, purpose, now);
      if (lock) {
        throw new ApiError('AUTH_LOCKED', {
          details: { retry_after_s: secondsUntil(now, lock.locked_until), locked_until: lock.locked_until },
        });
      }
      const row = await db('email_codes')
        .where({ user_id: userId, purpose })
        .whereNull('consumed_at')
        .orderBy('id', 'desc')
        .first();
      if (!row) throw new ApiError('CODE_INVALID');
      if (row.expires_at <= now) throw new ApiError('CODE_EXPIRED');

      const ok = crypto.timingSafeEqual(Buffer.from(row.code_hash, 'hex'), Buffer.from(hash(userId, purpose, code), 'hex'));
      if (!ok) {
        const attempts = row.attempts + 1;
        if (attempts >= MAX_ATTEMPTS) {
          const until = addMs(now, LOCK_MS);
          await db('email_codes').where({ id: row.id }).update({ attempts, locked_until: until, consumed_at: now });
          throw new ApiError('AUTH_LOCKED', { details: { retry_after_s: secondsUntil(now, until), locked_until: until } });
        }
        await db('email_codes').where({ id: row.id }).update({ attempts });
        throw new ApiError('CODE_INVALID', { details: { attempts_left: MAX_ATTEMPTS - attempts } });
      }
      await db('email_codes').where({ id: row.id }).update({ consumed_at: now });
    },
  };
}
