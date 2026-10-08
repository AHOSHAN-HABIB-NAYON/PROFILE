import { exec, tx } from '../db/pool';
import type { AnswerRecord, LiveMatch, LivePlayer, MatchPersistence } from './types';

/** Writes live match state to MySQL. Called on the engine's ordered per-match persist chain. */
export class MysqlMatchPersistence implements MatchPersistence {
  constructor(private readonly seasonId: () => number | null) {}

  async createMatch(m: LiveMatch) {
    await tx(async (conn) => {
      await exec(
        `INSERT INTO matches (id, mode, match_type, ranked, category_id, season_id, status, question_count, question_time_sec, settings_json)
         VALUES (?, ?, ?, ?, ?, ?, 'lobby', ?, ?, ?)`,
        [
          m.id,
          m.mode.key,
          m.type,
          m.ranked ? 1 : 0,
          m.categoryId,
          m.ranked ? this.seasonId() : null,
          m.questionCount,
          Math.round(m.questionTimeMs / 1000),
          JSON.stringify({ source: m.source, scoring: m.settings.scoring, endsAfterSec: (m as any).totalTimeSec ?? null }),
        ],
        conn,
      );
      for (const p of m.players) {
        const res = await exec(
          `INSERT INTO match_players (match_id, user_id, bot_level, bot_name, team, rating_before) VALUES (?, ?, ?, ?, ?, ?)`,
          [m.id, p.isBot ? null : p.userId, p.botLevel, p.isBot ? p.username : null, p.team, p.isBot ? null : p.rating],
          conn,
        );
        p.matchPlayerId = res.insertId;
      }
    });
  }

  async addPlayer(m: LiveMatch, p: LivePlayer) {
    const res = await exec(`INSERT INTO match_players (match_id, user_id, team, rating_before) VALUES (?, ?, ?, ?)`, [m.id, p.userId, p.team, p.rating]);
    p.matchPlayerId = res.insertId;
  }

  async removePlayer(m: LiveMatch, p: LivePlayer) {
    if (p.matchPlayerId) await exec('DELETE FROM match_players WHERE id = ?', [p.matchPlayerId]);
  }

  async markStarted(m: LiveMatch) {
    await exec(`UPDATE matches SET status = 'active', started_at = UTC_TIMESTAMP(), question_count = ? WHERE id = ?`, [m.questionCount, m.id]);
  }

  async saveQuestions(m: LiveMatch, from: number) {
    const rows = m.questions.slice(from).map((q, i) => [m.id, from + i, q.id, ((q as any).optionOrder ?? [0, 1, 2, 3]).join(',')]);
    if (!rows.length) return;
    await exec('INSERT IGNORE INTO match_questions (match_id, question_index, question_id, option_order) VALUES ?', [rows]);
  }

  async saveAnswer(m: LiveMatch, p: LivePlayer, a: AnswerRecord) {
    if (!p.matchPlayerId) return;
    // UNIQUE(match_id, match_player_id, question_index) is the last line of defence against duplicates.
    await exec(
      `INSERT IGNORE INTO match_answers (match_id, match_player_id, user_id, question_index, question_id, option_index, is_correct, response_ms, points, combo, power_up)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [m.id, p.matchPlayerId, p.isBot ? null : p.userId, a.questionIndex, a.questionId, a.optionIndex, a.correct ? 1 : 0, a.responseMs, a.points, a.combo, a.powerUp],
    );
  }

  async saveEvent(matchId: string, type: string, userId: number | null, data?: unknown) {
    await exec('INSERT INTO match_events (match_id, type, user_id, data) VALUES (?, ?, ?, ?)', [
      matchId,
      type,
      userId != null && userId > 0 ? userId : null,
      data === undefined ? null : JSON.stringify(data),
    ]);
  }

  async finish(m: LiveMatch) {
    await tx(async (conn) => {
      await exec(
        `UPDATE matches SET status = ?, winner_team = ?, end_reason = ?, ended_at = UTC_TIMESTAMP(), flagged = ?, flag_reason = ? WHERE id = ?`,
        [m.state === 'aborted' ? 'aborted' : 'finished', m.winnerTeam, m.endReason, m.flags.length ? 1 : 0, m.flags.join(',').slice(0, 200) || null, m.id],
        conn,
      );
      for (const p of m.players) {
        if (!p.matchPlayerId) continue;
        await exec(
          `UPDATE match_players SET score = ?, correct_count = ?, answered_count = ?, best_combo = ?, avg_response_ms = ?, disconnects = ?,
             result = COALESCE(result, ?) WHERE id = ?`,
          [
            p.score,
            p.correct,
            p.answeredCount,
            p.bestCombo,
            p.answeredCount ? Math.round(p.totalResponseMs / p.answeredCount) : null,
            p.disconnects,
            p.forfeited ? 'abandoned' : null,
            p.matchPlayerId,
          ],
          conn,
        );
      }
      // Aggregate per-question stats (human answers only).
      const agg = new Map<number, { shown: number; correct: number; wrong: number; timeout: number; ms: number }>();
      for (const p of m.players) {
        if (p.isBot) continue;
        for (const a of p.answers.values()) {
          const s = agg.get(a.questionId) ?? { shown: 0, correct: 0, wrong: 0, timeout: 0, ms: 0 };
          s.shown++;
          if (a.optionIndex === null) s.timeout++;
          else if (a.correct) s.correct++;
          else s.wrong++;
          s.ms += a.responseMs ?? 0;
          agg.set(a.questionId, s);
        }
      }
      for (const [qid, s] of agg) {
        await exec(
          `INSERT INTO question_stats (question_id, times_shown, correct_count, wrong_count, timeout_count, total_response_ms) VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE times_shown = times_shown + VALUES(times_shown), correct_count = correct_count + VALUES(correct_count),
             wrong_count = wrong_count + VALUES(wrong_count), timeout_count = timeout_count + VALUES(timeout_count),
             total_response_ms = total_response_ms + VALUES(total_response_ms)`,
          [qid, s.shown, s.correct, s.wrong, s.timeout, s.ms],
          conn,
        );
      }
    });
  }
}
