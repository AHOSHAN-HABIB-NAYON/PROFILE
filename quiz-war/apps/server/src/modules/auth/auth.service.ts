import { DEFAULT_GAME_SETTINGS, generateUid } from '@quizwar/shared';
import type { PoolConnection } from 'mysql2/promise';
import { exec, query, queryOne, tx, type Conn } from '../../db/pool';
import { burnPasswordCheck, hashPassword, randomToken, secureRandomInt, sha256, verifyPassword } from '../../lib/crypto';
import { AppError, badRequest, conflict, unauthorized } from '../../lib/errors';
import type { SettingsService } from '../settings/settings.service';
import { AUTH_COLUMNS, type UserAuthRow } from '../users/users.repo';
import type { GoogleVerifier } from './google';
import { actionEmail, type Mailer } from './mailer';
import { signAccessToken } from './tokens';

export interface ClientMeta {
  platform: 'web' | 'android' | 'ios' | 'other';
  deviceName?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  userId: number;
}

export interface AuthConfig {
  jwtSecret: string;
  accessTtlSec: number;
  refreshTtlDays: number;
  webUrl: string;
}

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const REFRESH_RACE_GRACE_MS = 15_000;

export class AuthService {
  constructor(
    private readonly cfg: AuthConfig,
    private readonly mailer: Mailer,
    private readonly settings: SettingsService,
    private readonly google: GoogleVerifier,
    private readonly onRevokeUser: (userId: number) => void = () => undefined,
  ) {}

  /* --------------------------------- Users --------------------------------- */

  async createUser(conn: PoolConnection, data: { email?: string | null; passwordHash?: string | null; googleSub?: string | null; emailVerified?: boolean }) {
    const startRating = this.settings.game().ranked.startRating ?? DEFAULT_GAME_SETTINGS.ranked.startRating;
    for (let attempt = 0; attempt < 8; attempt++) {
      const uid = generateUid(secureRandomInt);
      try {
        const res = await exec(
          `INSERT INTO users (uid, email, password_hash, google_sub, email_verified_at) VALUES (?, ?, ?, ?, ?)`,
          [uid, data.email ?? null, data.passwordHash ?? null, data.googleSub ?? null, data.emailVerified ? new Date() : null],
          conn,
        );
        const id = res.insertId;
        await exec(`INSERT INTO user_profiles (user_id, rating, peak_rating) VALUES (?, ?, ?)`, [id, startRating, startRating], conn);
        return { id, uid };
      } catch (err: any) {
        if (err?.code === 'ER_DUP_ENTRY' && String(err.message).includes('uq_users_uid')) continue; // UID collision → retry
        if (err?.code === 'ER_DUP_ENTRY') throw conflict('An account with this email already exists', 'email_taken');
        throw err;
      }
    }
    throw new Error('Could not allocate a unique UID');
  }

  assertCanLogin(u: UserAuthRow) {
    if (u.status === 'deleted') throw unauthorized('Invalid email or password');
    if (u.status === 'banned') throw new AppError(403, 'account_banned', 'This account has been banned', { reason: u.moderation_reason });
    if (u.status === 'suspended' && u.suspended_until && u.suspended_until.getTime() > Date.now()) {
      throw new AppError(403, 'account_suspended', 'This account is temporarily suspended', {
        until: u.suspended_until.toISOString(),
        reason: u.moderation_reason,
      });
    }
  }

  /* ------------------------------ Email/password ---------------------------- */

  async register(email: string, password: string, meta: ClientMeta): Promise<TokenPair> {
    if (!this.settings.app().registrationEnabled) throw new AppError(403, 'registration_closed', 'Registration is currently closed');
    const passwordHash = await hashPassword(password);
    const user = await tx((conn) => this.createUser(conn, { email, passwordHash }));
    await this.sendVerification(user.id, email).catch(() => undefined);
    await this.logLogin(user.id, 'password', true, null, meta);
    return this.createSession(user.id, meta);
  }

  async login(email: string, password: string, meta: ClientMeta): Promise<TokenPair> {
    const u = await queryOne<UserAuthRow>(`SELECT ${AUTH_COLUMNS} FROM users WHERE email = ?`, [email]);
    if (!u || !u.password_hash) {
      await burnPasswordCheck(password);
      await this.logLogin(u?.id ?? null, 'password', false, 'unknown_account', meta);
      throw unauthorized('Invalid email or password');
    }
    if (u.locked_until && u.locked_until.getTime() > Date.now()) {
      await this.logLogin(u.id, 'password', false, 'locked', meta);
      throw new AppError(429, 'account_locked', 'Too many failed attempts. Try again in a few minutes or reset your password.');
    }
    const ok = await verifyPassword(password, u.password_hash);
    if (!ok) {
      const fails = u.failed_login_count + 1;
      await exec(
        `UPDATE users SET failed_login_count = ?, locked_until = IF(? >= ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE), locked_until) WHERE id = ?`,
        [fails >= MAX_FAILED_LOGINS ? 0 : fails, fails, MAX_FAILED_LOGINS, LOCK_MINUTES, u.id],
      );
      await this.logLogin(u.id, 'password', false, 'bad_password', meta);
      throw unauthorized('Invalid email or password');
    }
    this.assertCanLogin(u);
    await exec(`UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = ?`, [u.id]);
    await this.logLogin(u.id, 'password', true, null, meta);
    return this.createSession(u.id, meta);
  }

  async sendVerification(userId: number, email: string) {
    const token = await this.createEmailToken(userId, 'verify', 60 * 24);
    const url = `${this.cfg.webUrl}/verify-email?token=${encodeURIComponent(token)}`;
    const mail = actionEmail('Verify your email', 'Confirm your email address to secure your QUIZ WAR account.', 'Verify email', url);
    await this.mailer.send({ to: email, subject: 'Verify your QUIZ WAR email', ...mail });
  }

  async resendVerification(userId: number) {
    const u = await queryOne<{ email: string | null; email_verified_at: Date | null }>('SELECT email, email_verified_at FROM users WHERE id = ?', [userId]);
    if (!u?.email || u.email_verified_at) return;
    const recent = await queryOne<{ n: number }>(
      `SELECT COUNT(*) n FROM email_tokens WHERE user_id = ? AND type = 'verify' AND created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 MINUTE)`,
      [userId],
    );
    if ((recent?.n ?? 0) >= 3) throw new AppError(429, 'rate_limited', 'Please wait a few minutes before requesting another email');
    await this.sendVerification(userId, u.email);
  }

  async verifyEmail(token: string) {
    const row = await this.consumeEmailToken(token, 'verify');
    await exec(`UPDATE users SET email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP()) WHERE id = ?`, [row.user_id]);
    return row.user_id;
  }

  /** Always resolves (never reveals whether an email is registered). */
  async forgotPassword(email: string) {
    const u = await queryOne<{ id: number; status: string }>(`SELECT id, status FROM users WHERE email = ?`, [email]);
    if (!u || u.status === 'deleted' || u.status === 'banned') return;
    const recent = await queryOne<{ n: number }>(
      `SELECT COUNT(*) n FROM email_tokens WHERE user_id = ? AND type = 'reset' AND created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE)`,
      [u.id],
    );
    if ((recent?.n ?? 0) >= 3) return;
    const token = await this.createEmailToken(u.id, 'reset', 30);
    const url = `${this.cfg.webUrl}/reset-password?token=${encodeURIComponent(token)}`;
    const mail = actionEmail('Reset your password', 'Use the button below to choose a new password. The link expires in 30 minutes.', 'Reset password', url);
    await this.mailer.send({ to: email, subject: 'Reset your QUIZ WAR password', ...mail });
  }

  async resetPassword(token: string, newPassword: string) {
    const row = await this.consumeEmailToken(token, 'reset');
    const hash = await hashPassword(newPassword);
    await exec(
      `UPDATE users SET password_hash = ?, failed_login_count = 0, locked_until = NULL, email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP()) WHERE id = ?`,
      [hash, row.user_id],
    );
    await this.revokeAllSessions(row.user_id, 'password_reset');
  }

  async changePassword(userId: number, current: string | null, next: string, keepSessionId: number) {
    const u = await queryOne<{ password_hash: string | null }>('SELECT password_hash FROM users WHERE id = ?', [userId]);
    if (u?.password_hash && !(current && (await verifyPassword(current, u.password_hash)))) throw badRequest('Current password is incorrect');
    await exec('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(next), userId]);
    await exec(`UPDATE user_sessions SET revoked_at = UTC_TIMESTAMP(), revoke_reason = 'password_change' WHERE user_id = ? AND id <> ? AND revoked_at IS NULL`, [userId, keepSessionId]);
  }

  private async createEmailToken(userId: number, type: 'verify' | 'reset', ttlMinutes: number) {
    const token = randomToken(32);
    await exec(
      `INSERT INTO email_tokens (user_id, type, token_hash, expires_at) VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE))`,
      [userId, type, sha256(token), ttlMinutes],
    );
    return token;
  }

  private async consumeEmailToken(token: string, type: 'verify' | 'reset') {
    return tx(async (conn) => {
      const row = await queryOne<{ id: number; user_id: number; expires_at: Date; used_at: Date | null }>(
        `SELECT id, user_id, expires_at, used_at FROM email_tokens WHERE token_hash = ? AND type = ? FOR UPDATE`,
        [sha256(token), type],
        conn,
      );
      if (!row || row.used_at || row.expires_at.getTime() < Date.now()) throw badRequest('This link is invalid or has expired');
      await exec('UPDATE email_tokens SET used_at = UTC_TIMESTAMP() WHERE id = ?', [row.id], conn);
      return row;
    });
  }

  /* ---------------------------------- Google -------------------------------- */

  async loginWithGoogle(idToken: string, meta: ClientMeta): Promise<TokenPair & { created: boolean }> {
    if (!this.settings.app().googleLoginEnabled) throw new AppError(403, 'google_disabled', 'Google login is currently disabled');
    const g = await this.google.verify(idToken);
    let u = await queryOne<UserAuthRow>(`SELECT ${AUTH_COLUMNS} FROM users WHERE google_sub = ?`, [g.sub]);
    let created = false;
    if (!u && g.email && g.emailVerified) {
      // Link to an existing email account only when Google asserts the email is verified.
      u = await queryOne<UserAuthRow>(`SELECT ${AUTH_COLUMNS} FROM users WHERE email = ?`, [g.email]);
      if (u) {
        if (u.status === 'deleted') u = null;
        else await exec(`UPDATE users SET google_sub = ?, email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP()) WHERE id = ?`, [g.sub, u.id]);
      }
    }
    if (!u) {
      if (!this.settings.app().registrationEnabled) throw new AppError(403, 'registration_closed', 'Registration is currently closed');
      const user = await tx((conn) =>
        this.createUser(conn, { email: g.emailVerified ? g.email : null, googleSub: g.sub, emailVerified: g.emailVerified }),
      );
      created = true;
      u = (await queryOne<UserAuthRow>(`SELECT ${AUTH_COLUMNS} FROM users WHERE id = ?`, [user.id]))!;
    }
    this.assertCanLogin(u);
    await this.logLogin(u.id, 'google', true, null, meta);
    return { ...(await this.createSession(u.id, meta)), created };
  }

  /* --------------------------------- Sessions ------------------------------- */

  async createSession(userId: number, meta: ClientMeta, conn?: Conn): Promise<TokenPair> {
    const refreshToken = randomToken(48);
    const res = await exec(
      `INSERT INTO user_sessions (user_id, refresh_hash, platform, device_name, ip, user_agent, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY))`,
      [userId, sha256(refreshToken), meta.platform, meta.deviceName?.slice(0, 120) ?? null, meta.ip ?? null, meta.userAgent?.slice(0, 300) ?? null, this.cfg.refreshTtlDays],
      conn,
    );
    await exec(`UPDATE users SET last_login_at = UTC_TIMESTAMP() WHERE id = ?`, [userId], conn);
    const accessToken = await signAccessToken(this.cfg.jwtSecret, { sub: userId, sid: res.insertId }, this.cfg.accessTtlSec);
    return { accessToken, refreshToken, expiresIn: this.cfg.accessTtlSec, userId };
  }

  /** Refresh-token rotation with reuse detection. */
  async refresh(refreshToken: string, meta: ClientMeta): Promise<TokenPair> {
    const hash = sha256(refreshToken);
    const session = await queryOne<{ id: number; user_id: number; expires_at: Date; revoked_at: Date | null }>(
      `SELECT id, user_id, expires_at, revoked_at FROM user_sessions WHERE refresh_hash = ?`,
      [hash],
    );
    if (!session) {
      const reused = await queryOne<{ id: number; user_id: number; last_used_at: Date; revoked_at: Date | null }>(
        `SELECT id, user_id, last_used_at, revoked_at FROM user_sessions WHERE previous_hash = ?`,
        [hash],
      );
      if (reused && !reused.revoked_at) {
        if (Date.now() - reused.last_used_at.getTime() < REFRESH_RACE_GRACE_MS) {
          // Two tabs refreshed at the same time; the other one already rotated the cookie.
          throw new AppError(409, 'refresh_race', 'Session refreshed elsewhere, retry');
        }
        await exec(`UPDATE user_sessions SET revoked_at = UTC_TIMESTAMP(), revoke_reason = 'token_reuse' WHERE id = ?`, [reused.id]);
        await this.logLogin(reused.user_id, 'refresh', false, 'token_reuse', meta);
      }
      throw unauthorized();
    }
    if (session.revoked_at || session.expires_at.getTime() < Date.now()) throw unauthorized();
    const u = await queryOne<UserAuthRow>(`SELECT ${AUTH_COLUMNS} FROM users WHERE id = ?`, [session.user_id]);
    if (!u) throw unauthorized();
    this.assertCanLogin(u);
    const next = randomToken(48);
    const upd = await exec(
      `UPDATE user_sessions SET previous_hash = refresh_hash, refresh_hash = ?, last_used_at = UTC_TIMESTAMP(), ip = ?, user_agent = ?
       WHERE id = ? AND refresh_hash = ? AND revoked_at IS NULL`,
      [sha256(next), meta.ip ?? null, meta.userAgent?.slice(0, 300) ?? null, session.id, hash],
    );
    if (upd.affectedRows !== 1) throw new AppError(409, 'refresh_race', 'Session refreshed elsewhere, retry');
    const accessToken = await signAccessToken(this.cfg.jwtSecret, { sub: u.id, sid: session.id }, this.cfg.accessTtlSec);
    return { accessToken, refreshToken: next, expiresIn: this.cfg.accessTtlSec, userId: u.id };
  }

  async isSessionActive(sessionId: number, userId: number) {
    const s = await queryOne<{ id: number }>(
      `SELECT id FROM user_sessions WHERE id = ? AND user_id = ? AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP()`,
      [sessionId, userId],
    );
    return !!s;
  }

  async logout(sessionId: number) {
    await exec(`UPDATE user_sessions SET revoked_at = UTC_TIMESTAMP(), revoke_reason = 'logout' WHERE id = ? AND revoked_at IS NULL`, [sessionId]);
  }

  async logoutByRefresh(refreshToken: string) {
    await exec(`UPDATE user_sessions SET revoked_at = UTC_TIMESTAMP(), revoke_reason = 'logout' WHERE refresh_hash = ? AND revoked_at IS NULL`, [sha256(refreshToken)]);
  }

  async revokeAllSessions(userId: number, reason: string) {
    await exec(`UPDATE user_sessions SET revoked_at = UTC_TIMESTAMP(), revoke_reason = ? WHERE user_id = ? AND revoked_at IS NULL`, [reason, userId]);
    this.onRevokeUser(userId);
  }

  async revokeSession(userId: number, sessionId: number) {
    const r = await exec(`UPDATE user_sessions SET revoked_at = UTC_TIMESTAMP(), revoke_reason = 'revoked' WHERE id = ? AND user_id = ? AND revoked_at IS NULL`, [sessionId, userId]);
    return r.affectedRows > 0;
  }

  async listSessions(userId: number, currentSessionId: number) {
    const rows = await query<any>(
      `SELECT id, platform, device_name, ip, user_agent, created_at, last_used_at FROM user_sessions
       WHERE user_id = ? AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP() ORDER BY last_used_at DESC LIMIT 50`,
      [userId],
    );
    return rows.map((r) => ({
      id: r.id,
      platform: r.platform,
      deviceName: r.device_name,
      ip: r.ip,
      userAgent: r.user_agent,
      createdAt: r.created_at,
      lastUsedAt: r.last_used_at,
      current: r.id === currentSessionId,
    }));
  }

  async loginHistory(userId: number, limit = 30) {
    return query<any>(
      `SELECT method, success, reason, ip, user_agent AS userAgent, created_at AS createdAt FROM login_events WHERE user_id = ? ORDER BY id DESC LIMIT ?`,
      [userId, limit],
    );
  }

  async logLogin(userId: number | null, method: 'password' | 'google' | 'passkey' | 'refresh', success: boolean, reason: string | null, meta: ClientMeta) {
    await exec(`INSERT INTO login_events (user_id, method, success, reason, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)`, [
      userId,
      method,
      success ? 1 : 0,
      reason,
      meta.ip ?? null,
      meta.userAgent?.slice(0, 300) ?? null,
    ]);
  }

  /* ------------------------------ Account deletion -------------------------- */

  /**
   * Deletes the account: personal data is erased/anonymised, sessions/passkeys/devices are
   * removed. Match history rows stay (anonymised) so opponents' history remains consistent.
   */
  async verifyDeletion(userId: number, password: string | null, confirmation: string) {
    if (confirmation !== 'DELETE') throw badRequest('Type DELETE to confirm');
    const u = await queryOne<{ password_hash: string | null }>('SELECT password_hash FROM users WHERE id = ?', [userId]);
    if (u?.password_hash && !(password && (await verifyPassword(password, u.password_hash)))) throw badRequest('Password is incorrect');
  }

  async deleteAccount(userId: number, password: string | null, confirmation: string) {
    await this.verifyDeletion(userId, password, confirmation);
    await tx(async (conn) => {
      await exec(
        `UPDATE users SET email = NULL, password_hash = NULL, google_sub = NULL, status = 'deleted', deleted_at = UTC_TIMESTAMP() WHERE id = ?`,
        [userId],
        conn,
      );
      await exec(
        `UPDATE user_profiles SET username = NULL, bio = NULL, avatar_url = NULL, avatar_thumb_url = NULL, available_for_battle = 0 WHERE user_id = ?`,
        [userId],
        conn,
      );
      for (const sql of [
        'DELETE FROM passkeys WHERE user_id = ?',
        'DELETE FROM device_tokens WHERE user_id = ?',
        'DELETE FROM friends WHERE user_id = ? OR friend_id = ?',
        'DELETE FROM friend_requests WHERE from_user_id = ? OR to_user_id = ?',
        'DELETE FROM squad_members WHERE user_id = ?',
        'DELETE FROM notifications WHERE user_id = ?',
        'DELETE FROM email_tokens WHERE user_id = ?',
        'DELETE FROM leaderboards WHERE user_id = ?',
      ]) {
        const n = (sql.match(/\?/g) ?? []).length;
        await exec(sql, Array(n).fill(userId), conn);
      }
      await exec(`UPDATE user_sessions SET revoked_at = UTC_TIMESTAMP(), revoke_reason = 'account_deleted' WHERE user_id = ? AND revoked_at IS NULL`, [userId], conn);
    });
    this.onRevokeUser(userId);
  }
}
