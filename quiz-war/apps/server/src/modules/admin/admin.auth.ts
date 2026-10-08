import { exec, query, queryOne } from '../../db/pool';
import { burnPasswordCheck, randomToken, sha256, verifyPassword } from '../../lib/crypto';
import { AppError, unauthorized } from '../../lib/errors';
import { signAccessToken, verifyAccessToken } from '../auth/tokens';

export interface AdminPrincipal {
  id: number;
  email: string;
  name: string;
  roleKey: string;
  roleName: string;
  permissions: Set<string>;
}

const AUD = 'quizwar-admin';

/** Admin authentication is completely separate from player accounts (own table, secret, cookie). */
export class AdminAuthService {
  private permCache = new Map<number, { at: number; p: AdminPrincipal }>();

  constructor(
    private readonly secret: string,
    private readonly sessionTtlHours: number,
  ) {}

  async login(email: string, password: string, meta: { ip?: string | null; userAgent?: string | null }) {
    const a = await queryOne<any>('SELECT id, password_hash, is_active, failed_login_count, locked_until FROM admin_users WHERE email = ?', [email.toLowerCase()]);
    if (!a) {
      await burnPasswordCheck(password);
      throw unauthorized('Invalid email or password');
    }
    if (a.locked_until && new Date(a.locked_until).getTime() > Date.now()) throw new AppError(429, 'account_locked', 'Too many attempts. Try again later.');
    if (!(await verifyPassword(password, a.password_hash))) {
      const fails = a.failed_login_count + 1;
      await exec(`UPDATE admin_users SET failed_login_count = ?, locked_until = IF(? >= 5, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 MINUTE), locked_until) WHERE id = ?`, [
        fails >= 5 ? 0 : fails,
        fails,
        a.id,
      ]);
      await exec(`INSERT INTO admin_logs (admin_id, action, summary, ip, user_agent) VALUES (?, 'auth.login_failed', 'Failed admin login', ?, ?)`, [a.id, meta.ip ?? null, meta.userAgent?.slice(0, 300) ?? null]);
      throw unauthorized('Invalid email or password');
    }
    if (!a.is_active) throw new AppError(403, 'admin_disabled', 'This admin account is disabled');
    await exec('UPDATE admin_users SET failed_login_count = 0, locked_until = NULL, last_login_at = UTC_TIMESTAMP() WHERE id = ?', [a.id]);
    await exec(`INSERT INTO admin_logs (admin_id, action, summary, ip, user_agent) VALUES (?, 'auth.login', 'Admin signed in', ?, ?)`, [a.id, meta.ip ?? null, meta.userAgent?.slice(0, 300) ?? null]);
    return this.issue(a.id, meta);
  }

  private async issue(adminId: number, meta: { ip?: string | null; userAgent?: string | null }) {
    const refresh = randomToken(48);
    const res = await exec(
      `INSERT INTO admin_sessions (admin_id, refresh_hash, ip, user_agent, expires_at) VALUES (?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? HOUR))`,
      [adminId, sha256(refresh), meta.ip ?? null, meta.userAgent?.slice(0, 300) ?? null, this.sessionTtlHours],
    );
    const accessToken = await signAccessToken(this.secret, { sub: adminId, sid: res.insertId }, 600, AUD);
    return { accessToken, refreshToken: refresh, expiresIn: 600 };
  }

  async refresh(refreshToken: string, meta: { ip?: string | null; userAgent?: string | null }) {
    const s = await queryOne<any>(
      `SELECT s.id, s.admin_id, a.is_active FROM admin_sessions s JOIN admin_users a ON a.id = s.admin_id
       WHERE s.refresh_hash = ? AND s.revoked_at IS NULL AND s.expires_at > UTC_TIMESTAMP()`,
      [sha256(refreshToken)],
    );
    if (!s || !s.is_active) throw unauthorized();
    // Rotate: revoke the old session row and issue a new one (absolute lifetime is per row).
    await exec('UPDATE admin_sessions SET revoked_at = UTC_TIMESTAMP() WHERE id = ?', [s.id]);
    return this.issue(s.admin_id, meta);
  }

  async logout(refreshToken: string) {
    await exec('UPDATE admin_sessions SET revoked_at = UTC_TIMESTAMP() WHERE refresh_hash = ?', [sha256(refreshToken)]);
  }

  async authenticate(token: string): Promise<AdminPrincipal> {
    const claims = await verifyAccessToken(this.secret, token, AUD);
    const hit = this.permCache.get(claims.sub);
    if (hit && Date.now() - hit.at < 30_000) return hit.p;
    const a = await queryOne<any>(
      `SELECT a.id, a.email, a.name, a.is_active, r.role_key, r.name AS role_name FROM admin_users a JOIN admin_roles r ON r.id = a.role_id WHERE a.id = ?`,
      [claims.sub],
    );
    if (!a || !a.is_active) throw unauthorized();
    const perms = await query<{ perm_key: string }>(
      `SELECT p.perm_key FROM admin_role_permissions rp JOIN admin_permissions p ON p.id = rp.permission_id
       JOIN admin_users a ON a.role_id = rp.role_id WHERE a.id = ?`,
      [a.id],
    );
    const p: AdminPrincipal = { id: a.id, email: a.email, name: a.name, roleKey: a.role_key, roleName: a.role_name, permissions: new Set(perms.map((x) => x.perm_key)) };
    this.permCache.set(a.id, { at: Date.now(), p });
    return p;
  }

  invalidate(adminId?: number) {
    if (adminId) this.permCache.delete(adminId);
    else this.permCache.clear();
  }
}

export async function audit(
  admin: AdminPrincipal,
  action: string,
  target: { type?: string; id?: string | number | null; summary?: string; before?: unknown; after?: unknown },
  meta: { ip?: string | null; userAgent?: string | null },
) {
  await exec(
    `INSERT INTO admin_logs (admin_id, action, target_type, target_id, summary, before_json, after_json, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      admin.id,
      action,
      target.type ?? null,
      target.id != null ? String(target.id) : null,
      target.summary?.slice(0, 300) ?? null,
      target.before === undefined ? null : JSON.stringify(target.before),
      target.after === undefined ? null : JSON.stringify(target.after),
      meta.ip ?? null,
      meta.userAgent?.slice(0, 300) ?? null,
    ],
  );
}
