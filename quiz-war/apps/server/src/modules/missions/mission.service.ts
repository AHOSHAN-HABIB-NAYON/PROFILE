import { z } from 'zod';
import { exec, query, queryOne, tx } from '../../db/pool';
import { AppError, notFound } from '../../lib/errors';
import { bdDateKey, bdWeekKey } from '../../lib/time';
import type { LiveMatch, LivePlayer } from '../../game/types';
import type { NotificationService, UserEmitter } from '../notifications/notification.service';
import type { MatchOutcome, ProgressionService } from '../progression/progression.service';

export const MISSION_METRICS = {
  matches: 'Matches played (any mode)',
  battles: 'Battles played',
  battle_wins: 'Battles won',
  pvp_wins: 'Online (PvP) battles won',
  ai_wins: 'Battles won against AI',
  friend_battles: 'Matches with friends (challenge / War Room)',
  correct_answers: 'Correct answers',
  fast_answers: 'Fast correct answers',
  perfect_match: 'Perfect matches (all correct, 5+ questions)',
  daily_challenge: 'Daily Challenges completed',
} as const;
export type MissionMetric = keyof typeof MISSION_METRICS;

export const missionInputSchema = z.object({
  title: z.string().trim().min(2).max(100),
  description: z.string().trim().max(300).nullable().optional(),
  icon: z.string().trim().max(30).default('target'),
  period: z.enum(['daily', 'weekly', 'once']),
  metric: z.enum(Object.keys(MISSION_METRICS) as [MissionMetric, ...MissionMetric[]]),
  target: z.number().int().min(1).max(100000),
  rewardCoins: z.number().int().min(0).max(100000),
  rewardXp: z.number().int().min(0).max(100000),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});
export type MissionInput = z.infer<typeof missionInputSchema>;

const periodKey = (period: string) => (period === 'daily' ? bdDateKey() : period === 'weekly' ? bdWeekKey() : 'once');

/**
 * Daily / weekly / one-time missions. Progress comes only from server-side match results, a
 * completed mission notifies the player, and the reward is claimed once per period
 * (idempotent through user_rewards).
 */
export class MissionService {
  constructor(
    private readonly progression: ProgressionService,
    private readonly notifications: NotificationService,
    private readonly emitter: () => UserEmitter | null,
  ) {}

  /** What a finished match counts towards, per metric. */
  static increments(m: LiveMatch, p: LivePlayer, outcome: MatchOutcome): Partial<Record<MissionMetric, number>> {
    if (outcome === 'abandoned') return {};
    const battle = m.mode.kind === 'battle';
    const win = outcome === 'win';
    return {
      matches: 1,
      battles: battle ? 1 : 0,
      battle_wins: battle && win ? 1 : 0,
      pvp_wins: battle && win && m.type === 'pvp' ? 1 : 0,
      ai_wins: battle && win && m.type === 'ai' ? 1 : 0,
      friend_battles: battle && (m.source === 'challenge' || m.source === 'room') ? 1 : 0,
      correct_answers: p.correct,
      fast_answers: p.fastAnswers,
      perfect_match: p.answeredCount >= 5 && p.correct === p.answeredCount && p.answers.size === p.answeredCount ? 1 : 0,
      daily_challenge: m.mode.key === 'daily' ? 1 : 0,
    };
  }

  async recordMatch(m: LiveMatch, p: LivePlayer, outcome: MatchOutcome) {
    const inc = MissionService.increments(m, p, outcome);
    const metrics = Object.entries(inc).filter(([, v]) => (v ?? 0) > 0) as [MissionMetric, number][];
    if (!metrics.length) return;
    const missions = await query<any>(
      `SELECT id, title, period, metric, target, reward_coins, reward_xp FROM missions WHERE is_active = 1 AND deleted_at IS NULL AND metric IN (?)`,
      [metrics.map(([k]) => k)],
    );
    let completed = 0;
    for (const ms of missions) {
      const key = periodKey(ms.period);
      const add = inc[ms.metric as MissionMetric] ?? 0;
      await exec(
        `INSERT INTO user_missions (user_id, mission_id, period_key, progress) VALUES (?, ?, ?, LEAST(?, ?))
         ON DUPLICATE KEY UPDATE progress = LEAST(progress + VALUES(progress), ?)`,
        [p.userId, ms.id, key, add, ms.target, ms.target],
      );
      const done = await exec(
        `UPDATE user_missions SET completed_at = UTC_TIMESTAMP() WHERE user_id = ? AND mission_id = ? AND period_key = ? AND completed_at IS NULL AND progress >= ?`,
        [p.userId, ms.id, key, ms.target],
      );
      if (done.affectedRows === 1) {
        completed++;
        const rewardEn = [ms.reward_coins ? `${ms.reward_coins} coins` : '', ms.reward_xp ? `${ms.reward_xp} XP` : ''].filter(Boolean).join(' + ');
        const reward = [ms.reward_coins ? `${ms.reward_coins} কয়েন` : '', ms.reward_xp ? `${ms.reward_xp} XP` : ''].filter(Boolean).join(' + ');
        await this.notifications.notify(p.userId, {
          type: 'mission',
          title: { en: 'Mission complete! Claim your reward', bn: 'মিশন সম্পূর্ণ! রিওয়ার্ড Claim করুন' },
          body: { en: `"${ms.title}" is done. Claim ${rewardEn} now.`, bn: `"${ms.title}" শেষ হয়েছে। ${reward} নিতে এখনই Claim করুন।` },
          url: '/shop?tab=missions',
        });
      }
    }
    if (completed) this.emitter()?.toUser(p.userId, 'missions:update', { claimable: await this.claimableCount(p.userId) });
  }

  async claimableCount(userId: number) {
    const missions = await query<any>('SELECT id, period FROM missions WHERE is_active = 1 AND deleted_at IS NULL');
    if (!missions.length) return 0;
    const pairs = missions.map((ms) => [ms.id, periodKey(ms.period)]);
    const row = await queryOne<{ n: number }>(
      `SELECT COUNT(*) n FROM user_missions WHERE user_id = ? AND completed_at IS NOT NULL AND claimed_at IS NULL AND (mission_id, period_key) IN (?)`,
      [userId, pairs],
    );
    return Number(row?.n ?? 0);
  }

  /** The player's missions for the current day / week plus one-time ones. */
  async list(userId: number) {
    const missions = await query<any>(
      `SELECT id, title, description, icon, period, metric, target, reward_coins AS rewardCoins, reward_xp AS rewardXp
       FROM missions WHERE is_active = 1 AND deleted_at IS NULL ORDER BY FIELD(period, 'daily', 'weekly', 'once'), sort_order, id`,
    );
    const rows = missions.length
      ? await query<any>(`SELECT mission_id, period_key, progress, completed_at, claimed_at FROM user_missions WHERE user_id = ? AND mission_id IN (?)`, [
          userId,
          missions.map((m) => m.id),
        ])
      : [];
    const items = missions
      .map((ms) => {
        const key = periodKey(ms.period);
        const r = rows.find((x) => Number(x.mission_id) === ms.id && x.period_key === key);
        const progress = Math.min(Number(r?.progress ?? 0), ms.target);
        return { ...ms, progress, completed: !!r?.completed_at, claimed: !!r?.claimed_at };
      })
      // A claimed one-time mission is finished for good.
      .filter((ms) => !(ms.period === 'once' && ms.claimed));
    return { items, claimable: items.filter((i) => i.completed && !i.claimed).length };
  }

  async claim(userId: number, missionId: number) {
    const ms = await queryOne<any>('SELECT id, title, period, reward_coins, reward_xp FROM missions WHERE id = ? AND is_active = 1 AND deleted_at IS NULL', [missionId]);
    if (!ms) throw notFound('Mission not found');
    const key = periodKey(ms.period);
    const reward = await tx(async (conn) => {
      const um = await queryOne<any>(
        'SELECT completed_at, claimed_at FROM user_missions WHERE user_id = ? AND mission_id = ? AND period_key = ? FOR UPDATE',
        [userId, missionId, key],
        conn,
      );
      if (!um?.completed_at) throw new AppError(400, 'mission_incomplete', 'Complete the mission first');
      if (um.claimed_at) throw new AppError(409, 'already_claimed', 'Reward already claimed');
      await this.progression.grantReward(userId, 'mission', `${missionId}:${key}`, { coins: ms.reward_coins, xp: ms.reward_xp }, conn);
      await exec('UPDATE user_missions SET claimed_at = UTC_TIMESTAMP() WHERE user_id = ? AND mission_id = ? AND period_key = ?', [userId, missionId, key], conn);
      return { coins: Number(ms.reward_coins), xp: Number(ms.reward_xp) };
    });
    await this.progression.pushAccount(userId);
    return reward;
  }

  /* --------------------------------- Admin -------------------------------- */

  async adminList() {
    const rows = await query<any>(
      `SELECT m.id, m.title, m.description, m.icon, m.period, m.metric, m.target, m.reward_coins AS rewardCoins, m.reward_xp AS rewardXp,
              m.is_active AS isActive, m.sort_order AS sortOrder,
              (SELECT COUNT(*) FROM user_missions um WHERE um.mission_id = m.id AND um.completed_at IS NOT NULL) AS completions,
              (SELECT COUNT(*) FROM user_missions um WHERE um.mission_id = m.id AND um.claimed_at IS NOT NULL) AS claims
       FROM missions m WHERE m.deleted_at IS NULL ORDER BY FIELD(m.period, 'daily', 'weekly', 'once'), m.sort_order, m.id`,
    );
    return rows.map((r) => ({ ...r, isActive: !!r.isActive, completions: Number(r.completions), claims: Number(r.claims) }));
  }

  private values(b: MissionInput) {
    return [b.title, b.description ?? null, b.icon, b.period, b.metric, b.target, b.rewardCoins, b.rewardXp, b.isActive ? 1 : 0, b.sortOrder];
  }

  async create(b: MissionInput) {
    const res = await exec(
      `INSERT INTO missions (title, description, icon, period, metric, target, reward_coins, reward_xp, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      this.values(b),
    );
    return res.insertId;
  }

  async update(id: number, b: MissionInput) {
    const res = await exec(
      `UPDATE missions SET title = ?, description = ?, icon = ?, period = ?, metric = ?, target = ?, reward_coins = ?, reward_xp = ?, is_active = ?, sort_order = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [...this.values(b), id],
    );
    if (!res.affectedRows) throw notFound('Mission not found');
  }

  async remove(id: number) {
    await exec('UPDATE missions SET deleted_at = UTC_TIMESTAMP(), is_active = 0 WHERE id = ?', [id]);
  }
}
