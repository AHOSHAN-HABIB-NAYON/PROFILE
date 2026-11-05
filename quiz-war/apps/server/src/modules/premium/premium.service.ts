import { normalizeUid, type AppSettings } from '@quizwar/shared';
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
  /** Hashes phone ids (so raw ids are never stored). */
  secret: string;
  notify: (userId: number, n: { type: string; title: { en: string; bn: string }; body: { en: string; bn: string }; url?: string }) => Promise<unknown>;
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

  /* --------------------------- Trials and referrals -------------------------- */

  private deviceHash(raw: string | null | undefined) {
    const v = String(raw ?? '').trim();
    return v.length >= 6 ? createHash('sha256').update(`${this.d.secret}:device:${v}`).digest('hex') : null;
  }

  /**
   * A new account finished its profile: remember the phone, save who invited them and start the
   * free trial (once per phone, while premium is on sale and trials are on).
   */
  async onNewAccount(userId: number, rawDevice: string | null | undefined, inviteCode: string | null | undefined) {
    const s = this.d.settings();
    const dev = this.deviceHash(rawDevice);
    if (dev) await exec('UPDATE user_profiles SET device_hash = COALESCE(device_hash, ?) WHERE user_id = ?', [dev, userId]);
    let referred = false;
    if (inviteCode) referred = await this.setReferrer(userId, inviteCode).catch(() => false);
    let trialDays = 0;
    if (s.premiumEnabled && s.premiumTrialEnabled && dev) {
      const r = await exec('INSERT IGNORE INTO device_rewards (device_hash, kind, user_id) VALUES (?, ?, ?)', [dev, 'trial', userId]);
      if (r.affectedRows) {
        trialDays = s.premiumTrialDays ?? 7;
        await this.addDays(userId, trialDays);
        await exec('UPDATE user_profiles SET premium_trial_until = premium_until WHERE user_id = ?', [userId]);
        this.cache.delete(userId);
      }
    }
    return { trialDays, referred };
  }

  /** Save the friend who invited this player (their UID). */
  async setReferrer(userId: number, code: string) {
    const uid = normalizeUid(code);
    if (!uid) throw new AppError(400, 'bad_invite', 'This invite code is not valid');
    const inviter = await queryOne<{ id: number }>("SELECT id FROM users WHERE uid = ? AND status = 'active'", [uid]);
    if (!inviter) throw new AppError(404, 'invite_not_found', 'No player with this invite code');
    if (Number(inviter.id) === userId) throw new AppError(400, 'own_invite', 'You can’t use your own code');
    const r = await exec('UPDATE user_profiles SET referred_by = ? WHERE user_id = ? AND referred_by IS NULL', [inviter.id, userId]);
    return r.affectedRows > 0;
  }

  private checkedFirstGame = new Set<number>();
  /**
   * A player finished a game. The first time, the friend who invited them gets premium days
   * (only once per phone, so one person can't make many accounts for it).
   */
  async onGamePlayed(userId: number) {
    if (this.checkedFirstGame.has(userId)) return;
    if (this.checkedFirstGame.size > 100_000) this.checkedFirstGame.clear();
    this.checkedFirstGame.add(userId);
    const s = this.d.settings();
    const p = await queryOne<{ referred_by: number | null; referral_rewarded: number; device_hash: string | null; username: string | null }>(
      'SELECT referred_by, referral_rewarded, device_hash, username FROM user_profiles WHERE user_id = ?',
      [userId],
    );
    if (!p?.referred_by || p.referral_rewarded || !s.referralEnabled || !s.premiumEnabled) return;
    const take = await exec('UPDATE user_profiles SET referral_rewarded = 1 WHERE user_id = ? AND referral_rewarded = 0', [userId]);
    if (!take.affectedRows) return;
    if (p.device_hash) {
      const dev = await exec('INSERT IGNORE INTO device_rewards (device_hash, kind, user_id) VALUES (?, ?, ?)', [p.device_hash, 'referral', userId]);
      if (!dev.affectedRows) {
        // This phone already earned someone a reward.
        await exec('UPDATE user_profiles SET referral_rewarded = 2 WHERE user_id = ?', [userId]);
        return;
      }
    }
    const inviter = Number(p.referred_by);
    const days = s.referralDays ?? 7;
    await this.addDays(inviter, days);
    const count = Number((await queryOne<{ n: number }>('SELECT COUNT(*) n FROM user_profiles WHERE referred_by = ? AND referral_rewarded = 1', [inviter]))?.n ?? 0);
    const big = s.referralBigCount ?? 100;
    const name = p.username ?? 'Player';
    if (count === big) {
      await this.addDays(inviter, s.referralBigDays ?? 365);
      await this.d.notify(inviter, {
        type: 'premium',
        title: { en: `${big} friends joined — you won!`, bn: `${big} জন বন্ধু খেলেছে — আপনি জিতেছেন!` },
        body: { en: `${s.referralBigDays ?? 365} days of Premium added. Thank you!`, bn: `${s.referralBigDays ?? 365} দিনের প্রিমিয়াম যোগ হয়েছে। ধন্যবাদ!` },
        url: '/premium',
      }).catch(() => undefined);
    } else {
      await this.d.notify(inviter, {
        type: 'premium',
        title: { en: `${name} played — +${days} days Premium`, bn: `${name} খেলেছে — +${days} দিন প্রিমিয়াম` },
        body: { en: `Thanks for inviting! ${count}/${big} friends so far.`, bn: `ইনভাইটের জন্য ধন্যবাদ! এখন পর্যন্ত ${count}/${big} জন।` },
        url: '/premium',
      }).catch(() => undefined);
    }
    this.d.log.info({ inviter, friend: userId, count }, 'referral reward');
  }

  async referralInfo(userId: number) {
    const s = this.d.settings();
    const r = await queryOne<{ joined: number; played: number }>(
      'SELECT COUNT(*) AS joined, COALESCE(SUM(referral_rewarded = 1), 0) AS played FROM user_profiles WHERE referred_by = ?',
      [userId],
    );
    return {
      enabled: !!s.referralEnabled && !!s.premiumEnabled,
      days: s.referralDays ?? 7,
      bigCount: s.referralBigCount ?? 100,
      bigDays: s.referralBigDays ?? 365,
      joined: Number(r?.joined ?? 0),
      played: Number(r?.played ?? 0),
    };
  }

  /** The friends this player invited, newest first (10 per page). */
  async referralList(userId: number, page: number, size = 10) {
    const rows = await query<{ uid: string; username: string | null; avatar_thumb_url: string | null; joined: Date; rewarded: number }>(
      `SELECT u.uid, p.username, p.avatar_thumb_url, u.created_at AS joined, p.referral_rewarded AS rewarded
       FROM user_profiles p JOIN users u ON u.id = p.user_id
       WHERE p.referred_by = ? ORDER BY u.created_at DESC, u.id DESC LIMIT ? OFFSET ?`,
      [userId, size + 1, page * size],
    );
    return {
      items: rows.slice(0, size).map((r) => ({
        uid: r.uid,
        name: r.username || 'Player',
        avatar: r.avatar_thumb_url,
        joinedAt: new Date(r.joined).toISOString(),
        played: Number(r.rewarded) > 0,
        rewarded: Number(r.rewarded) === 1,
      })),
      more: rows.length > size,
    };
  }

  /** "Premium ends tomorrow" (trials, codes, gifts — not auto-renewing Play subscriptions). */
  async remindEnding() {
    const rows = await query<{ user_id: number; premium_until: Date; trial: number }>(
      `SELECT p.user_id, p.premium_until, (p.premium_trial_until IS NOT NULL AND p.premium_until <= DATE_ADD(p.premium_trial_until, INTERVAL 1 SECOND)) AS trial
       FROM user_profiles p
       WHERE p.premium_at IS NULL AND p.premium_until BETWEEN UTC_TIMESTAMP() AND DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 DAY)
         AND (p.premium_reminded_for IS NULL OR p.premium_reminded_for <> p.premium_until)
         AND NOT EXISTS (SELECT 1 FROM premium_purchases pp WHERE pp.user_id = p.user_id AND pp.auto_renew = 1 AND pp.expiry_at > UTC_TIMESTAMP())
       LIMIT 500`,
    );
    for (const r of rows) {
      await exec('UPDATE user_profiles SET premium_reminded_for = premium_until WHERE user_id = ?', [r.user_id]);
      await this.d.notify(Number(r.user_id), {
        type: 'premium',
        title: r.trial ? { en: 'Your free trial ends tomorrow', bn: 'আপনার ফ্রি ট্রায়াল কাল শেষ হবে' } : { en: 'Your Premium ends tomorrow', bn: 'আপনার প্রিমিয়াম কাল শেষ হবে' },
        body: { en: 'Keep calls, video and live talk — get Premium from ৳150/month.', bn: 'কল, ভিডিও আর লাইভ কথা চালু রাখতে প্রিমিয়াম নিন — মাসে ৳১৫০ থেকে।' },
        url: '/premium',
      }).catch(() => undefined);
    }
    return rows.length;
  }

  /** Admin: who bought premium recently. */
  async recentPurchases() {
    return query<any>(
      `SELECT pp.user_id AS userId, u.uid, p.username, pp.product_id AS productId, pp.state, pp.expiry_at AS expiresAt, pp.auto_renew AS autoRenew, pp.updated_at AS updatedAt
       FROM premium_purchases pp JOIN users u ON u.id = pp.user_id JOIN user_profiles p ON p.user_id = pp.user_id
       ORDER BY pp.updated_at DESC LIMIT 100`,
    );
  }

  async topInviters() {
    return query<any>(
      `SELECT p.referred_by AS userId, u.uid, q.username, COUNT(*) AS joined, SUM(p.referral_rewarded = 1) AS played
       FROM user_profiles p JOIN users u ON u.id = p.referred_by JOIN user_profiles q ON q.user_id = p.referred_by
       WHERE p.referred_by IS NOT NULL GROUP BY p.referred_by, u.uid, q.username ORDER BY played DESC, joined DESC LIMIT 50`,
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
