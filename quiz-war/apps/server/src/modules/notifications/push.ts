import { GoogleAuth } from 'google-auth-library';
import webpush from 'web-push';
import { exec, query } from '../../db/pool';
import { sha256 } from '../../lib/crypto';

export interface PushMessage {
  title: string;
  body: string;
  /** Deep link path inside the app, e.g. /battle/requests */
  url?: string;
  tag?: string;
  data?: Record<string, string>;
}

interface Logger {
  warn(o: object, m: string): void;
  error(o: object, m: string): void;
}

/**
 * Push delivery: Web Push (VAPID) for browsers/PWA, FCM HTTP v1 for Android.
 * Both providers are optional — if not configured, push is silently skipped and users still
 * receive in-app notifications.
 */
export class PushService {
  private fcm: { auth: GoogleAuth; projectId: string } | null = null;
  private webEnabled = false;
  private vapidPublic: string | null = null;
  private vapidSubject: string;

  constructor(
    cfg: { vapidPublicKey?: string; vapidPrivateKey?: string; vapidSubject: string; fcmServiceAccountJson?: string },
    private readonly log: Logger,
  ) {
    this.vapidSubject = cfg.vapidSubject;
    if (cfg.vapidPublicKey && cfg.vapidPrivateKey) {
      webpush.setVapidDetails(cfg.vapidSubject, cfg.vapidPublicKey, cfg.vapidPrivateKey);
      this.vapidPublic = cfg.vapidPublicKey;
      this.webEnabled = true;
    }
    if (cfg.fcmServiceAccountJson) {
      try {
        // Accept the JSON as-is or base64-encoded (easier to paste as one line on some hosts).
        const raw = cfg.fcmServiceAccountJson.trim();
        const credentials = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
        this.fcm = {
          auth: new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/firebase.messaging'] }),
          projectId: credentials.project_id,
        };
      } catch {
        log.error({}, 'FCM_SERVICE_ACCOUNT_JSON is not valid JSON — Android push disabled');
      }
    }
  }

  /** Public VAPID key for browsers (from env, or generated once and kept in the database). */
  get vapidPublicKey() {
    return this.vapidPublic;
  }

  /** Without VAPID env vars, create a key pair once and store it, so website push works with no setup. */
  async ensureWebKeys() {
    if (this.webEnabled) return;
    try {
      const row = await query<{ value: unknown }>(`SELECT value FROM settings WHERE setting_key = 'vapid'`);
      let keys = row[0]?.value ? (typeof row[0].value === 'string' ? JSON.parse(row[0].value) : row[0].value) : null;
      if (!keys?.publicKey || !keys?.privateKey) {
        keys = webpush.generateVAPIDKeys();
        await exec(`INSERT INTO settings (setting_key, value) VALUES ('vapid', ?) ON DUPLICATE KEY UPDATE value = value`, [JSON.stringify(keys)]);
        const again = await query<{ value: unknown }>(`SELECT value FROM settings WHERE setting_key = 'vapid'`);
        keys = typeof again[0].value === 'string' ? JSON.parse(again[0].value as string) : again[0].value;
      }
      webpush.setVapidDetails(this.vapidSubject, keys.publicKey, keys.privateKey);
      this.vapidPublic = keys.publicKey;
      this.webEnabled = true;
    } catch (err) {
      this.log.warn({ err: (err as Error).message }, 'could not prepare web push keys');
    }
  }

  get enabled() {
    return this.webEnabled || !!this.fcm;
  }

  get status() {
    return { web: this.webEnabled, android: !!this.fcm, firebaseProject: this.fcm?.projectId ?? null };
  }

  async register(userId: number, platform: 'android' | 'web', token: string) {
    const hash = sha256(token);
    await exec(
      `INSERT INTO device_tokens (user_id, platform, token_hash, token) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), platform = VALUES(platform), last_seen_at = UTC_TIMESTAMP()`,
      [userId, platform, hash, token],
    );
  }

  async unregister(userId: number, token: string) {
    await exec('DELETE FROM device_tokens WHERE user_id = ? AND token_hash = ?', [userId, sha256(token)]);
  }

  async sendToUser(userId: number, msg: PushMessage) {
    if (!this.enabled) return;
    const tokens = await query<{ id: number; platform: 'android' | 'web'; token: string }>(
      'SELECT id, platform, token FROM device_tokens WHERE user_id = ? ORDER BY last_seen_at DESC LIMIT 10',
      [userId],
    );
    await Promise.all(tokens.map((t) => this.deliver(t, msg)));
  }

  private async deliver(t: { id: number; platform: 'android' | 'web'; token: string }, msg: PushMessage) {
    try {
      if (t.platform === 'web' && this.webEnabled) {
        await webpush.sendNotification(JSON.parse(t.token), JSON.stringify(msg), { TTL: 3600, urgency: 'normal' });
      } else if (t.platform === 'android' && this.fcm) {
        const client = await this.fcm.auth.getClient();
        const res = await client.request<any>({
          url: `https://fcm.googleapis.com/v1/projects/${this.fcm.projectId}/messages:send`,
          method: 'POST',
          data: {
            message: {
              token: t.token,
              notification: { title: msg.title, body: msg.body },
              data: { url: msg.url ?? '/', ...(msg.data ?? {}) },
              android: { priority: 'high', notification: { channel_id: 'quizwar_default', tag: msg.tag } },
            },
          },
          validateStatus: () => true,
        });
        if (res.status === 404 || JSON.stringify(res.data ?? '').includes('UNREGISTERED')) await this.drop(t.id);
        else if (res.status >= 400) this.log.warn({ status: res.status }, 'fcm send failed');
      }
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.statusCode === 410) await this.drop(t.id);
      else this.log.warn({ err: err?.message }, 'push send failed');
    }
  }

  private async drop(id: number) {
    await exec('DELETE FROM device_tokens WHERE id = ?', [id]);
  }
}
