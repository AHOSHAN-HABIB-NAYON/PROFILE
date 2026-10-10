import type { ChatMessage, ChatThread, PresenceStatus, PublicUser, ServerToClientEvents } from '@quizwar/shared';
import { exec, query, queryOne } from '../../db/pool';
import { AppError, badRequest, notFound } from '../../lib/errors';
import type { PushService } from '../notifications/push';
import type { FriendsService } from '../social/friends.service';
import { getPublicUser, getPublicUsers, getUserByUid } from '../users/users.repo';

export const CHAT_RETENTION_DAYS = 7;
const MAX_LEN = 1000;

interface Emitter {
  toUser<E extends keyof ServerToClientEvents>(userId: number, event: E, payload: Parameters<ServerToClientEvents[E]>[0]): void;
}

const toMsg = (r: any): ChatMessage => ({
  id: Number(r.id),
  from: Number(r.sender_id),
  to: Number(r.recipient_id),
  body: r.body,
  createdAt: new Date(r.created_at).toISOString(),
  readAt: r.read_at ? new Date(r.read_at).toISOString() : null,
});

/** Strips control characters but keeps emoji, Bangla and line breaks; collapses runs of blank lines. */
export function cleanChatText(raw: string) {
  return raw
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_LEN);
}

/** One-to-one text chat. Realtime over the socket, push when the chat isn't open, kept 7 days. */
export class ChatService {
  /** userId → peer whose chat is open and visible on one of the user's devices. */
  private focus = new Map<number, Map<string, number>>();
  private lastPush = new Map<string, number>();

  constructor(
    private readonly friends: FriendsService,
    private readonly push: PushService,
    private readonly emitter: () => Emitter | null,
    private readonly presence: (userId: number) => PresenceStatus,
    private readonly enabled: () => { chat: boolean; push: boolean },
  ) {}

  setFocus(userId: number, socketId: string, peerId: number | null) {
    const m = this.focus.get(userId) ?? new Map<string, number>();
    if (peerId) m.set(socketId, peerId);
    else m.delete(socketId);
    if (m.size) this.focus.set(userId, m);
    else this.focus.delete(userId);
  }

  private isViewing(userId: number, peerId: number) {
    for (const p of this.focus.get(userId)?.values() ?? []) if (p === peerId) return true;
    return false;
  }

  private assertOn() {
    if (!this.enabled().chat) throw new AppError(403, 'chat_disabled', 'Chat is turned off right now');
  }

  async peerByUid(uid: string): Promise<PublicUser> {
    const u = await getUserByUid(uid);
    if (!u) throw notFound('Player not found');
    return u;
  }

  async threads(userId: number): Promise<{ items: (ChatThread & { status: PresenceStatus })[]; unread: number }> {
    const rows = await query<any>(
      `SELECT m.* FROM chat_messages m JOIN (
         SELECT peer, MAX(id) id FROM (
           SELECT recipient_id peer, id FROM chat_messages WHERE sender_id = ? AND hidden_for_sender = 0
           UNION ALL SELECT sender_id peer, id FROM chat_messages WHERE recipient_id = ? AND hidden_for_recipient = 0
         ) x GROUP BY peer ORDER BY id DESC LIMIT 100
       ) last ON last.id = m.id ORDER BY m.id DESC`,
      [userId, userId],
    );
    const unreadRows = await query<{ sender_id: number; n: number }>(
      'SELECT sender_id, COUNT(*) n FROM chat_messages WHERE recipient_id = ? AND read_at IS NULL AND hidden_for_recipient = 0 GROUP BY sender_id',
      [userId],
    );
    const unread = new Map(unreadRows.map((r) => [Number(r.sender_id), Number(r.n)]));
    const blocked = await this.friends.blockedSet(userId);
    const msgs = rows.map(toMsg);
    const peers = await getPublicUsers(msgs.map((m) => (m.from === userId ? m.to : m.from)));
    const items = msgs
      .map((m) => {
        const peerId = m.from === userId ? m.to : m.from;
        const peer = peers.get(peerId);
        return peer && !blocked.has(peerId) ? { peer, last: m, unread: unread.get(peerId) ?? 0, status: this.presence(peerId) } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
    return { items, unread: items.reduce((s, x) => s + x.unread, 0) };
  }

  async unreadCount(userId: number) {
    const r = await queryOne<{ n: number }>(
      `SELECT COUNT(*) n FROM chat_messages m WHERE m.recipient_id = ? AND m.read_at IS NULL AND m.hidden_for_recipient = 0
         AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = m.recipient_id AND b.blocked_id = m.sender_id) OR (b.blocker_id = m.sender_id AND b.blocked_id = m.recipient_id))`,
      [userId],
    );
    return Number(r?.n ?? 0);
  }

  async history(userId: number, peer: PublicUser, before?: number) {
    const rows = await query<any>(
      `SELECT * FROM chat_messages
       WHERE ((sender_id = ? AND recipient_id = ? AND hidden_for_sender = 0) OR (sender_id = ? AND recipient_id = ? AND hidden_for_recipient = 0)) ${before ? 'AND id < ?' : ''}
       ORDER BY id DESC LIMIT 50`,
      before ? [userId, peer.id, peer.id, userId, before] : [userId, peer.id, peer.id, userId],
    );
    return {
      peer,
      status: this.presence(peer.id),
      blocked: await this.friends.blockDirection(userId, peer.id),
      items: rows.map(toMsg).reverse(),
      hasMore: rows.length === 50,
    };
  }

  async send(userId: number, peerId: number, raw: string): Promise<ChatMessage> {
    this.assertOn();
    if (peerId === userId) throw badRequest('You cannot message yourself');
    const body = cleanChatText(raw);
    if (!body) throw badRequest('Message is empty');
    const dir = await this.friends.blockDirection(userId, peerId);
    if (dir === 'me') throw new AppError(403, 'blocked_by_you', 'You blocked this player. Unblock them to chat.');
    if (dir === 'them') throw new AppError(403, 'blocked', 'You can’t message this player.');
    const ok = await queryOne<{ id: number }>(`SELECT id FROM users WHERE id = ? AND status = 'active'`, [peerId]);
    if (!ok) throw notFound('Player not found');

    const res = await exec('INSERT INTO chat_messages (sender_id, recipient_id, body) VALUES (?, ?, ?)', [userId, peerId, body]);
    const message: ChatMessage = { id: res.insertId, from: userId, to: peerId, body, createdAt: new Date().toISOString(), readAt: null };
    const [me, them] = await Promise.all([getPublicUser(userId), getPublicUser(peerId)]);
    if (me) this.emitter()?.toUser(peerId, 'chat:message', { message, peer: me });
    if (them) this.emitter()?.toUser(userId, 'chat:message', { message, peer: them });

    // Phone notification unless they are looking at this chat right now (one per 20s per chat).
    if (me && this.enabled().push && !this.isViewing(peerId, userId)) {
      const key = `${peerId}:${userId}`;
      const now = Date.now();
      if (now - (this.lastPush.get(key) ?? 0) > 20_000) {
        this.lastPush.set(key, now);
        if (this.lastPush.size > 20_000) this.lastPush.clear();
        void this.push.sendToUser(peerId, { title: me.username, body: body.length > 140 ? `${body.slice(0, 137)}…` : body, url: `/chat/${me.uid}`, tag: `chat-${userId}` }).catch(() => undefined);
      }
    }
    return message;
  }

  async markRead(userId: number, peerId: number) {
    const last = await queryOne<{ id: number }>('SELECT MAX(id) id FROM chat_messages WHERE sender_id = ? AND recipient_id = ? AND read_at IS NULL', [peerId, userId]);
    if (!last?.id) return { upTo: 0 };
    await exec('UPDATE chat_messages SET read_at = NOW() WHERE sender_id = ? AND recipient_id = ? AND read_at IS NULL AND id <= ?', [peerId, userId, last.id]);
    this.emitter()?.toUser(peerId, 'chat:read', { peerId: userId, upTo: Number(last.id) });
    this.emitter()?.toUser(userId, 'chat:read', { peerId, upTo: 0 });
    return { upTo: Number(last.id) };
  }

  async typing(userId: number, peerId: number) {
    if (!this.enabled().chat || peerId === userId) return;
    if (await this.friends.isBlockedEitherWay(userId, peerId)) return;
    this.emitter()?.toUser(peerId, 'chat:typing', { from: userId });
  }

  /**
   * Delete one message. Your own message can be removed for everyone (it disappears on both
   * phones); any message can be removed just for you.
   */
  async deleteMessage(userId: number, id: number, forEveryone: boolean) {
    const m = await queryOne<{ sender_id: number; recipient_id: number }>('SELECT sender_id, recipient_id FROM chat_messages WHERE id = ?', [id]);
    if (!m || (Number(m.sender_id) !== userId && Number(m.recipient_id) !== userId)) throw notFound('Message not found');
    const mine = Number(m.sender_id) === userId;
    if (forEveryone) {
      if (!mine) throw new AppError(403, 'not_yours', 'You can only delete your own messages for everyone');
      await exec('DELETE FROM chat_messages WHERE id = ?', [id]);
      this.emitter()?.toUser(Number(m.sender_id), 'chat:deleted', { ids: [id] });
      this.emitter()?.toUser(Number(m.recipient_id), 'chat:deleted', { ids: [id] });
    } else {
      await exec(`UPDATE chat_messages SET ${mine ? 'hidden_for_sender' : 'hidden_for_recipient'} = 1, read_at = COALESCE(read_at, ${mine ? 'read_at' : 'NOW()'}) WHERE id = ?`, [id]);
      this.emitter()?.toUser(userId, 'chat:deleted', { ids: [id] });
    }
    return { ok: true };
  }

  /** "Clear chat": hides the whole conversation for you only. */
  async clearChat(userId: number, peerId: number) {
    await exec('UPDATE chat_messages SET hidden_for_sender = 1 WHERE sender_id = ? AND recipient_id = ?', [userId, peerId]);
    await exec('UPDATE chat_messages SET hidden_for_recipient = 1, read_at = COALESCE(read_at, NOW()) WHERE sender_id = ? AND recipient_id = ?', [peerId, userId]);
    return { ok: true };
  }

  /* ------------------------------ Admin ------------------------------ */

  async adminList(opts: { userId?: number; q?: string; limit?: number }) {
    const where: string[] = [];
    const args: unknown[] = [];
    if (opts.userId) {
      where.push('(m.sender_id = ? OR m.recipient_id = ?)');
      args.push(opts.userId, opts.userId);
    }
    if (opts.q) {
      where.push('m.body LIKE ?');
      args.push(`%${opts.q.replace(/[%_\\]/g, '\\$&')}%`);
    }
    const rows = await query<any>(
      `SELECT m.*, s.uid AS s_uid, sp.username AS s_name, r.uid AS r_uid, rp.username AS r_name
       FROM chat_messages m
       JOIN users s ON s.id = m.sender_id JOIN user_profiles sp ON sp.user_id = m.sender_id
       JOIN users r ON r.id = m.recipient_id JOIN user_profiles rp ON rp.user_id = m.recipient_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY m.id DESC LIMIT ${Math.min(opts.limit ?? 200, 500)}`,
      args,
    );
    return rows.map((r) => ({ ...toMsg(r), sender: { id: Number(r.sender_id), uid: r.s_uid, username: r.s_name }, recipient: { id: Number(r.recipient_id), uid: r.r_uid, username: r.r_name } }));
  }

  async adminDelete(ids: number[]) {
    if (!ids.length) return 0;
    const rows = await query<{ id: number; sender_id: number; recipient_id: number }>(`SELECT id, sender_id, recipient_id FROM chat_messages WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
    if (!rows.length) return 0;
    await exec(`DELETE FROM chat_messages WHERE id IN (${rows.map(() => '?').join(',')})`, rows.map((r) => r.id));
    const byUser = new Map<number, number[]>();
    for (const r of rows) for (const u of [Number(r.sender_id), Number(r.recipient_id)]) byUser.set(u, [...(byUser.get(u) ?? []), Number(r.id)]);
    for (const [u, list] of byUser) this.emitter()?.toUser(u, 'chat:deleted', { ids: list });
    return rows.length;
  }

  async adminDeleteAllFrom(userId: number) {
    const rows = await query<{ id: number }>('SELECT id FROM chat_messages WHERE sender_id = ? LIMIT 5000', [userId]);
    return this.adminDelete(rows.map((r) => Number(r.id)));
  }

  /** Messages older than the retention window are removed for good. */
  async purgeOld() {
    const r = await exec(`DELETE FROM chat_messages WHERE created_at < NOW() - INTERVAL ${CHAT_RETENTION_DAYS} DAY LIMIT 50000`);
    return r.affectedRows;
  }
}
