import type { Request } from 'express';
import { exec } from '../../infrastructure/db';
import { clientIp, userAgent } from './sessions';
import type { PrincipalType } from './principal';

export async function securityEvent(
  pt: PrincipalType,
  pid: number,
  type: string,
  req: Request | null,
  meta: Record<string, unknown> = {},
) {
  await exec(
    'INSERT INTO security_events (principal_type, principal_id, type, ip, user_agent, meta) VALUES (?,?,?,?,?,?)',
    [pt, pid, type, req ? clientIp(req) : null, req ? userAgent(req) : null, JSON.stringify(meta)],
  );
}

export async function loginAttempt(
  pt: PrincipalType,
  pid: number | null,
  email: string | null,
  method: string,
  success: boolean,
  reason: string | null,
  req: Request,
) {
  await exec(
    'INSERT INTO login_attempts (principal_type, principal_id, email, ip, user_agent, method, success, reason) VALUES (?,?,?,?,?,?,?,?)',
    [pt, pid, email, clientIp(req), userAgent(req), method, success ? 1 : 0, reason],
  );
}

export async function audit(
  adminId: number | null,
  action: string,
  target: { type?: string; id?: string | number; userId?: number | null } = {},
  req: Request | null = null,
  before?: unknown,
  after?: unknown,
) {
  await exec(
    'INSERT INTO audit_logs (admin_user_id, user_id, action, target_type, target_id, ip, user_agent, before_data, after_data) VALUES (?,?,?,?,?,?,?,?,?)',
    [
      adminId,
      target.userId ?? null,
      action,
      target.type ?? null,
      target.id !== undefined ? String(target.id) : null,
      req ? clientIp(req) : null,
      req ? userAgent(req) : null,
      before === undefined ? null : JSON.stringify(before),
      after === undefined ? null : JSON.stringify(after),
    ],
  );
}
