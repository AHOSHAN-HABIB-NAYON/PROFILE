// "X joined your family" (Phase 5): bell + push + email to the other adults (email respects the user's toggle).
import { familyAdults } from '../tracking/alerts.js';
import { emailAllowed } from '../routes/notifications.js';
import { t } from '../push/strings.js';

export async function notifyFamilyJoined(ctx, { familyId, userId, role }) {
  const { db, clock, mailer, pusher, realtime, logger } = ctx;
  try {
    const now = clock.now();
    const joiner = await db('users').where({ id: userId }).first('name');
    const name = joiner?.name || '';
    const adults = (await familyAdults(db, familyId)).filter((a) => a.id !== userId);
    if (!adults.length) return;
    const params = JSON.stringify({ name, role });
    await db('notifications').insert(adults.map((a) => ({
      user_id: a.id, family_id: familyId, category: 'family', type: 'family_joined', title_key: 'notif.family_joined', params, created_at: now,
    })));
    realtime?.emitToUsers(adults.map((a) => a.uuid), 'notification.new', { category: 'family', type: 'family_joined', title_key: 'notif.family_joined', params: { name, role } }, now);
    await pusher?.notifyUsers(adults.map((a) => a.id), { category: 'family', type: 'family_joined', titleKey: 'notif.family_joined', params: { name, role } });
    const users = await db('users').whereIn('id', adults.map((a) => a.id)).select('id', 'email', 'language');
    for (const u of users) {
      if (!(await emailAllowed(db, u.id, 'family_joined'))) continue;
      await mailer.send('family_joined', u, { name, role: t(u.language, `home.role_${role === 'guardian' ? 'guardian' : role}`) });
    }
  } catch (e) {
    logger?.warn({ err: e }, 'family joined notice failed');
  }
}
