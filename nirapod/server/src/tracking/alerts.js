// Family alerts created from tracking data (Phase 3). Push/email delivery is added in Phase 5; here we write
// timeline_events (History > Timeline) and notifications (bell), and emit realtime `notification.new`.

/** Adults (parents/guardians) of a family who receive safety alerts. */
export async function familyAdults(db, familyId) {
  return db('family_members as m').join('users as u', 'u.id', 'm.user_id')
    .where('m.family_id', familyId).whereNull('m.left_at').whereIn('m.role', ['parent', 'guardian']).where('u.status', 'active')
    .select('u.id', 'u.uuid');
}

/**
 * Records one alert about `subject` (a user row with id, uuid, name) for the family.
 * @param {'battery_low'|'battery_critical'|'offline'|'location_off'|'permission_removed'} type
 */
export async function raiseAlert(ctx, { familyId, subject, type, data = {}, now, placeId = null, category = 'safety' }) {
  const { db, realtime } = ctx;
  await db('timeline_events').insert({
    family_id: familyId, user_id: subject.id, type, place_id: placeId, data: JSON.stringify(data), occurred_at: now,
  });
  // The subject never notifies themself (an adult on a safe walk, an adult who sent SOS).
  const adults = (await familyAdults(db, familyId)).filter((a) => a.id !== subject.id);
  const params = JSON.stringify({ name: subject.name || '', ...data });
  if (adults.length) {
    await db('notifications').insert(adults.map((a) => ({
      user_id: a.id, family_id: familyId, category, type, title_key: `notif.${type}`, params, created_at: now,
    })));
  }
  realtime?.emitToUsers(adults.map((a) => a.uuid), 'notification.new', { category, type, title_key: `notif.${type}`, params: { name: subject.name || '', ...data } }, now);
  return adults;
}

/** Battery threshold crossings with hysteresis: alert at <=20 and <=5 once; re-arm above 25. */
export function batteryAlert(level, lastAlert) {
  if (level == null) return { alert: null, next: lastAlert };
  if (level <= 5 && lastAlert !== 5) return { alert: 'battery_critical', next: 5 };
  if (level <= 20 && lastAlert == null) return { alert: 'battery_low', next: 20 };
  if (level > 25 && lastAlert != null) return { alert: null, next: null };
  return { alert: null, next: lastAlert };
}
