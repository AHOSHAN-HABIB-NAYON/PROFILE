// Who may see whose location. ABSOLUTE RULES + adult consent rule:
// - A child sees only themself.
// - A parent/guardian sees: themself, every child of the family (children's sharing is always on while they
//   are members), and other adults ONLY when that adult's sharing_status is 'active' (they accepted).
// - Adults who paused or stopped sharing are invisible to others (their position is not shown, not even stale).
// - Admin/support never call this: the admin DB user has no access to location tables.

export async function activeMembers(db, familyId) {
  return db('family_members as m')
    .join('users as u', 'u.id', 'm.user_id')
    .where('m.family_id', familyId)
    .whereNull('m.left_at')
    .where('u.status', 'active')
    .select('m.id as member_row_id', 'm.user_id', 'u.uuid', 'u.name', 'm.role', 'm.sharing_status');
}

export function canSee(viewer, member) {
  if (viewer.user_id === member.user_id) return true;
  if (viewer.role === 'child') return false;
  if (member.role === 'child') return member.sharing_status === 'active';
  return member.sharing_status === 'active';
}

/** Members whose location `viewerUserId` may see. */
export async function visibleMembers(db, familyId, viewerUserId) {
  const all = await activeMembers(db, familyId);
  const viewer = all.find((m) => m.user_id === viewerUserId);
  if (!viewer) return [];
  return all.filter((m) => canSee(viewer, m));
}

/** User uuids that may see `subjectUserId`'s location (used for realtime fan-out). */
export async function viewersOf(db, familyId, subjectUserId) {
  const all = await activeMembers(db, familyId);
  const subject = all.find((m) => m.user_id === subjectUserId);
  if (!subject) return [];
  return all.filter((v) => canSee(v, subject)).map((v) => v.uuid);
}
