// Shapes returned to the app (docs/CONTRACTS/openapi.yaml: Me, Family, Member).
// The REAL role always comes from family membership, never from what the app chose on "Who are you?".

/** Stored avatar paths are relative (/media/avatars/x.jpg); Google photos are absolute https URLs. */
export function mediaUrl(cfg, stored) {
  if (!stored) return null;
  if (/^https:\/\//i.test(stored)) return stored;
  return `${cfg.PUBLIC_BASE_URL.replace(/\/$/, '')}${stored}`;
}

/** Active membership of a user (one family per user for now). */
export function membershipOf(db, userId) {
  return db('family_members as m')
    .join('families as f', 'f.id', 'm.family_id')
    .where('m.user_id', userId)
    .whereNull('m.left_at')
    .whereNull('f.deleted_at')
    .orderBy('m.id', 'asc')
    .first('m.*', 'f.uuid as family_uuid', 'f.owner_user_id');
}

export async function presentMe(db, cfg, user) {
  const m = await membershipOf(db, user.id);
  return {
    id: user.uuid,
    email: user.email ?? null,
    email_verified: !!user.email_verified_at,
    auth_provider: user.auth_provider,
    has_password: !!user.password_hash,
    name: user.name ?? null,
    avatar_url: mediaUrl(cfg, user.avatar_url),
    avatar_thumb_url: mediaUrl(cfg, user.avatar_thumb_url),
    country_iso2: user.country_iso2 ?? null,
    timezone: user.timezone ?? null,
    tz_auto: !!user.tz_auto,
    detected_source: user.detected_source ?? null,
    language: user.language || 'en',
    role: m?.role ?? null,
    is_overseas: !!m?.is_overseas,
    family_id: m?.family_uuid ?? null,
  };
}

/** Plan code for a family: an active (or trial/grace) subscription, otherwise 'free'. */
export async function familyPlan(db, familyId, now) {
  const sub = await db('subscriptions as s')
    .join('plans as p', 'p.id', 's.plan_id')
    .where('s.family_id', familyId)
    .whereIn('s.status', ['trial', 'active', 'grace'])
    .where((q) => q.whereNull('s.expires_at').orWhere('s.expires_at', '>', now))
    .orderBy('s.id', 'desc')
    .first('p.*');
  if (sub) return sub;
  // Free plan: limits come from app_settings.free_limits (admin-editable), per-country overrides win.
  const free = await db('plans').where({ code: 'free' }).first();
  if (!free) return free;
  const rows = await db('app_settings').whereIn('key', ['free_limits', 'country_overrides', 'free_plan_enabled']).select('key', 'value');
  const get = (k) => {
    const r = rows.find((x) => x.key === k);
    if (!r) return undefined;
    return typeof r.value === 'string' ? JSON.parse(r.value) : r.value;
  };
  let limits = get('free_limits') || {};
  const overrides = get('country_overrides') || {};
  if (Object.keys(overrides).length) {
    const owner = await db('families as f').join('users as u', 'u.id', 'f.owner_user_id').where('f.id', familyId).first('u.country_iso2');
    const o = owner?.country_iso2 ? overrides[owner.country_iso2]?.free_limits : null;
    if (o) limits = { ...limits, ...o };
  }
  const out = { ...free };
  for (const k of ['max_children', 'max_members', 'max_places', 'history_days']) if (limits[k] !== undefined) out[k] = limits[k];
  // Free plan switched off: the family must start a trial or buy (live map and SOS keep working).
  if (get('free_plan_enabled') === false) {
    out.code = 'none';
    out.max_children = 0;
    out.max_members = 1;
    out.max_places = 0;
    out.history_days = 1;
  }
  return out;
}

/** Family with members. Never includes locations. */
export async function presentFamily(db, cfg, family, now) {
  const members = await db('family_members as m')
    .join('users as u', 'u.id', 'm.user_id')
    .where('m.family_id', family.id)
    .whereNull('m.left_at')
    .where('u.status', 'active')
    .orderBy('m.id', 'asc')
    .select('u.id as user_id', 'u.uuid', 'u.name', 'u.avatar_thumb_url', 'u.timezone', 'u.country_iso2', 'm.role',
      'm.relationship', 'm.is_overseas', 'm.sharing_status');
  const owner = members.find((m) => m.user_id === family.owner_user_id);
  const plan = await familyPlan(db, family.id, now);
  return {
    id: family.uuid,
    name: family.name ?? null,
    owner_member_id: owner?.uuid ?? null,
    plan: plan?.code ?? 'free',
    members: members.map((m) => ({
      id: m.uuid,
      name: m.name,
      avatar_thumb_url: mediaUrl(cfg, m.avatar_thumb_url),
      role: m.role,
      relationship: m.relationship ?? null,
      is_overseas: !!m.is_overseas,
      timezone: m.timezone ?? null,
      country_iso2: m.country_iso2 ?? null,
      sharing_status: m.sharing_status,
    })),
  };
}

export async function countActive(db, familyId, roles) {
  const r = await db('family_members as m')
    .join('users as u', 'u.id', 'm.user_id')
    .where('m.family_id', familyId)
    .whereNull('m.left_at')
    .where('u.status', 'active')
    .whereIn('m.role', roles)
    .count({ n: '*' })
    .first();
  return Number(r.n);
}
