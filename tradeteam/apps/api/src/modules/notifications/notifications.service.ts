import webpush from 'web-push';
import { exec, one, query } from '../../infrastructure/db';
import { enqueue, startWorker } from '../../infrastructure/queue';
import { sendMail, smtpConfigured } from '../../infrastructure/mailer';
import { logger } from '../../infrastructure/logger';
import { sha256 } from '../../infrastructure/crypto';
import { getSetting } from '../settings/settings.service';
import { publishUser } from '../../websocket/bus';
import { WS } from '@tradeteam/shared';
import { renderEmail } from './templates';
import { loadEnv } from '../../config/env';

export type NotificationType =
  | 'welcome'
  | 'login'
  | 'new_device'
  | 'password_changed'
  | 'passkey_added'
  | 'passkey_removed'
  | '2fa_enabled'
  | '2fa_disabled'
  | 'deposit_received'
  | 'withdrawal_requested'
  | 'withdrawal_completed'
  | 'withdrawal_rejected'
  | 'order_filled'
  | 'order_partial'
  | 'order_cancelled'
  | 'transfer'
  | 'security_alert'
  | 'announcement';

/** Categories users can mute; security notifications are always delivered. */
const CATEGORY: Record<NotificationType, 'security' | 'trading' | 'wallet' | 'system'> = {
  welcome: 'system',
  login: 'security',
  new_device: 'security',
  password_changed: 'security',
  passkey_added: 'security',
  passkey_removed: 'security',
  '2fa_enabled': 'security',
  '2fa_disabled': 'security',
  security_alert: 'security',
  deposit_received: 'wallet',
  withdrawal_requested: 'wallet',
  withdrawal_completed: 'wallet',
  withdrawal_rejected: 'wallet',
  transfer: 'wallet',
  order_filled: 'trading',
  order_partial: 'trading',
  order_cancelled: 'trading',
  announcement: 'system',
};

interface Prefs {
  email?: Partial<Record<'trading' | 'wallet' | 'system', boolean>>;
  push?: Partial<Record<'trading' | 'wallet' | 'system' | 'security', boolean>>;
  inapp?: Partial<Record<'trading' | 'wallet' | 'system', boolean>>;
}

async function prefsFor(userId: number): Promise<Prefs> {
  const r = await one<{ notification_prefs: unknown }>(
    'SELECT notification_prefs FROM user_profiles WHERE user_id = ?',
    [userId],
  );
  const p = r?.notification_prefs;
  if (!p) return {};
  return (typeof p === 'string' ? JSON.parse(p) : p) as Prefs;
}

export async function notify(
  userId: number,
  type: NotificationType,
  title: string,
  body: string,
  data: Record<string, unknown> = {},
  opts: { email?: boolean } = {},
) {
  const cat = CATEGORY[type];
  const prefs = await prefsFor(userId);
  const inapp = cat === 'security' || prefs.inapp?.[cat] !== false;
  let id: number | null = null;
  if (inapp) {
    const r = await exec('INSERT INTO notifications (user_id, type, title, body, data) VALUES (?,?,?,?,?)', [
      userId,
      type,
      title,
      body,
      JSON.stringify(data),
    ]);
    id = r.insertId;
    publishUser(userId, WS.NOTIFICATION_NEW, {
      id: String(id),
      type,
      title,
      body,
      data,
      createdAt: new Date().toISOString(),
      readAt: null,
    });
  }
  const wantEmail = opts.email ?? cat === 'security';
  if (wantEmail && (cat === 'security' || prefs.email?.[cat] !== false)) {
    if (smtpConfigured()) await enqueue('email', 'notification', { userId, title, body });
    else warnNoSmtp();
  }
  if (getSetting('push.enabled') && prefs.push?.[cat] !== false) {
    await enqueue('push', 'notification', { userId, title, body, data: { ...data, type } });
  }
  return id;
}

/** Transactional email to an explicit address (verification codes, resets). */
export async function sendTransactionalEmail(
  to: string,
  opts: { title: string; body: string; code?: string; cta?: { label: string; url: string } },
) {
  if (!smtpConfigured()) return warnNoSmtp();
  await enqueue('email', 'transactional', { to, ...opts });
}

let warnedAt = 0;
/** Without SMTP, emails cannot be delivered: warn (rate-limited) instead of queueing doomed jobs. */
function warnNoSmtp() {
  if (Date.now() - warnedAt < 60_000) return;
  warnedAt = Date.now();
  logger.warn('email not sent: SMTP is not configured (Admin → System settings → Email)');
}

export async function broadcastAnnouncement(title: string, body: string, adminId: number) {
  // Fan-out as one set-based INSERT … SELECT: no per-user round trips.
  const r = await exec(
    `INSERT INTO notifications (user_id, type, title, body, data)
     SELECT id, 'announcement', ?, ?, JSON_OBJECT('adminId', ?) FROM users WHERE status = 'active' AND deleted_at IS NULL`,
    [title, body, adminId],
  );
  const { publishBroadcast } = await import('../../websocket/bus');
  publishBroadcast(WS.NOTIFICATION_NEW, {
    id: null,
    type: 'announcement',
    title,
    body,
    createdAt: new Date().toISOString(),
    readAt: null,
  });
  return r.affectedRows;
}

export function startNotificationWorkers() {
  const env = loadEnv();
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    // The VAPID subject must be an https: URL or a mailto: address.
    const subject = env.APP_URL.startsWith('https://')
      ? env.APP_URL
      : `mailto:admin@${new URL(env.APP_URL).hostname}`;
    try {
      webpush.setVapidDetails(subject, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    } catch (e) {
      logger.error({ err: (e as Error).message }, 'web push disabled: invalid VAPID configuration');
    }
  }
  startWorker('email', async (job) => {
    if (job.name === 'notification') {
      const { userId, title, body } = job.data as { userId: number; title: string; body: string };
      const u = await one<{ email: string }>('SELECT email FROM users WHERE id = ?', [userId]);
      if (!u) return;
      const m = renderEmail({ title, body, cta: { label: 'Open app', url: env.APP_URL } });
      await sendMail(u.email, title, m.html, m.text);
    } else if (job.name === 'transactional') {
      const d = job.data as {
        to: string;
        title: string;
        body: string;
        code?: string;
        cta?: { label: string; url: string };
      };
      const m = renderEmail(d);
      await sendMail(d.to, d.title, m.html, m.text);
    }
  });
  startWorker('push', async (job) => {
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;
    const { userId, title, body, data } = job.data as {
      userId: number;
      title: string;
      body: string;
      data: unknown;
    };
    const subs = await query<{ id: number; endpoint: string; p256dh: string; auth: string }>(
      'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?',
      [userId],
    );
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title, body, data }),
          { TTL: 3600 },
        );
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410)
          await exec('DELETE FROM push_subscriptions WHERE id = ?', [s.id]);
        else logger.warn({ err: (e as Error).message }, 'push failed');
      }
    }
  });
}

export async function savePushSubscription(
  userId: number,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
) {
  await exec(
    'INSERT INTO push_subscriptions (user_id, endpoint, endpoint_hash, p256dh, auth) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth = VALUES(auth)',
    [userId, sub.endpoint, sha256(sub.endpoint), sub.keys.p256dh, sub.keys.auth],
  );
}
