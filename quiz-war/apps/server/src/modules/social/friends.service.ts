import type { PresenceStatus, PublicUser } from '@quizwar/shared';
import { exec, query, queryOne, tx } from '../../db/pool';
import { badRequest, conflict, notFound } from '../../lib/errors';
import type { NotificationService } from '../notifications/notification.service';
import { PUBLIC_USER_COLUMNS, toPublicUser } from '../users/users.repo';

const MAX_PENDING_OUT = 30;
const MAX_FRIENDS = 300;

export class FriendsService {
  constructor(
    private readonly notifications: NotificationService,
    private readonly presence: (userId: number) => PresenceStatus,
  ) {}

  async isBlockedEitherWay(a: number, b: number) {
    const r = await queryOne('SELECT 1 x FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?) LIMIT 1', [a, b, b, a]);
    return !!r;
  }

  async blockedSet(userId: number): Promise<Set<number>> {
    const rows = await query<{ id: number }>(
      'SELECT blocked_id id FROM blocks WHERE blocker_id = ? UNION SELECT blocker_id id FROM blocks WHERE blocked_id = ?',
      [userId, userId],
    );
    return new Set(rows.map((r) => Number(r.id)));
  }

  async areFriends(a: number, b: number) {
    return !!(await queryOne('SELECT 1 x FROM friends WHERE user_id = ? AND friend_id = ?', [a, b]));
  }

  async friendIds(userId: number): Promise<number[]> {
    const rows = await query<{ friend_id: number }>('SELECT friend_id FROM friends WHERE user_id = ?', [userId]);
    return rows.map((r) => Number(r.friend_id));
  }

  async list(userId: number) {
    const rows = await query<any>(
      `SELECT ${PUBLIC_USER_COLUMNS}, f.created_at AS since FROM friends f
       JOIN users u ON u.id = f.friend_id JOIN user_profiles p ON p.user_id = u.id
       WHERE f.user_id = ? AND u.status IN ('active','suspended') ORDER BY p.username LIMIT ?`,
      [userId, MAX_FRIENDS],
    );
    const order: Record<PresenceStatus, number> = { online: 0, in_match: 1, away: 2, dnd: 3, offline: 4 };
    return rows
      .map((r) => ({ user: toPublicUser(r), status: this.presence(Number(r.id)), since: r.since }))
      .sort((a, b) => order[a.status] - order[b.status]);
  }

  async requests(userId: number) {
    const incoming = await query<any>(
      `SELECT fr.id AS request_id, fr.created_at AS created, ${PUBLIC_USER_COLUMNS} FROM friend_requests fr
       JOIN users u ON u.id = fr.from_user_id JOIN user_profiles p ON p.user_id = u.id
       WHERE fr.to_user_id = ? AND fr.status = 'pending' ORDER BY fr.id DESC LIMIT 100`,
      [userId],
    );
    const outgoing = await query<any>(
      `SELECT fr.id AS request_id, fr.created_at AS created, ${PUBLIC_USER_COLUMNS} FROM friend_requests fr
       JOIN users u ON u.id = fr.to_user_id JOIN user_profiles p ON p.user_id = u.id
       WHERE fr.from_user_id = ? AND fr.status = 'pending' ORDER BY fr.id DESC LIMIT 100`,
      [userId],
    );
    const map = (r: any) => ({ id: r.request_id, user: toPublicUser(r), createdAt: r.created });
    return { incoming: incoming.map(map), outgoing: outgoing.map(map) };
  }

  async request(fromId: number, to: PublicUser): Promise<{ status: 'sent' | 'accepted' }> {
    if (to.id === fromId) throw badRequest("You can't add yourself");
    if (await this.isBlockedEitherWay(fromId, to.id)) throw notFound('Player not found');
    if (await this.areFriends(fromId, to.id)) throw conflict('You are already friends', 'already_friends');
    const reverse = await queryOne<{ id: number }>(`SELECT id FROM friend_requests WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending'`, [to.id, fromId]);
    if (reverse) {
      await this.respond(fromId, reverse.id, true);
      return { status: 'accepted' };
    }
    const dup = await queryOne(`SELECT id FROM friend_requests WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending'`, [fromId, to.id]);
    if (dup) throw conflict('Friend request already sent', 'already_requested');
    const pending = await queryOne<{ n: number }>(`SELECT COUNT(*) n FROM friend_requests WHERE from_user_id = ? AND status = 'pending'`, [fromId]);
    if (Number(pending?.n) >= MAX_PENDING_OUT) throw conflict('Too many pending friend requests', 'too_many_requests');
    await exec('INSERT INTO friend_requests (from_user_id, to_user_id) VALUES (?, ?)', [fromId, to.id]);
    const me = await queryOne<{ username: string }>('SELECT username FROM user_profiles WHERE user_id = ?', [fromId]);
    await this.notifications.notify(to.id, {
      type: 'friend_request',
      title: { en: 'New friend request', bn: 'নতুন ফ্রেন্ড রিকোয়েস্ট' },
      body: { en: `${me?.username ?? 'A player'} wants to be your friend.`, bn: `${me?.username ?? 'একজন প্লেয়ার'} আপনার বন্ধু হতে চায়।` },
      url: '/friends?tab=requests',
    });
    return { status: 'sent' };
  }

  async respond(userId: number, requestId: number, accept: boolean) {
    const fromId = await tx(async (conn) => {
      const r = await queryOne<{ from_user_id: number; to_user_id: number; status: string }>(
        'SELECT from_user_id, to_user_id, status FROM friend_requests WHERE id = ? FOR UPDATE',
        [requestId],
        conn,
      );
      if (!r || r.to_user_id !== userId || r.status !== 'pending') throw notFound('Friend request not found');
      await exec(`UPDATE friend_requests SET status = ?, responded_at = UTC_TIMESTAMP() WHERE id = ?`, [accept ? 'accepted' : 'rejected', requestId], conn);
      if (accept) {
        await exec('INSERT IGNORE INTO friends (user_id, friend_id) VALUES (?, ?), (?, ?)', [r.from_user_id, r.to_user_id, r.to_user_id, r.from_user_id], conn);
      }
      return r.from_user_id;
    });
    if (accept) {
      const me = await queryOne<{ username: string }>('SELECT username FROM user_profiles WHERE user_id = ?', [userId]);
      await this.notifications.notify(fromId, {
        type: 'friend_accepted',
        title: { en: 'Friend request accepted', bn: 'ফ্রেন্ড রিকোয়েস্ট গ্রহণ করেছে' },
        body: { en: `${me?.username ?? 'A player'} is now your friend.`, bn: `${me?.username ?? 'একজন প্লেয়ার'} এখন আপনার বন্ধু।` },
        url: '/friends',
      });
    }
  }

  async cancel(userId: number, requestId: number) {
    await exec(`UPDATE friend_requests SET status = 'cancelled' WHERE id = ? AND from_user_id = ? AND status = 'pending'`, [requestId, userId]);
  }

  async remove(userId: number, friendId: number) {
    await exec('DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)', [userId, friendId, friendId, userId]);
  }

  async block(userId: number, targetId: number) {
    if (userId === targetId) throw badRequest("You can't block yourself");
    await tx(async (conn) => {
      await exec('INSERT IGNORE INTO blocks (blocker_id, blocked_id) VALUES (?, ?)', [userId, targetId], conn);
      await exec('DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)', [userId, targetId, targetId, userId], conn);
      await exec(
        `UPDATE friend_requests SET status = 'cancelled' WHERE status = 'pending' AND ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))`,
        [userId, targetId, targetId, userId],
        conn,
      );
      await exec(
        `UPDATE battle_requests SET status = 'cancelled' WHERE status = 'pending' AND ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))`,
        [userId, targetId, targetId, userId],
        conn,
      );
    });
  }

  async unblock(userId: number, targetId: number) {
    await exec('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?', [userId, targetId]);
  }

  async blocked(userId: number) {
    const rows = await query<any>(
      `SELECT ${PUBLIC_USER_COLUMNS} FROM blocks b JOIN users u ON u.id = b.blocked_id JOIN user_profiles p ON p.user_id = u.id WHERE b.blocker_id = ? ORDER BY b.created_at DESC`,
      [userId],
    );
    return rows.map(toPublicUser);
  }
}
