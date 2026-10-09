import type { GameSettings } from '@quizwar/shared';
import { exec, query, queryOne, tx } from '../../db/pool';
import { AppError } from '../../lib/errors';
import { bdMonthKey } from '../../lib/time';
import type { NotificationService } from '../notifications/notification.service';
import type { ProgressionService } from '../progression/progression.service';

/**
 * Verified badge. Only real top players can have it: a player is eligible after enough real
 * (vs human) matches in the last 30 days with a high win rate. Eligible players can claim it
 * with coins; the best eligible players on the monthly leaderboard get it automatically.
 */
export class VerifiedService {
  constructor(
    private readonly settings: () => GameSettings,
    private readonly progression: ProgressionService,
    private readonly notifications: NotificationService,
  ) {}

  /** Real matches (vs humans) in the last 30 days. */
  async monthlyStats(userId: number) {
    const r = await queryOne<{ played: number; won: number }>(
      `SELECT COUNT(*) played, COALESCE(SUM(mp.result = 'win'), 0) won
       FROM match_players mp JOIN matches m ON m.id = mp.match_id
       WHERE mp.user_id = ? AND m.match_type = 'pvp' AND m.status = 'finished' AND m.ended_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)`,
      [userId],
    );
    const played = Number(r?.played ?? 0);
    const won = Number(r?.won ?? 0);
    return { played, won, winRate: played ? Math.round((won / played) * 1000) / 10 : 0 };
  }

  async status(userId: number) {
    const v = this.settings().verified;
    const [stats, row] = await Promise.all([this.monthlyStats(userId), queryOne<{ verified_at: Date | null; verified_source: string | null }>('SELECT verified_at, verified_source FROM user_profiles WHERE user_id = ?', [userId])]);
    const eligible = stats.played >= v.minMonthlyMatches && stats.winRate >= v.minMonthlyWinRate;
    return {
      enabled: v.enabled,
      verified: !!row?.verified_at,
      source: row?.verified_source ?? null,
      price: v.price,
      requirements: { matches: v.minMonthlyMatches, winRate: v.minMonthlyWinRate, autoTopN: v.autoTopN },
      progress: stats,
      eligible,
    };
  }

  async claim(userId: number) {
    const s = await this.status(userId);
    if (!s.enabled) throw new AppError(403, 'disabled', 'The verified badge is not available right now');
    if (s.verified) throw new AppError(409, 'already_verified', 'You are already verified');
    if (!s.eligible)
      throw new AppError(403, 'not_eligible', `Play at least ${s.requirements.matches} real matches this month with a ${s.requirements.winRate}% win rate to unlock it`);
    await tx(async (conn) => {
      await this.progression.spendCoins(conn, userId, s.price, 'verified_badge', null);
      await exec(`UPDATE user_profiles SET verified_at = UTC_TIMESTAMP(), verified_source = 'purchase' WHERE user_id = ? AND verified_at IS NULL`, [userId], conn);
    });
    await this.progression.pushAccount(userId);
    return { ok: true };
  }

  async setByAdmin(userId: number, verified: boolean) {
    await exec(
      verified
        ? `UPDATE user_profiles SET verified_at = COALESCE(verified_at, UTC_TIMESTAMP()), verified_source = 'admin' WHERE user_id = ?`
        : `UPDATE user_profiles SET verified_at = NULL, verified_source = NULL WHERE user_id = ?`,
      [userId],
    );
  }

  /** Daily: the monthly leaderboard's best eligible players are verified automatically. */
  async autoGrant() {
    const v = this.settings().verified;
    if (!v.enabled || v.autoTopN <= 0) return 0;
    const top = await query<{ user_id: number }>(
      `SELECT l.user_id FROM leaderboards l JOIN user_profiles p ON p.user_id = l.user_id JOIN users u ON u.id = l.user_id
       WHERE l.board = ? AND u.status = 'active' AND p.verified_at IS NULL ORDER BY l.score DESC LIMIT ?`,
      [`monthly:${bdMonthKey()}`, v.autoTopN * 3],
    );
    let granted = 0;
    for (const r of top) {
      if (granted >= v.autoTopN) break;
      const s = await this.monthlyStats(r.user_id);
      if (s.played < v.minMonthlyMatches || s.winRate < v.minMonthlyWinRate) continue;
      const res = await exec(`UPDATE user_profiles SET verified_at = UTC_TIMESTAMP(), verified_source = 'auto' WHERE user_id = ? AND verified_at IS NULL`, [r.user_id]);
      if (res.affectedRows !== 1) continue;
      granted++;
      await this.notifications
        .notify(r.user_id, {
          type: 'achievement',
          title: { en: 'You are now Verified!', bn: 'আপনি এখন ভেরিফায়েড!' },
          body: { en: 'Your win rate put you among the best players. The badge now shows next to your name.', bn: 'উচ্চ জয়ের হারের জন্য আপনি সেরা প্লেয়ারদের একজন। এখন আপনার নামের পাশে ভেরিফায়েড ব্যাজ দেখাবে।' },
          url: '/profile',
        })
        .catch(() => undefined);
    }
    return granted;
  }
}
