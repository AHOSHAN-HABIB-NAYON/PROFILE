import { MODES, type BattleRequestView, type Difficulty, type GameSettings, type ModeKey } from '@quizwar/shared';
import { exec, query, queryOne, tx } from '../../db/pool';
import { AppError, badRequest, conflict, notFound } from '../../lib/errors';
import type { GameEngine } from '../../game/engine';
import type { Emitter } from '../../game/types';
import type { NotificationService } from '../notifications/notification.service';
import type { PresenceService } from '../presence/presence.service';
import { getPublicUser, getPublicUsers } from '../users/users.repo';
import type { FriendsService } from './friends.service';

interface Row {
  id: number;
  from_user_id: number;
  to_user_id: number;
  mode: string;
  category_id: number | null;
  category_name: string | null;
  question_count: number;
  difficulty: Difficulty | null;
  question_time_sec: number;
  status: BattleRequestView['status'];
  match_id: string | null;
  expires_at: Date;
}

/** Direct 1 VS 1 challenges: send → accept/decline/expire → War Room. */
export class BattleRequestService {
  private expiryTimers = new Map<number, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly engine: GameEngine,
    private readonly settings: () => GameSettings,
    private readonly presence: PresenceService,
    private readonly friends: FriendsService,
    private readonly notifications: NotificationService,
    private readonly emitter: () => Emitter | null,
  ) {}

  private async view(id: number): Promise<BattleRequestView | null> {
    const r = await queryOne<Row>(
      `SELECT br.*, c.name AS category_name FROM battle_requests br LEFT JOIN categories c ON c.id = br.category_id WHERE br.id = ?`,
      [id],
    );
    if (!r) return null;
    const users = await getPublicUsers([r.from_user_id, r.to_user_id]);
    return {
      id: r.id,
      from: users.get(Number(r.from_user_id))!,
      to: users.get(Number(r.to_user_id))!,
      mode: r.mode as ModeKey,
      questionCount: r.question_count,
      questionTimeSec: r.question_time_sec,
      difficulty: (r.difficulty as Difficulty | null) ?? null,
      category: r.category_id ? { id: r.category_id, name: r.category_name ?? '' } : null,
      status: r.status,
      expiresAt: r.expires_at.getTime(),
      matchId: r.match_id,
    };
  }

  private broadcast(v: BattleRequestView) {
    this.emitter()?.toUser(v.from.id, 'battle:update', v);
    this.emitter()?.toUser(v.to.id, 'battle:update', v);
  }

  async send(fromId: number, toId: number, o: { categoryId?: number | null; questionCount?: number | null; difficulty?: Difficulty | null }) {
    const s = this.settings();
    if (toId === fromId) throw badRequest("You can't challenge yourself");
    const target = await getPublicUser(toId);
    if (!target) throw notFound('Player not found');
    if (await this.friends.isBlockedEitherWay(fromId, toId)) throw notFound('Player not found');
    if (this.engine.activeMatchOf(fromId)) throw conflict('Finish your current match first', 'already_in_match');
    if (!this.presence.isAvailable(toId)) throw new AppError(409, 'not_available', `${target.username} is not available for battle right now`);
    const counts = await queryOne<{ pending: number; recent: number; dup: number }>(
      `SELECT
         SUM(status = 'pending' AND expires_at > UTC_TIMESTAMP()) pending,
         SUM(created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE)) recent,
         SUM(status = 'pending' AND expires_at > UTC_TIMESTAMP() AND to_user_id = ?) dup
       FROM battle_requests WHERE from_user_id = ? AND created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR)`,
      [toId, fromId],
    );
    if (Number(counts?.dup ?? 0) > 0) throw conflict('You already challenged this player', 'duplicate_request');
    if (Number(counts?.recent ?? 0) >= s.battleRequests.perMinuteLimit) throw new AppError(429, 'rate_limited', 'Too many challenges — wait a moment');
    if (Number(counts?.pending ?? 0) >= s.battleRequests.maxPendingOutgoing) throw conflict('Too many pending challenges', 'too_many_pending');
    const questionCount = Math.min(50, Math.max(3, o.questionCount ?? s.battleRequests.defaultQuestionCount));
    const res = await exec(
      `INSERT INTO battle_requests (from_user_id, to_user_id, mode, category_id, question_count, question_time_sec, difficulty, expires_at)
       VALUES (?, ?, 'duel', ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND))`,
      [fromId, toId, o.categoryId ?? null, questionCount, o.difficulty ? s.match.difficultyTimeSec[o.difficulty] : s.match.questionTimeSec, o.difficulty ?? null, s.battleRequests.expirySec],
    );
    const v = (await this.view(res.insertId))!;
    this.emitter()?.toUser(toId, 'battle:request', v);
    this.emitter()?.toUser(fromId, 'battle:update', v);
    void this.notifications
      .notify(
        toId,
        { type: 'battle_request', title: { en: 'Battle request', bn: 'ব্যাটল চ্যালেঞ্জ' }, body: { en: `${v.from.username} challenged you! ${MODES.duel.label} · ${questionCount} questions`, bn: `${v.from.username} আপনাকে চ্যালেঞ্জ করেছে! ১ বনাম ১ · ${questionCount}টি প্রশ্ন` }, url: '/battle/requests', data: { requestId: v.id } },
        { store: false },
      )
      .catch(() => undefined);
    this.scheduleExpiry(v.id, s.battleRequests.expirySec * 1000);
    return v;
  }

  private scheduleExpiry(id: number, ms: number) {
    const t = setTimeout(() => {
      this.expiryTimers.delete(id);
      void this.expire(id);
    }, ms + 250);
    t.unref?.();
    this.expiryTimers.set(id, t);
  }

  async expire(id: number) {
    const r = await exec(`UPDATE battle_requests SET status = 'expired' WHERE id = ? AND status = 'pending' AND expires_at <= UTC_TIMESTAMP()`, [id]);
    if (r.affectedRows) {
      const v = await this.view(id);
      if (v) this.broadcast(v);
    }
  }

  /** Sweeps requests whose timers were lost (e.g. after a restart). */
  async sweep() {
    const rows = await query<{ id: number }>(`SELECT id FROM battle_requests WHERE status = 'pending' AND expires_at <= UTC_TIMESTAMP() LIMIT 500`);
    for (const r of rows) await this.expire(r.id);
  }

  async respond(userId: number, id: number, accept: boolean) {
    const r = await tx(async (conn) => {
      const row = await queryOne<Row>('SELECT * FROM battle_requests WHERE id = ? FOR UPDATE', [id], conn);
      if (!row || row.to_user_id !== userId) throw notFound('Battle request not found');
      if (row.status !== 'pending') throw conflict(`This challenge was already ${row.status}`, 'request_closed');
      if (row.expires_at.getTime() <= Date.now()) {
        await exec(`UPDATE battle_requests SET status = 'expired' WHERE id = ?`, [id], conn);
        throw new AppError(410, 'request_expired', 'This challenge has expired');
      }
      if (!accept) {
        await exec(`UPDATE battle_requests SET status = 'declined', responded_at = UTC_TIMESTAMP() WHERE id = ?`, [id], conn);
        return { row, matchId: null as string | null };
      }
      if (this.engine.activeMatchOf(userId)) throw conflict('Finish your current match first', 'already_in_match');
      if (this.engine.activeMatchOf(row.from_user_id)) throw conflict('Your opponent is already in another match', 'opponent_busy');
      const users = await getPublicUsers([row.from_user_id, row.to_user_id]);
      const a = users.get(Number(row.from_user_id))!;
      const b = users.get(Number(row.to_user_id))!;
      const cat = row.category_id ? await queryOne<{ id: number; name: string; icon: string }>('SELECT id, name, icon FROM categories WHERE id = ?', [row.category_id], conn) : null;
      const m = await this.engine.createMatch({
        mode: 'duel',
        source: 'challenge',
        ranked: false,
        categoryId: row.category_id,
        category: cat,
        questionCount: row.question_count,
        questionTimeSec: row.question_time_sec,
        difficulties: row.difficulty ? [row.difficulty] : null,
        hostUserId: a.id,
        players: [
          { userId: a.id, username: a.username, uid: a.uid, avatarUrl: a.avatarThumbUrl ?? a.avatarUrl, level: a.level, rating: a.rating, team: 0 },
          { userId: b.id, username: b.username, uid: b.uid, avatarUrl: b.avatarThumbUrl ?? b.avatarUrl, level: b.level, rating: b.rating, team: 1 },
        ],
      });
      await exec(`UPDATE battle_requests SET status = 'accepted', responded_at = UTC_TIMESTAMP(), match_id = ? WHERE id = ?`, [m.id, id], conn);
      return { row, matchId: m.id };
    });
    const t = this.expiryTimers.get(id);
    if (t) clearTimeout(t);
    const v = await this.view(id);
    if (v) this.broadcast(v);
    return { matchId: r.matchId, request: v };
  }

  async cancel(userId: number, id: number) {
    const r = await exec(`UPDATE battle_requests SET status = 'cancelled' WHERE id = ? AND from_user_id = ? AND status = 'pending'`, [id, userId]);
    if (r.affectedRows) {
      const v = await this.view(id);
      if (v) this.broadcast(v);
    }
  }

  async pending(userId: number) {
    const rows = await query<{ id: number }>(
      `SELECT id FROM battle_requests WHERE (to_user_id = ? OR from_user_id = ?) AND status = 'pending' AND expires_at > UTC_TIMESTAMP() ORDER BY id DESC LIMIT 30`,
      [userId, userId],
    );
    const out: BattleRequestView[] = [];
    for (const r of rows) {
      const v = await this.view(r.id);
      if (v) out.push(v);
    }
    return { incoming: out.filter((v) => v.to.id === userId), outgoing: out.filter((v) => v.from.id === userId) };
  }
}
