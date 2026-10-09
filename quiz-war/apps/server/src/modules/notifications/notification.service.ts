import type { NotificationView, ServerToClientEvents } from '@quizwar/shared';
import { exec, parseJson, query, queryOne } from '../../db/pool';
import type { PushMessage, PushService } from './push';

export interface UserEmitter {
  toUser<E extends keyof ServerToClientEvents>(userId: number, event: E, payload: Parameters<ServerToClientEvents[E]>[0]): void;
}

/** A user-facing text in both languages; the user's language picks one. */
export type LText = string | { en: string; bn: string };
export type Lang = 'bn' | 'en';
export const pick = (t: LText, lang: Lang) => (typeof t === 'string' ? t : t[lang] ?? t.bn);

export class NotificationService {
  private langs = new Map<number, { lang: Lang; at: number }>();
  /** Hook for follow-ups such as activity emails (set by the context). */
  onDelivered: ((userId: number, n: { type: string; title: string; body: string; data?: Record<string, unknown> }) => void) | null = null;

  /** The player's app language (cached for a minute). */
  async langOf(userId: number): Promise<Lang> {
    const c = this.langs.get(userId);
    if (c && Date.now() - c.at < 60_000) return c.lang;
    const r = await queryOne<{ lang: Lang }>('SELECT lang FROM user_profiles WHERE user_id = ?', [userId]).catch(() => null);
    const lang: Lang = r?.lang === 'en' ? 'en' : 'bn';
    if (this.langs.size > 5000) this.langs.clear();
    this.langs.set(userId, { lang, at: Date.now() });
    return lang;
  }

  forgetLang(userId: number) {
    this.langs.delete(userId);
  }

  constructor(
    private readonly push: PushService,
    private readonly emitter: () => UserEmitter | null,
    private readonly isOnline: (userId: number) => boolean,
    private readonly pushEnabled: () => boolean,
  ) {}

  /**
   * In-app notification + realtime delivery. Push is sent when the player is not connected
   * (or always for `forcePush`, e.g. battle requests while the app is backgrounded).
   */
  async notify(
    userId: number,
    input: { type: string; title: LText; body: LText; data?: Record<string, unknown>; url?: string },
    opts: { push?: boolean; forcePush?: boolean; store?: boolean } = {},
  ): Promise<NotificationView | null> {
    const lang = typeof input.title === 'string' && typeof input.body === 'string' ? 'bn' : await this.langOf(userId);
    const n = { ...input, title: pick(input.title, lang), body: pick(input.body, lang) };
    let view: NotificationView | null = null;
    if (opts.store !== false) {
      const res = await exec('INSERT INTO notifications (user_id, type, title, body, data) VALUES (?, ?, ?, ?, ?)', [
        userId,
        n.type,
        n.title.slice(0, 120),
        n.body.slice(0, 500),
        n.data ? JSON.stringify({ ...n.data, url: n.url }) : n.url ? JSON.stringify({ url: n.url }) : null,
      ]);
      view = { id: res.insertId, type: n.type, title: n.title, body: n.body, data: { ...(n.data ?? {}), url: n.url }, readAt: null, createdAt: new Date().toISOString() };
      this.emitter()?.toUser(userId, 'notification:new', view);
    }
    this.onDelivered?.(userId, n);
    if (this.pushEnabled() && (opts.forcePush || (opts.push !== false && !this.isOnline(userId)))) {
      const msg: PushMessage = { title: n.title, body: n.body, url: n.url, tag: n.type };
      void this.push.sendToUser(userId, msg).catch(() => undefined);
    }
    return view;
  }

  async list(userId: number, beforeId: number | null, limit = 30) {
    const rows = await query<any>(
      `SELECT id, type, title, body, data, read_at, created_at FROM notifications
       WHERE user_id = ? ${beforeId ? 'AND id < ?' : ''} ORDER BY id DESC LIMIT ?`,
      beforeId ? [userId, beforeId, limit] : [userId, limit],
    );
    const unread = await queryOne<{ n: number }>('SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND read_at IS NULL', [userId]);
    return {
      unread: Number(unread?.n ?? 0),
      items: rows.map(
        (r): NotificationView => ({
          id: r.id,
          type: r.type,
          title: r.title,
          body: r.body,
          data: parseJson(r.data),
          readAt: r.read_at ? new Date(r.read_at).toISOString() : null,
          createdAt: new Date(r.created_at).toISOString(),
        }),
      ),
    };
  }

  async markRead(userId: number, ids: number[] | 'all') {
    if (ids === 'all') await exec('UPDATE notifications SET read_at = UTC_TIMESTAMP() WHERE user_id = ? AND read_at IS NULL', [userId]);
    else if (ids.length) await exec('UPDATE notifications SET read_at = UTC_TIMESTAMP() WHERE user_id = ? AND id IN (?) AND read_at IS NULL', [userId, ids]);
  }
}
