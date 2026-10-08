import type { GameSettings } from '@quizwar/shared';
import { exec, parseJson, query, queryOne } from '../../db/pool';
import { AppError, conflict } from '../../lib/errors';
import { bdDateKey } from '../../lib/time';
import type { GameEngine } from '../../game/engine';
import type { LiveMatch, PlayerIdentity } from '../../game/types';
import type { ProgressionService } from '../progression/progression.service';

/**
 * Daily Challenge: the same question set for everybody on a given (Bangladesh) date.
 * One attempt per player per day — enforced by the (challenge_id, user_id) primary key.
 */
export class DailyChallengeService {
  constructor(
    private readonly engine: GameEngine,
    private readonly settings: () => GameSettings,
    private readonly progression: ProgressionService,
  ) {}

  async today() {
    const date = bdDateKey();
    let row = await queryOne<any>('SELECT id, challenge_date, question_ids, question_count, total_time_sec FROM daily_challenges WHERE challenge_date = ?', [date]);
    if (!row) {
      const s = this.settings().dailyChallenge;
      // Balanced mix of difficulties drawn from all active categories.
      const ids = await query<{ id: number }>(
        `SELECT q.id FROM questions q JOIN categories c ON c.id = q.category_id
         WHERE q.is_active = 1 AND q.deleted_at IS NULL AND c.is_active = 1 AND c.deleted_at IS NULL
         ORDER BY RAND() LIMIT ?`,
        [s.questionCount],
      );
      if (ids.length < 5) throw new AppError(503, 'daily_unavailable', 'Daily Challenge is not available yet');
      await exec('INSERT IGNORE INTO daily_challenges (challenge_date, question_ids, question_count, total_time_sec) VALUES (?, ?, ?, ?)', [
        date,
        JSON.stringify(ids.map((r) => Number(r.id))),
        ids.length,
        s.totalTimeSec,
      ]);
      row = await queryOne<any>('SELECT id, challenge_date, question_ids, question_count, total_time_sec FROM daily_challenges WHERE challenge_date = ?', [date]);
    }
    return { id: row.id as number, date, questionIds: parseJson<number[]>(row.question_ids) ?? [], questionCount: row.question_count as number, totalTimeSec: row.total_time_sec as number };
  }

  async status(userId: number) {
    const c = await this.today().catch(() => null);
    if (!c) return { available: false };
    const e = await queryOne<any>('SELECT score, correct, status, completed_at FROM daily_challenge_entries WHERE challenge_id = ? AND user_id = ?', [c.id, userId]);
    const players = await queryOne<{ n: number }>(`SELECT COUNT(*) n FROM daily_challenge_entries WHERE challenge_id = ? AND status = 'completed'`, [c.id]);
    return {
      available: true,
      date: c.date,
      questionCount: c.questionCount,
      totalTimeSec: c.totalTimeSec,
      played: !!e,
      result: e ? { score: e.score, correct: e.correct, status: e.status } : null,
      players: Number(players?.n ?? 0),
    };
  }

  async start(user: PlayerIdentity) {
    const c = await this.today();
    const s = this.settings();
    try {
      await exec(`INSERT INTO daily_challenge_entries (challenge_id, user_id, match_id) VALUES (?, ?, '')`, [c.id, user.userId]);
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') throw conflict('You already played today’s challenge. Come back tomorrow!', 'daily_already_played');
      throw err;
    }
    try {
      const m = await this.engine.createMatch({
        mode: 'daily',
        source: 'daily',
        players: [{ ...user, team: 0 }],
        fixedQuestionIds: c.questionIds,
        dailyChallengeId: c.id,
        totalTimeSec: c.totalTimeSec ?? s.dailyChallenge.totalTimeSec,
        autoStart: true,
      });
      await exec('UPDATE daily_challenge_entries SET match_id = ? WHERE challenge_id = ? AND user_id = ?', [m.id, c.id, user.userId]);
      return m;
    } catch (err) {
      await exec('DELETE FROM daily_challenge_entries WHERE challenge_id = ? AND user_id = ? AND match_id = ?', [c.id, user.userId, '']);
      throw err;
    }
  }

  /** Engine hook: record the result, update the daily leaderboard and pay out once. */
  async onMatchFinished(m: LiveMatch) {
    if (!m.dailyChallengeId) return;
    const p = m.players[0];
    if (!p || p.isBot) return;
    const elapsed = m.startsAt && m.finishedAt ? m.finishedAt - m.startsAt : null;
    const upd = await exec(
      `UPDATE daily_challenge_entries SET score = ?, correct = ?, time_ms = ?, status = 'completed', completed_at = UTC_TIMESTAMP()
       WHERE challenge_id = ? AND user_id = ? AND status = 'started'`,
      [p.score, p.correct, elapsed, m.dailyChallengeId, p.userId],
    );
    if (!upd.affectedRows) return;
    const date = bdDateKey(new Date(m.createdAt));
    await exec(`INSERT INTO leaderboards (board, user_id, score, games) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE score = GREATEST(score, VALUES(score))`, [
      `daily:${date}`,
      p.userId,
      p.score,
    ]);
    if (m.state === 'finished' && p.answeredCount > 0) {
      const r = this.settings().rewards;
      await this.progression.grantReward(p.userId, 'daily_challenge', date, { coins: r.dailyChallengeCoins, xp: r.dailyChallengeXp });
      await this.progression.pushAccount(p.userId);
    }
  }
}
