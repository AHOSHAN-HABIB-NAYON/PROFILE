import type { AppSettings } from '@quizwar/shared';
import { createHash, randomInt } from 'node:crypto';
import { GoogleAuth } from 'google-auth-library';
import { exec, query, queryOne } from '../../db/pool';
import { AppError, badRequest, notFound } from '../../lib/errors';

export type PremiumFeature = 'calls' | 'voiceMessages' | 'photos' | 'liveMic';
const SETTING: Record<PremiumFeature, keyof AppSettings> = {
  calls: 'premiumCalls',
  voiceMessages: 'premiumVoiceMessages',
  photos: 'premiumPhotos',
  liveMic: 'premiumLiveMic',
};
/** Play states that still give premium until the expiry time. */
const VALID_STATES = new Set(['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED']);
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

interface Deps {
  settings: () => AppSettings;
  packageName: string;
  /** Service account JSON with access to the Play Console (Google Play Developer API). */
  serviceAccountJson?: string;
  /** Tell the player's app their account changed (premium on / off). */
  pushAccount: (userId: number) => Promise<void>;
  log: { info: (o: object, m: string) => void; error: (o: object, m: string) => void };
}

/**
 * Premium: monthly Google Play subscription, redeem codes and admin grants. All of them only move
 * `premium_until` forward; `premium_at` (older admin badge) means premium for good.
 */
export class PremiumService {
  private cache = new Map<number, { v: boolean; at: number }>();
  private auth: GoogleAuth | null = null;

  constructor(private readonly d: Deps) {
    if (d.serviceAccountJson) {
      try {
        this.auth = new GoogleAuth({ credentials: JSON.parse(d.serviceAccountJson), scopes: ['https://www.googleapis.com/auth/androidpublisher'] });
      } catch {
        d.log.error({}, 'PLAY_SERVICE_ACCOUNT_JSON is not valid JSON');
      }
    }
  }

  get canVerifyPlay() {
    return !!this.auth;
  }

  async isPremium(userId: number) {
    const hit = this.cache.get(userId);
    if (hit && Date.now() - hit.at < 30_000) return hit.v;
    const row = await queryOne('SELECT 1 x FROM user_profiles WHERE user_id = ? AND (premium_at IS NOT NULL OR premium_until > UTC_TIMESTAMP())', [userId]);
    const v = !!row;
    if (this.cache.size > 50_000) this.cache.clear();
    this.cache.set(userId, { v, at: Date.now() });
    return v;
  }

  /** Is this feature behind premium right now (sale on + feature switch on)? */
  locked(feature: PremiumFeature) {
    const s = this.d.settings();
    return !!s.premiumEnabled && s[SETTING[feature]] !== false;
  }

  /** Throws `premium_required` (402) when the feature needs premium and the player has none. */
  async require(userId: number, feature: PremiumFeature) {
    if (!this.locked(feature) || (await this.isPremium(userId))) return;
    throw new AppError(402, 'premium_required', 'This needs QUIZ WAR Premium', { feature });
  }

  private async changed(userId: number) {
    this.cache.delete(userId);
    await this.d.pushAccount(userId).catch(() => undefined);
  }

  /** Add days of premium (from now, or from the current end if still running). */
  async addDays(userId: number, days: number) {
    const r = await exec(
      `UPDATE user_profiles SET premium_until = DATE_ADD(GREATEST(COALESCE(premium_until, UTC_TIMESTAMP()), UTC_TIMESTAMP()), INTERVAL ? DAY) WHERE user_id = ?`,
      [days, userId],
    );
    if (!r.affectedRows) throw notFound('Player not found');
    await this.changed(userId);
  }

  async removeTimed(userId: number) {
    await exec('UPDATE user_profiles SET premium_until = NULL WHERE user_id = ?', [userId]);
    await this.changed(userId);
  }

  /* ------------------------------ Redeem codes ------------------------------ */

  async createCodes(count: number, days: number, maxUses: number, note: string | null, validDays: number | null) {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      const code = Array.from({ length: 10 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
      await exec('INSERT INTO redeem_codes (code, days, max_uses, note, expires_at) VALUES (?, ?, ?, ?, ?)', [
        code,
        days,
        maxUses,
        note,
        validDays ? new Date(Date.now() + validDays * 86400_000) : null,
      ]);
      codes.push(code);
    }
    return codes;
  }

  async listCodes() {
    return query<any>(
      `SELECT c.code, c.days, c.max_uses AS maxUses, c.uses, c.note, c.expires_at AS expiresAt, c.created_at AS createdAt
       FROM redeem_codes c ORDER BY c.created_at DESC LIMIT 200`,
    );
  }

  async deleteCode(code: string) {
    await exec('DELETE FROM redeem_codes WHERE code = ?', [code]);
  }

  async redeem(userId: number, raw: string) {
    const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 6) throw badRequest('Enter the full code');
    const c = await queryOne<{ code: string; days: number; max_uses: number; uses: number; expires_at: Date | null }>('SELECT code, days, max_uses, uses, expires_at FROM redeem_codes WHERE code = ?', [code]);
    if (!c) throw new AppError(404, 'code_not_found', 'This code is not valid');
    if (c.expires_at && new Date(c.expires_at).getTime() < Date.now()) throw new AppError(410, 'code_expired', 'This code has expired');
    if (c.uses >= c.max_uses) throw new AppError(409, 'code_used', 'This code has already been used');
    const used = await queryOne('SELECT 1 x FROM redeem_uses WHERE code = ? AND user_id = ?', [code, userId]);
    if (used) throw new AppError(409, 'code_used_by_you', 'You already used this code');
    const take = await exec('UPDATE redeem_codes SET uses = uses + 1 WHERE code = ? AND uses < max_uses', [code]);
    if (!take.affectedRows) throw new AppError(409, 'code_used', 'This code has already been used');
    await exec('INSERT INTO redeem_uses (code, user_id) VALUES (?, ?)', [code, userId]);
    await this.addDays(userId, c.days);
    return { days: c.days };
  }

  /* ------------------------------ Google Play ------------------------------ */

  private async play<T>(path: string, method: 'GET' | 'POST' = 'GET'): Promise<T> {
    if (!this.auth) throw new AppError(503, 'billing_unavailable', 'Purchases can’t be checked right now');
    const client = await this.auth.getClient();
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(this.d.packageName)}/${path}`;
    const r = await client.request<T>({ url, method, ...(method === 'POST' ? { data: {} } : {}) });
    return r.data;
  }

  /**
   * Check a Play subscription purchase with Google and give premium until it ends. Called by the
   * app after buying, when it starts (restore) and by Play's real-time notifications.
   */
  async verifyPlay(userId: number | null, token: string) {
    const hash = sha(token);
    const known = await queryOne<{ user_id: number }>('SELECT user_id FROM premium_purchases WHERE token_hash = ?', [hash]);
    if (known && userId !== null && Number(known.user_id) !== userId) throw new AppError(409, 'purchase_other_account', 'This purchase belongs to another QUIZ WAR account');
    const owner = userId ?? (known ? Number(known.user_id) : null);
    if (owner === null) return null;

    const sub = await this.play<any>(`purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`);
    const items: any[] = sub.lineItems ?? [];
    const item = items.sort((a, b) => Date.parse(b.expiryTime ?? 0) - Date.parse(a.expiryTime ?? 0))[0];
    const productId: string = item?.productId ?? 'unknown';
    const expiry = item?.expiryTime ? new Date(item.expiryTime) : null;
    const state: string = sub.subscriptionState ?? 'UNKNOWN';
    const valid = VALID_STATES.has(state) && !!expiry && expiry.getTime() > Date.now();

    await exec(
      `INSERT INTO premium_purchases (user_id, token_hash, purchase_token, product_id, order_id, state, expiry_at, auto_renew)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE product_id = VALUES(product_id), order_id = VALUES(order_id), state = VALUES(state), expiry_at = VALUES(expiry_at), auto_renew = VALUES(auto_renew)`,
      [owner, hash, token, productId, sub.latestOrderId ?? null, state, expiry, item?.autoRenewingPlan?.autoRenewEnabled ? 1 : 0],
    );
    // An upgrade / re-subscribe replaces the old purchase.
    if (sub.linkedPurchaseToken) await exec('UPDATE premium_purchases SET state = ? WHERE token_hash = ?', ['SUBSCRIPTION_STATE_REPLACED', sha(sub.linkedPurchaseToken)]);

    if (valid) {
      await exec('UPDATE user_profiles SET premium_until = GREATEST(COALESCE(premium_until, ?), ?) WHERE user_id = ?', [expiry, expiry, owner]);
      if (sub.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING') {
        await this.play(`purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}:acknowledge`, 'POST').catch((err) =>
          this.d.log.error({ err }, 'play acknowledge failed'),
        );
      }
    }
    await this.changed(owner);
    this.d.log.info({ userId: owner, state, productId }, 'play subscription checked');
    return { valid, state, expiresAt: expiry?.toISOString() ?? null };
  }

  /** Has a Google Play subscription that is still running (to show "Manage subscription"). */
  async hasPlaySubscription(userId: number) {
    const row = await queryOne(
      `SELECT 1 x FROM premium_purchases WHERE user_id = ? AND expiry_at > UTC_TIMESTAMP() AND state IN ('SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED') LIMIT 1`,
      [userId],
    );
    return !!row;
  }

  /** Google refunded / revoked a purchase: premium from it ends now. */
  async revoke(token: string) {
    const row = await queryOne<{ user_id: number; expiry_at: Date | null }>('SELECT user_id, expiry_at FROM premium_purchases WHERE token_hash = ?', [sha(token)]);
    if (!row) return;
    await exec('UPDATE premium_purchases SET state = ? WHERE token_hash = ?', ['SUBSCRIPTION_STATE_REVOKED', sha(token)]);
    // Only take away what this purchase gave (redeemed days that reach further stay).
    if (row.expiry_at) await exec('UPDATE user_profiles SET premium_until = UTC_TIMESTAMP() WHERE user_id = ? AND premium_until <= ?', [row.user_id, row.expiry_at]);
    await this.changed(Number(row.user_id));
  }

  /** Real-time developer notification from Google Play (through Pub/Sub push). */
  async onPlayNotification(n: { subscriptionNotification?: { notificationType?: number; purchaseToken?: string }; voidedPurchaseNotification?: { purchaseToken?: string } }) {
    const v = n.voidedPurchaseNotification?.purchaseToken;
    if (v) return this.revoke(v);
    const s = n.subscriptionNotification;
    if (!s?.purchaseToken) return;
    // 12 = SUBSCRIPTION_REVOKED
    if (s.notificationType === 12) return this.revoke(s.purchaseToken);
    await this.verifyPlay(null, s.purchaseToken);
  }

  /**
   * Monthly reward: the top N of last month's leaderboard get 30 days of premium. Runs once per
   * month (safe to call often). `month` is YYYY-MM (Bangladesh time) of the month that ended.
   */
  async rewardMonth(month: string, top: number) {
    if (top <= 0) return [];
    const claim = await exec('INSERT IGNORE INTO premium_month_rewards (month) VALUES (?)', [month]);
    if (!claim.affectedRows) return [];
    const rows = await query<{ user_id: number }>(
      `SELECT l.user_id FROM leaderboards l JOIN users u ON u.id = l.user_id WHERE l.board = ? AND u.status = 'active' AND l.score > 0 ORDER BY l.score DESC, l.updated_at ASC LIMIT ?`,
      [`monthly:${month}`, top],
    );
    const ids = rows.map((r) => Number(r.user_id));
    for (const id of ids) await this.addDays(id, 30).catch(() => undefined);
    await exec('UPDATE premium_month_rewards SET user_ids = ? WHERE month = ?', [ids.join(','), month]);
    this.d.log.info({ month, ids }, 'monthly premium reward given');
    return ids;
  }

  /** Admin: who bought premium recently. */
  async recentPurchases() {
    return query<any>(
      `SELECT pp.user_id AS userId, u.uid, p.username, pp.product_id AS productId, pp.state, pp.expiry_at AS expiresAt, pp.auto_renew AS autoRenew, pp.updated_at AS updatedAt
       FROM premium_purchases pp JOIN users u ON u.id = pp.user_id JOIN user_profiles p ON p.user_id = pp.user_id
       ORDER BY pp.updated_at DESC LIMIT 100`,
    );
  }

  async stats() {
    const r = await queryOne<{ active: number; forever: number; paying: number }>(
      `SELECT SUM(premium_until > UTC_TIMESTAMP()) AS active, SUM(premium_at IS NOT NULL) AS forever,
              (SELECT COUNT(DISTINCT user_id) FROM premium_purchases WHERE expiry_at > UTC_TIMESTAMP() AND state IN ('SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED')) AS paying
       FROM user_profiles`,
    );
    return { active: Number(r?.active ?? 0), forever: Number(r?.forever ?? 0), paying: Number(r?.paying ?? 0) };
  }
}
