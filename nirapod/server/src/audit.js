// Audit log writer. Only ids and non-personal metadata: never emails, names, codes, tokens, IPs or coordinates.
export async function audit(db, { actorType = 'user', actorId = null, actorLabel = null, action, targetType = null, targetId = null,
  metadata = null, now = new Date() }) {
  await db('audit_logs').insert({
    actor_type: actorType,
    actor_id: actorId,
    actor_label: actorLabel ? String(actorLabel).slice(0, 80) : null,
    action,
    target_type: targetType,
    target_id: targetId == null ? null : String(targetId),
    metadata: metadata ? JSON.stringify(metadata) : null,
    created_at: now,
  });
}
