import type { ReportReason } from '@quizwar/shared';
import { exec, queryOne } from '../../db/pool';
import { AppError, badRequest, notFound } from '../../lib/errors';

export class ReportService {
  async create(reporterId: number, input: { targetUserId: number | null; matchId?: string; reason: ReportReason; details?: string }) {
    if (!input.targetUserId && !input.matchId) throw badRequest('Choose a player or a match to report');
    if (input.targetUserId === reporterId) throw badRequest("You can't report yourself");
    const recent = await queryOne<{ n: number }>('SELECT COUNT(*) n FROM reports WHERE reporter_id = ? AND created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)', [reporterId]);
    if (Number(recent?.n) >= 15) throw new AppError(429, 'rate_limited', 'You have sent many reports today. Our team is reviewing them.');
    if (input.targetUserId) {
      const dup = await queryOne(
        `SELECT id FROM reports WHERE reporter_id = ? AND target_user_id = ? AND reason = ? AND status IN ('open','reviewing') LIMIT 1`,
        [reporterId, input.targetUserId, input.reason],
      );
      if (dup) return { duplicate: true };
    }
    // Evidence is captured at report time so later profile edits can't hide it.
    const evidence: Record<string, unknown> = {};
    if (input.targetUserId) {
      const t = await queryOne<any>(
        `SELECT u.uid, p.username, p.avatar_url, p.bio FROM users u JOIN user_profiles p ON p.user_id = u.id WHERE u.id = ?`,
        [input.targetUserId],
      );
      if (!t) throw notFound('Player not found');
      evidence.profile = t;
    }
    if (input.matchId) {
      const mt = await queryOne<any>('SELECT id, mode, match_type, flagged, flag_reason, created_at FROM matches WHERE id = ?', [input.matchId]);
      if (!mt) throw notFound('Match not found');
      const inMatch = await queryOne('SELECT 1 x FROM match_players WHERE match_id = ? AND user_id = ?', [input.matchId, reporterId]);
      if (!inMatch) throw badRequest('You can only report matches you played');
      evidence.match = mt;
    }
    await exec('INSERT INTO reports (reporter_id, target_user_id, match_id, reason, details, evidence) VALUES (?, ?, ?, ?, ?, ?)', [
      reporterId,
      input.targetUserId,
      input.matchId ?? null,
      input.reason,
      input.details ?? null,
      JSON.stringify(evidence),
    ]);
    return { duplicate: false };
  }
}
