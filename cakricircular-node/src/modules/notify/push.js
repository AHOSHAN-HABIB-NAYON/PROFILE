/* ─────────────────────────────────────────────
   ওয়েব পুশ (VAPID) — বিনামূল্যে, কোনো তৃতীয় পক্ষের সার্ভিস লাগে না
   ───────────────────────────────────────────── */
import webpush from 'web-push';
import { setting, setSetting } from '../../core/settings.js';
import { run } from '../../db.js';

let ready = false;
export async function ensureVapid() {
  if (!setting('vapid_public') || !setting('vapid_private')) {
    const k = webpush.generateVAPIDKeys();
    await setSetting('vapid_public', k.publicKey); await setSetting('vapid_private', k.privateKey);
  }
  const subject = setting('vapid_subject') || `mailto:${setting('contact_email', 'admin@example.com')}`;
  webpush.setVapidDetails(subject, setting('vapid_public'), setting('vapid_private'));
  ready = true;
}

/** একটি ডিভাইসে পাঠাই → 'ok' | 'gone' | 'fail' */
export async function sendPush(sub, payload) {
  if (!ready) await ensureVapid();
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 86400, urgency: 'normal' });
    await run('UPDATE push_subscriptions SET last_ok_at = NOW(), fails = 0 WHERE id = ?', [sub.id]).catch(() => {});
    return 'ok';
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) { await run('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]).catch(() => {}); await run('DELETE FROM push_saved WHERE sub_id = ?', [sub.id]).catch(() => {}); return 'gone'; }
    await run('UPDATE push_subscriptions SET fails = fails + 1 WHERE id = ?', [sub.id]).catch(() => {});
    return 'fail';
  }
}
