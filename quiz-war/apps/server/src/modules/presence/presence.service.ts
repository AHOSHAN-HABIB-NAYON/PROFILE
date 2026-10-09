import type { PresenceStatus } from '@quizwar/shared';
import type { Redis } from 'ioredis';

interface Entry {
  sockets: Set<string>;
  manual: 'online' | 'away' | 'dnd';
  available: boolean;
  lastSeen: number;
}

const REDIS_KEY = 'qw:online';
const REDIS_TTL_MS = 90_000;

/**
 * Online presence. Sockets are tracked per user on this node; when Redis is configured the
 * node also maintains a shared sorted set (score = last heartbeat) so the "Players Online"
 * counter is correct across multiple realtime nodes. Entries expire automatically when a node
 * dies because heartbeats stop.
 */
export class PresenceService {
  private users = new Map<number, Entry>();
  private listeners: ((userId: number, status: PresenceStatus) => void)[] = [];

  constructor(
    private readonly isInMatch: (userId: number) => boolean,
    private readonly redis: Redis | null = null,
  ) {}

  onChange(fn: (userId: number, status: PresenceStatus) => void) {
    this.listeners.push(fn);
  }

  private emit(userId: number) {
    const s = this.status(userId);
    for (const l of this.listeners) l(userId, s);
  }

  connect(userId: number, socketId: string, prefs: { available: boolean; dnd: boolean }) {
    let e = this.users.get(userId);
    const wasOnline = !!e && e.sockets.size > 0;
    if (!e) {
      e = { sockets: new Set(), manual: prefs.dnd ? 'dnd' : 'online', available: prefs.available, lastSeen: Date.now() };
      this.users.set(userId, e);
    }
    e.sockets.add(socketId);
    e.lastSeen = Date.now();
    if (!wasOnline) {
      if (e.manual === 'away') e.manual = 'online';
      void this.redis?.zadd(REDIS_KEY, Date.now(), String(userId)).catch(() => undefined);
      this.emit(userId);
    }
    return !wasOnline;
  }

  disconnect(userId: number, socketId: string) {
    const e = this.users.get(userId);
    if (!e) return false;
    e.sockets.delete(socketId);
    if (e.sockets.size === 0) {
      this.users.delete(userId);
      void this.redis?.zrem(REDIS_KEY, String(userId)).catch(() => undefined);
      this.emit(userId);
      return true;
    }
    return false;
  }

  set(userId: number, p: { status?: 'online' | 'away' | 'dnd'; available?: boolean }) {
    const e = this.users.get(userId);
    if (!e) return;
    if (p.status) e.manual = p.status;
    if (p.available !== undefined) e.available = p.available;
    e.lastSeen = Date.now();
    this.emit(userId);
  }

  /** Re-broadcast after entering/leaving a match. */
  refresh(userId: number) {
    if (this.users.has(userId)) this.emit(userId);
  }

  status(userId: number): PresenceStatus {
    const e = this.users.get(userId);
    if (!e || e.sockets.size === 0) return 'offline';
    if (this.isInMatch(userId)) return 'in_match';
    return e.manual;
  }

  isOnline(userId: number) {
    return (this.users.get(userId)?.sockets.size ?? 0) > 0;
  }

  /** Can receive normal battle invitations. */
  isAvailable(userId: number) {
    const e = this.users.get(userId);
    return !!e && e.sockets.size > 0 && e.available && e.manual !== 'dnd' && !this.isInMatch(userId);
  }

  /** Users open to battle invitations right now, most recently active first. */
  availableUsers(limit: number): number[] {
    return [...this.users.entries()]
      .filter(([id]) => this.isAvailable(id))
      .sort((a, b) => b[1].lastSeen - a[1].lastSeen)
      .slice(0, limit)
      .map(([id]) => id);
  }

  localOnline(): number[] {
    return [...this.users.keys()];
  }

  async onlineCount(): Promise<number> {
    if (this.redis) {
      try {
        await this.redis.zremrangebyscore(REDIS_KEY, 0, Date.now() - REDIS_TTL_MS);
        return await this.redis.zcard(REDIS_KEY);
      } catch {
        /* fall back to local count */
      }
    }
    return this.users.size;
  }

  /** Heartbeat — keep this node's users alive in the shared set. */
  async heartbeat() {
    if (!this.redis || this.users.size === 0) return;
    const now = Date.now();
    const args: (string | number)[] = [];
    for (const id of this.users.keys()) args.push(now, String(id));
    await this.redis.zadd(REDIS_KEY, ...(args as [number, string])).catch(() => undefined);
  }
}
