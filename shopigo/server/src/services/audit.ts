import type { Request } from 'express';
import { db, json } from '../db/index.js';
import { logger } from '../core/logger.js';

export interface AuditEntry {
  action: string;
  targetType?: string;
  targetId?: string | number | null;
  oldValue?: unknown;
  newValue?: unknown;
}

const SENSITIVE = /password|secret|token|api_?key|totp|credential/i;

function scrub(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(scrub);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = SENSITIVE.test(k) ? '***' : scrub(v);
  return out;
}

export async function audit(req: Request | null, entry: AuditEntry): Promise<void> {
  try {
    await db()
      .insertInto('audit_logs')
      .values({
        admin_id: req?.admin?.id ?? null,
        admin_name: req?.admin?.name ?? null,
        action: entry.action,
        target_type: entry.targetType ?? null,
        target_id: entry.targetId != null ? String(entry.targetId) : null,
        old_value: json.stringify(scrub(entry.oldValue)),
        new_value: json.stringify(scrub(entry.newValue)),
        ip: req?.ip ?? null,
        user_agent: req?.get('user-agent')?.slice(0, 500) ?? null,
      })
      .execute();
  } catch (err) {
    logger.error({ err }, 'audit log write failed');
  }
}

/** Returns only the fields that changed, as [old, new] snapshots. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const o: Record<string, unknown> = {};
  const n: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(after)) {
    const prev = before[k];
    const a = prev instanceof Date ? prev.toISOString() : prev;
    const b = v instanceof Date ? v.toISOString() : v;
    if (JSON.stringify(a) !== JSON.stringify(b)) { o[k] = a; n[k] = b; }
  }
  return { oldValue: o, newValue: n, changed: Object.keys(n).length > 0 };
}
