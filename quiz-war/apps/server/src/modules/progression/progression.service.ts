import { levelFromXp, ratingDelta, type PlayerResult, type PowerUp } from '@quizwar/shared';
import type { PoolConnection } from 'mysql2/promise';
import { exec, query, queryOne, tx, type Conn } from '../../db/pool';
import { AppError } from '../../lib/errors';
import { addDays, bdDateKey, bdMonthKey, bdWeekKey, toDateKey } from '../../lib/time';
import type { LiveMatch, LivePlayer, PowerUpWallet, RewardHandler } from '../../game/types';
import type { SeasonService } from '../leaderboard/season.service';
import type { NotificationService, UserEmitter } from '../notifications/notification.service';
import type { SettingsService } from '../settings/settings.service';

export interface UnlockedAchievement {
  key: string;
  name: string;
  icon: string;
}

const POWER_UP_ITEM: Record<PowerUp, string> = {
  fifty_fifty: 'pu_fifty_fifty',
  time_boost: 'pu_time_boost',
  double_score: 'pu_double_score',
  hint: 'pu_hint',
};

/**
 * The server-authoritative economy: XP, levels, coins, rating, leagues, streaks, daily rewards
 * and achievements. Every balance change happens inside a DB transaction with row locks and is
 * recorded (coin_transactions / user_rewards) so nothing can be granted twice.
 */
type Extra = { fineCoins?: number; fineXp?: number; bonusCoins?: number };
export type MatchOutcome = 'win' | 'loss' | 'draw' | 'abandoned' | 'completed';

export class ProgressionService implements RewardHandler, PowerUpWallet {
  /** Set by the context: mission progress after every human player's result. */
  afterPlayerResult: ((m: LiveMatch, p: LivePlayer, outcome: MatchOutcome) => Promise<void>) | null = null;

  constructor(
    private readonly settings: SettingsService,
    private readonly seasons: SeasonService,
    private readonly notifications: NotificationService,
    private readonly emitter: () => UserEmitter | null,
    private readonly log: { error: (o: object, m: string) => void } = { error: () => undefined },
  ) {}

  /* --------------------------------- Coins --------------------------------- */

  async grantCoins(conn: Conn, userId: number, amount: number, reason: string, ref: string | null = null) {
    if (amount === 0) return;
    await exec('UPDATE user_profiles SET coins = coins + ? WHERE user_id = ?', [amount, userId], conn);
    await exec(
      `INSERT INTO coin_transactions (user_id, amount, balance_after, reason, ref) SELECT user_id, ?, coins, ?, ? FROM user_profiles WHERE user_id = ?`,
      [amount, reason, ref, userId],
      conn,
    );
  }

  async spendCoins(conn: PoolConnection, userId: number, amount: number, reason: string, ref: string | null) {
    const res = await exec('UPDATE user_profiles SET coins = coins - ? WHERE user_id = ? AND coins >= ?', [amount, userId, amount], conn);
    if (res.affectedRows !== 1) throw new AppError(400, 'insufficient_coins', 'Not enough coins');
    await exec(
      `INSERT INTO coin_transactions (user_id, amount, balance_after, reason, ref) SELECT user_id, ?, coins, ?, ? FROM user_profiles WHERE user_id = ?`,
      [-amount, reason, ref, userId],
      conn,
    );
  }

  async addXp(conn: Conn, userId: number, amount: number) {
    const row = await queryOne<{ xp: number; level: number }>('SELECT xp, level FROM user_profiles WHERE user_id = ? FOR UPDATE', [userId], conn);
    if (!row) return { levelBefore: 1, levelAfter: 1, xp: 0 };
    const xp = Number(row.xp) + Math.max(0, amount);
    const levelAfter = levelFromXp(xp, this.settings.game().levels).level;
    await exec('UPDATE user_profiles SET xp = ?, level = ? WHERE user_id = ?', [xp, levelAfter, userId], conn);
    return { levelBefore: row.level, levelAfter, xp };
  }

  async addItem(conn: Conn, userId: number, itemKey: string, qty: number) {
    await exec(
      `INSERT INTO user_inventory (user_id, item_key, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
      [userId, itemKey, qty],
      conn,
    );
  }

  /** PowerUpWallet: atomically consume one power-up from inventory. */
  async consume(userId: number, powerUp: PowerUp): Promise<boolean> {
    const res = await exec('UPDATE user_inventory SET quantity = quantity - 1 WHERE user_id = ? AND item_key = ? AND quantity > 0', [
      userId,
      POWER_UP_ITEM[powerUp],
    ]);
    return res.affectedRows === 1;
  }

  async powerUpInventory(userId: number): Promise<Record<PowerUp, number>> {
    const rows = await query<{ item_key: string; quantity: number }>(`SELECT item_key, quantity FROM user_inventory WHERE user_id = ? AND item_key LIKE 'pu\\_%'`, [userId]);
    const out = { fifty_fifty: 0, time_boost: 0, double_score: 0, hint: 0 } as Record<PowerUp, number>;
    for (const [pu, key] of Object.entries(POWER_UP_ITEM)) out[pu as PowerUp] = Number(rows.find((r) => r.item_key === key)?.quantity ?? 0);
    return out;
  }

  /**
   * Idempotent reward: (user, source, sourceKey) can only ever be granted once.
   * Returns false if it was already granted.
   */
  async grantReward(
    userId: number,
    source: string,
    sourceKey: string,
    r: { coins?: number; xp?: number; itemKey?: string; itemQty?: number },
    conn?: PoolConnection,
  ): Promise<boolean> {
    const run = async (c: PoolConnection) => {
      const ins = await exec(
        `INSERT IGNORE INTO user_rewards (user_id, source, source_key, coins, xp, item_key, item_qty) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, source, sourceKey, r.coins ?? 0, r.xp ?? 0, r.itemKey ?? null, r.itemQty ?? 0],
        c,
      );
      if (ins.affectedRows !== 1) return false;
      if (r.coins) await this.grantCoins(c, userId, r.coins, source, sourceKey);
      if (r.xp) await this.addXp(c, userId, r.xp);
      if (r.itemKey && r.itemQty) await this.addItem(c, userId, r.itemKey, r.itemQty);
      return true;
    };
    return conn ? run(conn) : tx(run);
  }

  /* --------------------------------- Streak -------------------------------- */

  /** Marks the player active today (BD time); maintains the daily streak and milestone rewards. */
  async touchActivity(userId: number): Promise<{ streakDays: number; milestone: { days: number; coins: number; xp: number } | null }> {
    const today = bdDateKey();
    const result = await tx(async (conn) => {
      const p = await queryOne<{ last_active_date: unknown; streak_days: number; best_streak_days: number }>(
        'SELECT last_active_date, streak_days, best_streak_days FROM user_profiles WHERE user_id = ? FOR UPDATE',
        [userId],
        conn,
      );
      if (!p) return { streakDays: 0, milestone: null };
      const last = toDateKey(p.last_active_date);
      if (last === today) return { streakDays: p.streak_days, milestone: null };
      const streak = last === addDays(today, -1) ? p.streak_days + 1 : 1;
      await exec('UPDATE user_profiles SET last_active_date = ?, streak_days = ?, best_streak_days = GREATEST(best_streak_days, ?) WHERE user_id = ?', [
        today,
        streak,
        streak,
        userId,
      ], conn);
      const milestone = this.settings.game().rewards.streakMilestones.find((m) => m.days === streak) ?? null;
      if (milestone) await this.grantReward(userId, 'streak', `${streak}:${today}`, { coins: milestone.coins, xp: milestone.xp }, conn);
      return { streakDays: streak, milestone };
    });
    if (result.milestone) {
      await this.notifications.notify(userId, {
        type: 'streak',
        title: { en: `${result.streakDays}-day streak!`, bn: `টানা ${result.streakDays} দিন!` },
        body: { en: `You earned ${result.milestone.coins} coins and ${result.milestone.xp} XP.`, bn: `আপনি ${result.milestone.coins} কয়েন আর ${result.milestone.xp} XP পেয়েছেন।` },
        data: { milestone: result.streakDays },
        url: '/profile',
      });
    }
    return result;
  }

  /* ------------------------------ Daily reward ------------------------------ */

  async dailyRewardStatus(userId: number) {
    const p = await queryOne<{ daily_reward_day: number; last_daily_reward_date: unknown }>(
      'SELECT daily_reward_day, last_daily_reward_date FROM user_profiles WHERE user_id = ?',
      [userId],
    );
    const ladder = this.settings.game().rewards.dailyLogin;
    const today = bdDateKey();
    const last = toDateKey(p?.last_daily_reward_date);
    const claimedToday = last === today;
    const continuing = last === addDays(today, -1);
    const currentDay = claimedToday ? p!.daily_reward_day : continuing ? (p!.daily_reward_day % ladder.length) + 1 : 1;
    return { ladder, claimedToday, day: currentDay };
  }

  async claimDailyReward(userId: number) {
    const today = bdDateKey();
    const ladder = this.settings.game().rewards.dailyLogin;
    const granted = await tx(async (conn) => {
      const p = await queryOne<{ daily_reward_day: number; last_daily_reward_date: unknown }>(
        'SELECT daily_reward_day, last_daily_reward_date FROM user_profiles WHERE user_id = ? FOR UPDATE',
        [userId],
        conn,
      );
      if (!p) throw new AppError(404, 'not_found', 'Profile not found');
      const last = toDateKey(p.last_daily_reward_date);
      if (last === today) throw new AppError(409, 'already_claimed', 'You already claimed today’s reward');
      const day = last === addDays(today, -1) ? (p.daily_reward_day % ladder.length) + 1 : 1;
      const step = ladder[day - 1];
      const reward: { coins?: number; xp?: number; itemKey?: string; itemQty?: number } = {};
      let label = '';
      if (step.type === 'coins') {
        reward.coins = step.amount;
        label = `${step.amount} Coins`;
      } else if (step.type === 'xp') {
        reward.xp = step.amount;
        label = `${step.amount} XP`;
      } else if (step.type === 'power_up') {
        reward.itemKey = POWER_UP_ITEM[step.powerUp ?? 'fifty_fifty'];
        reward.itemQty = Math.max(1, step.amount);
        label = `${reward.itemQty}× power-up`;
      } else {
        // Mystery: server-side random — coins or a random power-up.
        if (Math.random() < 0.6) {
          reward.coins = Math.round(step.amount * (0.6 + Math.random() * 0.9));
          label = `${reward.coins} Coins`;
        } else {
          const pus = Object.values(POWER_UP_ITEM);
          reward.itemKey = pus[Math.floor(Math.random() * pus.length)];
          reward.itemQty = 2;
          label = '2× power-up';
        }
      }
      const ok = await this.grantReward(userId, 'daily_login', today, reward, conn);
      if (!ok) throw new AppError(409, 'already_claimed', 'You already claimed today’s reward');
      await exec('UPDATE user_profiles SET daily_reward_day = ?, last_daily_reward_date = ? WHERE user_id = ?', [day, today, userId], conn);
      return { day, type: step.type, label, ...reward };
    });
    await this.touchActivity(userId);
    await this.pushAccount(userId);
    return granted;
  }

  /* ------------------------------ Achievements ------------------------------ */

  async checkAchievements(userId: number): Promise<UnlockedAchievement[]> {
    const p = await queryOne<Record<string, number>>(
      `SELECT wins, total_correct, best_win_streak, total_games, peak_rating, fast_answers, level, daily_challenges_done, best_streak_days
       FROM user_profiles WHERE user_id = ?`,
      [userId],
    );
    if (!p) return [];
    const candidates = await query<any>(
      `SELECT a.id, a.ach_key, a.name, a.icon, a.metric, a.threshold, a.reward_coins, a.reward_xp FROM achievements a
       LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = ?
       WHERE a.is_active = 1 AND ua.user_id IS NULL`,
      [userId],
    );
    const unlocked: UnlockedAchievement[] = [];
    for (const a of candidates) {
      const value = Number(p[a.metric] ?? 0);
      if (value < a.threshold) continue;
      const ok = await tx(async (conn) => {
        const ins = await exec('INSERT IGNORE INTO user_achievements (user_id, achievement_id) VALUES (?, ?)', [userId, a.id], conn);
        if (ins.affectedRows !== 1) return false;
        if (a.reward_coins || a.reward_xp) await this.grantReward(userId, 'achievement', a.ach_key, { coins: a.reward_coins, xp: a.reward_xp }, conn);
        return true;
      });
      if (ok) {
        unlocked.push({ key: a.ach_key, name: a.name, icon: a.icon });
        await this.notifications.notify(userId, {
          type: 'achievement',
          title: { en: 'Achievement unlocked!', bn: 'নতুন অ্যাচিভমেন্ট!' },
          body: { en: `${a.name}${a.reward_coins ? ` · +${a.reward_coins} coins` : ''}`, bn: `${a.name}${a.reward_coins ? ` · +${a.reward_coins} কয়েন` : ''}` },
          data: { achievement: a.ach_key },
          url: '/profile/achievements',
        });
      }
    }
    return unlocked;
  }

  /* ------------------------------ Match results ----------------------------- */

  async applyMatchResult(m: LiveMatch): Promise<PlayerResult[]> {
    const results: PlayerResult[] = [];
    const humans = m.players.filter((p) => !p.isBot);

    // Team average ratings for Elo (ranked only).
    let teamAvg: number[] = [];
    let rankedAllowed = m.ranked;
    if (m.ranked) {
      const rows = await query<{ user_id: number; rating: number }>('SELECT user_id, rating FROM user_profiles WHERE user_id IN (?)', [humans.map((p) => p.userId)]);
      const r = new Map(rows.map((x) => [Number(x.user_id), x.rating]));
      teamAvg = Array.from({ length: m.mode.teams }, (_, t) => {
        const ps = m.players.filter((p) => p.team === t);
        return ps.reduce((a, p) => a + (r.get(p.userId) ?? p.rating), 0) / Math.max(1, ps.length);
      });
      rankedAllowed = await this.passesBoostingCheck(m);
    }

    // Quit fines: players who left are settled first so the coins actually collected can be
    // shared between the opponents who stayed.
    const pen = this.settings.game().penalties;
    const finesApply = pen.enabled && !!m.startedAt && m.mode.kind === 'battle' && (m.type === 'pvp' || (pen.applyToAiMatches && m.type === 'ai'));
    let collected = 0;
    const order = [...m.players].sort((a, b) => Number(b.forfeited) - Number(a.forfeited));
    const byUser = new Map<number, PlayerResult>();
    const stayers = humans.filter((p) => !p.forfeited);
    for (const p of order) {
      if (p.isBot) {
        byUser.set(p.userId, this.botResult(p, m));
        continue;
      }
      let extra: Extra = {};
      if (finesApply && p.forfeited) extra = { fineCoins: pen.quitCoins, fineXp: pen.quitXp };
      else if (finesApply && pen.giveCoinsToOpponents && collected > 0) {
        const quitterTeams = new Set(m.players.filter((x) => x.forfeited && !x.isBot).map((x) => x.team));
        const receivers = stayers.filter((x) => !quitterTeams.has(x.team) || m.mode.teams < 2);
        if (receivers.includes(p)) extra = { bonusCoins: Math.floor(collected / receivers.length) };
      }
      try {
        const r = await this.applyForPlayer(m, p, teamAvg, rankedAllowed, extra);
        collected += r.penaltyCoins ?? 0;
        byUser.set(p.userId, r);
      } catch (err) {
        // Never let one player's failure block everyone else's result.
        this.log.error({ err, matchId: m.id, userId: p.userId }, 'failed to apply match result');
        byUser.set(p.userId, { ...this.botResult(p, m), isBot: false });
      }
    }
    for (const p of m.players) results.push(byUser.get(p.userId)!);
    return results;
  }

  private botResult(p: LivePlayer, _m: LiveMatch): PlayerResult {
    return {
      userId: p.userId,
      team: p.team,
      isBot: true,
      score: p.score,
      correct: p.correct,
      answered: p.answeredCount,
      bestCombo: p.bestCombo,
      avgResponseMs: p.answeredCount ? Math.round(p.totalResponseMs / p.answeredCount) : null,
      xpGained: 0,
      coinsGained: 0,
      ratingBefore: null,
      ratingAfter: null,
      levelBefore: p.level,
      levelAfter: p.level,
      leagueBefore: null,
      leagueAfter: null,
      achievements: [],
    };
  }

  /** Anti-boosting: the same pair farming ranked games against each other gets no rating. */
  private async passesBoostingCheck(m: LiveMatch): Promise<boolean> {
    if (m.mode.key !== 'duel') return true;
    const [a, b] = m.players.filter((p) => !p.isBot).map((p) => p.userId);
    if (!a || !b) return true;
    const row = await queryOne<{ n: number }>(
      `SELECT COUNT(DISTINCT mt.id) n FROM match_players p1
       JOIN match_players p2 ON p2.match_id = p1.match_id AND p2.user_id = ?
       JOIN matches mt ON mt.id = p1.match_id
       WHERE p1.user_id = ? AND mt.ranked = 1 AND mt.status = 'finished' AND mt.id <> ? AND mt.ended_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)`,
      [b, a, m.id],
    );
    const ok = Number(row?.n ?? 0) < this.settings.game().ranked.sameOpponentDailyLimit;
    if (!ok && !m.flags.includes('repeat_opponent')) m.flags.push('repeat_opponent');
    return ok;
  }

  private outcome(m: LiveMatch, p: LivePlayer): 'win' | 'loss' | 'draw' | 'abandoned' | 'completed' {
    if (p.forfeited) return 'abandoned';
    if (m.mode.kind === 'solo') return 'completed';
    if (m.winnerTeam === null) return 'draw';
    return m.winnerTeam === p.team ? 'win' : 'loss';
  }

  private async applyForPlayer(m: LiveMatch, p: LivePlayer, teamAvg: number[], rankedAllowed: boolean, extra: Extra = {}): Promise<PlayerResult> {
    const s = this.settings.game();
    const r = s.rewards;
    const outcome = this.outcome(m, p);
    let xp = 0;
    let coins = 0;
    if (outcome !== 'abandoned') {
      if (m.mode.kind === 'battle') {
        const base = p.correct * r.xpPerCorrect + (outcome === 'win' ? r.xpWin : outcome === 'draw' ? r.xpDraw : r.xpLoss);
        const c = outcome === 'win' ? r.coinsWin : outcome === 'draw' ? r.coinsDraw : r.coinsLoss;
        const factor = m.type === 'ai' ? r.aiRewardFactor : 1;
        xp = Math.round(base * factor);
        coins = Math.round(c * factor);
      } else if (m.mode.key !== 'daily') {
        xp = Math.round((p.correct * r.xpPerCorrect + r.xpLoss) * r.soloRewardFactor);
        coins = Math.round(r.coinsLoss * r.soloRewardFactor + p.correct * r.soloRewardFactor * 2);
      }
    }

    const leagueKeys = s.ranked.leagues;
    const res = await tx(async (conn) => {
      const prof = await queryOne<any>(
        `SELECT xp, level, coins, rating, peak_rating, league, current_win_streak FROM user_profiles WHERE user_id = ? FOR UPDATE`,
        [p.userId],
        conn,
      );
      if (!prof) throw new Error(`profile ${p.userId} missing`);
      // Fines never push a balance below zero and never drop the player a level.
      const penaltyCoins = Math.min(extra.fineCoins ?? 0, Math.max(0, Number(prof.coins)));
      const penaltyXp = Math.min(extra.fineXp ?? 0, levelFromXp(Number(prof.xp), s.levels).intoLevel);
      const bonusCoins = extra.bonusCoins ?? 0;
      const ratingBefore: number = prof.rating;
      let ratingAfter = ratingBefore;
      if (m.ranked && rankedAllowed && (outcome === 'win' || outcome === 'loss' || outcome === 'draw' || outcome === 'abandoned')) {
        const opp = teamAvg.filter((_, t) => t !== p.team);
        const oppAvg = opp.reduce((a, b) => a + b, 0) / Math.max(1, opp.length);
        const resultValue = outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
        const delta = ratingDelta(teamAvg[p.team] ?? ratingBefore, oppAvg, resultValue as 0 | 0.5 | 1, s.ranked.kFactor);
        ratingAfter = Math.max(s.ranked.minRating, ratingBefore + delta);
      }
      const leagueBefore = prof.league as string;
      const leagueAfter = this.seasons.leagueFor(ratingAfter).key;
      const totalXp = Number(prof.xp) + xp - penaltyXp;
      const levelAfter = levelFromXp(totalXp, s.levels).level;
      const win = outcome === 'win';
      const counted = m.mode.kind === 'battle';
      const winStreak = counted ? (win ? prof.current_win_streak + 1 : outcome === 'draw' ? prof.current_win_streak : 0) : prof.current_win_streak;

      await exec(
        `UPDATE user_profiles SET
           xp = ?, level = ?, coins = coins + ?, rating = ?, peak_rating = GREATEST(peak_rating, ?), league = ?,
           wins = wins + ?, losses = losses + ?, draws = draws + ?, total_games = total_games + 1,
           total_correct = total_correct + ?, total_answered = total_answered + ?, fast_answers = fast_answers + ?,
           best_score = GREATEST(best_score, ?), current_win_streak = ?, best_win_streak = GREATEST(best_win_streak, ?),
           best_survival = GREATEST(best_survival, ?), best_speed = GREATEST(best_speed, ?),
           daily_challenges_done = daily_challenges_done + ?
         WHERE user_id = ?`,
        [
          totalXp,
          levelAfter,
          coins + bonusCoins - penaltyCoins,
          ratingAfter,
          ratingAfter,
          leagueAfter,
          counted && win ? 1 : 0,
          counted && (outcome === 'loss' || outcome === 'abandoned') ? 1 : 0,
          counted && outcome === 'draw' ? 1 : 0,
          p.correct,
          p.answeredCount,
          p.fastAnswers,
          p.score,
          winStreak,
          winStreak,
          m.mode.key === 'survival' ? p.correct : 0,
          m.mode.key === 'speed' ? p.score : 0,
          m.mode.key === 'daily' && outcome !== 'abandoned' ? 1 : 0,
          p.userId,
        ],
        conn,
      );
      for (const [amount, reason] of [
        [coins, 'match'],
        [bonusCoins, 'opponent_quit'],
        [-penaltyCoins, 'quit_penalty'],
      ] as const) {
        if (!amount) continue;
        await exec(
          `INSERT INTO coin_transactions (user_id, amount, balance_after, reason, ref) SELECT user_id, ?, coins, ?, ? FROM user_profiles WHERE user_id = ?`,
          [amount, reason, m.id, p.userId],
          conn,
        );
      }
      if (p.matchPlayerId) {
        await exec(`UPDATE match_players SET result = ?, xp_gained = ?, coins_gained = ?, rating_before = ?, rating_after = ? WHERE id = ?`, [
          outcome,
          xp,
          coins,
          ratingBefore,
          ratingAfter,
          p.matchPlayerId,
        ], conn);
      }
      const seasonId = this.seasons.currentId();
      if (m.ranked && ratingAfter !== ratingBefore) {
        await exec(`INSERT INTO ratings (user_id, season_id, match_id, rating_before, rating_after, delta) VALUES (?, ?, ?, ?, ?, ?)`, [
          p.userId,
          seasonId,
          m.id,
          ratingBefore,
          ratingAfter,
          ratingAfter - ratingBefore,
        ], conn);
      }
      if (m.ranked && seasonId) {
        await exec(
          `INSERT INTO season_ratings (season_id, user_id, rating, peak_rating, league, wins, losses, draws) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE rating = VALUES(rating), peak_rating = GREATEST(peak_rating, VALUES(rating)), league = VALUES(league),
             wins = wins + VALUES(wins), losses = losses + VALUES(losses), draws = draws + VALUES(draws)`,
          [seasonId, p.userId, ratingAfter, ratingAfter, leagueAfter, win ? 1 : 0, outcome === 'loss' || outcome === 'abandoned' ? 1 : 0, outcome === 'draw' ? 1 : 0],
          conn,
        );
      }
      // Period leaderboards use server-computed XP, so they can't be inflated by a client.
      if (xp > 0) {
        const boards = [`weekly:${bdWeekKey()}`, `monthly:${bdMonthKey()}`];
        if (m.categoryId) boards.push(`category:${m.categoryId}`);
        for (const board of boards) {
          await exec(
            `INSERT INTO leaderboards (board, user_id, score, games, wins) VALUES (?, ?, ?, 1, ?)
             ON DUPLICATE KEY UPDATE score = score + VALUES(score), games = games + 1, wins = wins + VALUES(wins)`,
            [board, p.userId, xp, win ? 1 : 0],
            conn,
          );
        }
        const squad = await queryOne<{ squad_id: number }>('SELECT squad_id FROM squad_members WHERE user_id = ?', [p.userId], conn);
        if (squad) {
          await exec('UPDATE squads SET xp = xp + ? WHERE id = ?', [xp, squad.squad_id], conn);
          await exec('UPDATE squad_members SET contributed_xp = contributed_xp + ? WHERE squad_id = ? AND user_id = ?', [xp, squad.squad_id, p.userId], conn);
        }
      }
      return { ratingBefore, ratingAfter, leagueBefore, leagueAfter, levelBefore: prof.level as number, levelAfter, penaltyCoins, penaltyXp, bonusCoins };
    });

    if (res.penaltyCoins || res.penaltyXp) {
      await this.notifications.notify(p.userId, {
        type: 'penalty',
        title: { en: 'Penalty for leaving a match', bn: 'ম্যাচ ছেড়ে যাওয়ার জরিমানা' },
        body: {
          en: `You left a match before it ended: ${res.penaltyCoins} coins and ${res.penaltyXp} XP were deducted.`,
          bn: `ম্যাচ শেষ না করে বের হয়ে যাওয়ায় ${res.penaltyCoins} কয়েন ও ${res.penaltyXp} XP কাটা হয়েছে।`,
        },
        url: '/history',
      });
    }
    if (res.bonusCoins) {
      await this.notifications.notify(p.userId, {
        type: 'reward',
        title: { en: `+${res.bonusCoins} bonus coins`, bn: `+${res.bonusCoins} কয়েন বোনাস` },
        body: { en: 'Your opponent left the match — you received their penalty coins.', bn: 'প্রতিপক্ষ ম্যাচ ছেড়ে যাওয়ায় তার জরিমানার কয়েন আপনি পেয়েছেন।' },
        url: '/history',
      });
    }
    await this.afterPlayerResult?.(m, p, outcome).catch((err) => this.log.error({ err, userId: p.userId }, 'mission progress failed'));

    if (outcome !== 'abandoned') await this.touchActivity(p.userId).catch(() => undefined);
    const achievements = await this.checkAchievements(p.userId).catch(() => []);

    if (res.leagueAfter !== res.leagueBefore && m.ranked) {
      const league = leagueKeys.find((l) => l.key === res.leagueAfter);
      const up = res.ratingAfter > res.ratingBefore;
      await this.notifications.notify(p.userId, {
        type: 'rank',
        title: up ? { en: `Promoted to ${league?.name}!`, bn: `${league?.name} লীগে উন্নীত!` } : { en: `Your league changed to ${league?.name}`, bn: `আপনার লীগ এখন ${league?.name}` },
        body: up ? { en: 'Your rank changed — keep climbing!', bn: 'দারুণ! এভাবেই এগিয়ে চলুন।' } : { en: 'Win ranked battles to climb back up.', bn: 'র‍্যাংকড ব্যাটল জিতে আবার উপরে উঠুন।' },
        data: { league: res.leagueAfter, up },
        url: '/rank',
      });
    }
    await this.pushAccount(p.userId);

    return {
      userId: p.userId,
      team: p.team,
      isBot: false,
      score: p.score,
      correct: p.correct,
      answered: p.answeredCount,
      bestCombo: p.bestCombo,
      avgResponseMs: p.answeredCount ? Math.round(p.totalResponseMs / p.answeredCount) : null,
      xpGained: xp,
      coinsGained: coins,
      ratingBefore: m.ranked ? res.ratingBefore : null,
      ratingAfter: m.ranked ? res.ratingAfter : null,
      levelBefore: res.levelBefore,
      levelAfter: res.levelAfter,
      leagueBefore: res.leagueBefore,
      leagueAfter: res.leagueAfter,
      achievements,
      penaltyCoins: res.penaltyCoins,
      penaltyXp: res.penaltyXp,
      bonusCoins: res.bonusCoins,
    };
  }

  async pushAccount(userId: number) {
    const p = await queryOne<{ coins: number; xp: number; level: number; rating: number }>('SELECT coins, xp, level, rating FROM user_profiles WHERE user_id = ?', [userId]);
    if (p) this.emitter()?.toUser(userId, 'account:update', { coins: Number(p.coins), xp: Number(p.xp), level: p.level, rating: p.rating });
  }
}
