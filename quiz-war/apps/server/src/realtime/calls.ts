import { createHmac, timingSafeEqual } from 'node:crypto';
import type { CallEndReason, CallStatus, PublicUser, ServerToClientEvents } from '@quizwar/shared';
import { ulid } from '../lib/crypto';
import { AppError, badRequest } from '../lib/errors';

/** How long a call rings before it counts as missed. */
export const RING_MS = 35_000;
/** A phone that dropped off the network gets this long to come back before it leaves the call. */
const LOST_MS = 25_000;
/** Everyone talks to everyone phone-to-phone, so calls stay small. */
export const CALL_MAX_PEOPLE = 4;

interface Member {
  user: PublicUser;
  /** Who brought this person into the call (0 for the one who started it). */
  inviter: number;
  state: 'ringing' | 'active';
  joinedAt: number;
  ring?: NodeJS.Timeout;
  lost?: NodeJS.Timeout;
  /** The device (socket) this person is in the call on. */
  socket?: string;
  /** Their phone showed the call (the caller heard "ringing"). */
  rang?: boolean;
}

interface Call {
  id: string;
  host: number;
  /** Someone picked up (before that, only the host waits). */
  started: boolean;
  /** Started as a video call (the camera can also be turned on later in any call). */
  video: boolean;
  members: Map<number, Member>;
}

interface Deps {
  emit<E extends keyof ServerToClientEvents>(userId: number, event: E, payload: Parameters<ServerToClientEvents[E]>[0], exceptSocket?: string): void;
  publicUser(id: number): Promise<PublicUser | null>;
  assertCanCall(from: number, to: number): Promise<void>;
  logCall(caller: number, callee: number, status: CallStatus, secs: number, video: boolean): Promise<unknown>;
  ringPush(to: number, from: PublicUser, callId: string, declineToken: string, video: boolean): Promise<void>;
  missedPush(to: number, from: PublicUser, callId: string, video: boolean): Promise<void>;
  /** Stop the ringing notification on this person's phones. */
  endPush(to: number, callId: string): Promise<void>;
  /** Drop one person (or everyone) from the call's voice room. */
  closeVoice(callId: string, userId?: number): void;
  enabled(): boolean;
  /** Signs "decline" links in the ring push (Decline works from the lock screen, without the app). */
  secret: string;
  log: { warn: (o: object, m: string) => void };
}

/** The running call service (set by the socket gateway; used by the "decline" link route). */
export const callRegistry: { current: CallService | null } = { current: null };

/**
 * Audio calls: one-to-one, and anyone in the call can add friends (up to 4 people). The server
 * only rings, keeps who is in which call and writes each person's call into the chat; the sound
 * goes phone-to-phone through the voice room that has the call id as its room id.
 */
export class CallService {
  private calls = new Map<string, Call>();
  private byUser = new Map<number, string>();
  private lastStart = new Map<number, number>();

  constructor(private readonly d: Deps) {}

  declineToken(callId: string, userId: number) {
    return createHmac('sha256', this.d.secret).update(`call-decline:${callId}:${userId}`).digest('hex').slice(0, 40);
  }

  /** Decline tapped on the phone's ringing screen (no app, no login needed: the link is signed). */
  declineWithToken(callId: string, token: string) {
    const c = this.calls.get(callId);
    if (!c) return false;
    const got = Buffer.from(String(token));
    for (const [uid, m] of c.members) {
      if (m.state !== 'ringing') continue;
      const want = Buffer.from(this.declineToken(callId, uid));
      if (want.length === got.length && timingSafeEqual(want, got)) {
        this.removeMember(c, uid, 'declined');
        return true;
      }
    }
    return false;
  }

  /** The called phone shows the call (app open, or the ring push arrived): tell whoever invited them. */
  ringing(callId: string, userId: number) {
    const c = this.calls.get(callId);
    const m = c?.members.get(userId);
    if (!c || m?.state !== 'ringing' || m.rang) return false;
    m.rang = true;
    this.d.emit(m.inviter, 'call:ringing', { callId, userId });
    return true;
  }

  /** Ring push arrived (signed link, no login). */
  ringingWithToken(callId: string, token: string) {
    const c = this.calls.get(callId);
    if (!c) return false;
    const got = Buffer.from(String(token));
    for (const [uid, m] of c.members) {
      if (m.state !== 'ringing') continue;
      const want = Buffer.from(this.declineToken(callId, uid));
      if (want.length === got.length && timingSafeEqual(want, got)) return this.ringing(callId, uid);
    }
    return false;
  }

  has(callId: string) {
    return this.calls.has(callId);
  }

  /** May this user be in the call's voice room right now? (after someone picked up) */
  isMember(callId: string, userId: number) {
    const c = this.calls.get(callId);
    return !!c && c.started && c.members.get(userId)?.state === 'active';
  }

  /** The user's phone (maybe a new connection) is in the call: stop the "lost" countdown. */
  bind(callId: string, userId: number, socketId: string) {
    const m = this.calls.get(callId)?.members.get(userId);
    if (!m) return;
    m.socket = socketId;
    clearTimeout(m.lost);
    m.lost = undefined;
  }

  private rateLimit(userId: number) {
    const now = Date.now();
    if (now - (this.lastStart.get(userId) ?? 0) < 3000) throw new AppError(429, 'rate_limited', 'Please wait a moment');
    this.lastStart.set(userId, now);
    if (this.lastStart.size > 20_000) this.lastStart.clear();
  }

  /** Ring one person for this call. */
  private ring(c: Call, inviter: PublicUser, to: PublicUser) {
    const m: Member = { user: to, inviter: inviter.id, state: 'ringing', joinedAt: 0 };
    m.ring = setTimeout(() => this.removeMember(c, to.id, 'missed'), RING_MS);
    c.members.set(to.id, m);
    this.byUser.set(to.id, c.id);
    const others = [...c.members.values()].filter((x) => x.user.id !== to.id && x.state === 'active').map((x) => x.user.username);
    this.d.emit(to.id, 'call:incoming', { callId: c.id, from: inviter, ...(others.length > 1 ? { with: others } : {}), ...(c.video ? { video: true } : {}) });
    void this.d.ringPush(to.id, inviter, c.id, this.declineToken(c.id, to.id), c.video).catch(() => undefined);
  }

  async start(userId: number, socketId: string, to: number, video = false) {
    if (!this.d.enabled()) throw new AppError(403, 'calls_disabled', 'Calls are turned off');
    if (to === userId) throw badRequest('You cannot call yourself');
    this.rateLimit(userId);
    if (this.byUser.has(userId)) throw new AppError(409, 'in_call', 'You are already in a call');
    await this.d.assertCanCall(userId, to);
    const [me, peer] = await Promise.all([this.d.publicUser(userId), this.d.publicUser(to)]);
    if (!me || !peer) throw new AppError(404, 'not_found', 'Player not found');
    if (this.byUser.has(to)) {
      void this.d.logCall(userId, to, 'busy', 0, video).catch(() => undefined);
      throw new AppError(409, 'busy', 'This player is on another call');
    }
    const c: Call = { id: ulid(), host: userId, started: false, video, members: new Map([[userId, { user: me, inviter: 0, state: 'active', joinedAt: Date.now(), socket: socketId }]]) };
    this.calls.set(c.id, c);
    this.byUser.set(userId, c.id);
    this.ring(c, me, peer);
    return { callId: c.id, peer };
  }

  /** Someone in a live call brings in a friend. */
  async add(userId: number, callId: string, to: number) {
    const c = this.calls.get(callId);
    const me = c?.members.get(userId);
    if (!c || !c.started || me?.state !== 'active') throw new AppError(410, 'call_over', 'This call has ended');
    if (c.members.has(to)) return { ok: true };
    if (c.members.size >= CALL_MAX_PEOPLE) throw new AppError(409, 'call_full', `Up to ${CALL_MAX_PEOPLE} people can be in a call`);
    this.rateLimit(userId);
    await this.d.assertCanCall(userId, to);
    const peer = await this.d.publicUser(to);
    if (!peer) throw new AppError(404, 'not_found', 'Player not found');
    if (this.byUser.has(to)) throw new AppError(409, 'busy', 'This player is on another call');
    if (!this.calls.has(callId)) throw new AppError(410, 'call_over', 'This call has ended');
    this.ring(c, me.user, peer);
    this.broadcast(c);
    return { ok: true };
  }

  answer(userId: number, socketId: string, callId: string) {
    const c = this.calls.get(callId);
    const m = c?.members.get(userId);
    if (!c || !m) throw new AppError(410, 'call_over', 'This call has ended');
    if (m.state === 'active') return;
    clearTimeout(m.ring);
    m.state = 'active';
    m.joinedAt = Date.now();
    m.socket = socketId;
    if (!c.started) {
      c.started = true;
      const host = c.members.get(c.host);
      if (host) host.joinedAt = Date.now();
      this.d.emit(c.host, 'call:accepted', { callId });
    }
    void this.d.endPush(userId, callId).catch(() => undefined);
    this.d.emit(userId, 'call:accepted', { callId, elsewhere: true }, socketId);
    this.broadcast(c);
  }

  decline(userId: number, callId: string) {
    const c = this.calls.get(callId);
    if (c?.members.get(userId)?.state === 'ringing') this.removeMember(c, userId, 'declined');
  }

  /** Hang up: leave the call (it ends when fewer than two people are left). */
  end(userId: number, callId: string) {
    const c = this.calls.get(callId);
    const m = c?.members.get(userId);
    if (!c || !m) return;
    if (m.state === 'ringing') return this.removeMember(c, userId, 'declined');
    if (!c.started) return void this.finishAll(c, 'cancelled');
    this.removeMember(c, userId, 'ended');
  }

  /** Phone came online: still ringing for it? Show the call screen again. */
  async onConnect(userId: number) {
    const id = this.byUser.get(userId);
    const c = id ? this.calls.get(id) : null;
    const m = c?.members.get(userId);
    if (!c || m?.state !== 'ringing') return;
    const from = c.members.get(m.inviter)?.user ?? (await this.d.publicUser(m.inviter));
    if (from && this.calls.has(c.id)) this.d.emit(userId, 'call:incoming', { callId: c.id, from, ...(c.video ? { video: true } : {}) });
  }

  /** A phone dropped: give it a short while to come back before it leaves the call. */
  onDisconnect(userId: number, socketId: string) {
    const id = this.byUser.get(userId);
    const c = id ? this.calls.get(id) : null;
    const m = c?.members.get(userId);
    if (!c || !m || m.socket !== socketId || m.lost) return;
    m.lost = setTimeout(() => this.removeMember(c, userId, 'lost'), LOST_MS);
  }

  /** Who is in the call (to everyone in it). */
  private broadcast(c: Call) {
    const members = [...c.members.values()].map((m) => ({ user: m.user, state: m.state }));
    for (const uid of c.members.keys()) this.d.emit(uid, 'call:members', { callId: c.id, members });
  }

  /** One person is out of the call; writes their call into the chat. */
  private drop(c: Call, uid: number, reason: CallEndReason) {
    const m = c.members.get(uid);
    if (!m) return;
    c.members.delete(uid);
    clearTimeout(m.ring);
    clearTimeout(m.lost);
    if (this.byUser.get(uid) === c.id) this.byUser.delete(uid);
    const wasRinging = m.state === 'ringing';
    const secs = !wasRinging && c.started ? Math.max(1, Math.round((Date.now() - m.joinedAt) / 1000)) : 0;
    this.d.emit(uid, 'call:ended', { callId: c.id, reason, secs });
    if (wasRinging) void this.d.endPush(uid, c.id).catch(() => undefined);
    else this.d.closeVoice(c.id, uid);
    if (uid === c.host || !m.inviter) return;
    const status: CallStatus = !wasRinging && c.started ? 'done' : reason === 'declined' ? 'declined' : reason === 'cancelled' ? 'cancelled' : 'missed';
    void (async () => {
      try {
        await this.d.logCall(m.inviter, uid, status, secs, c.video);
        if (status === 'missed' || status === 'cancelled') {
          const from = c.members.get(m.inviter)?.user ?? (await this.d.publicUser(m.inviter));
          if (from) await this.d.missedPush(uid, from, c.id, c.video);
        }
      } catch (err) {
        this.d.log.warn({ err }, 'call log failed');
      }
    })();
  }

  private removeMember(c: Call, uid: number, reason: CallEndReason) {
    if (!this.calls.has(c.id)) return;
    this.drop(c, uid, reason);
    const active = [...c.members.values()].filter((m) => m.state === 'active').length;
    const ringing = c.members.size - active;
    // Nobody picked up yet: over when nobody rings any more (the host hears why).
    if (!c.started) {
      if (!ringing) this.finishAll(c, reason === 'lost' ? 'missed' : reason);
      return;
    }
    if (active < 2 && !ringing) return this.finishAll(c, 'ended');
    this.broadcast(c);
  }

  private finishAll(c: Call, reason: CallEndReason) {
    if (!this.calls.delete(c.id)) return;
    // The ringing ones first (their record says "missed"), then whoever is still talking.
    const order = [...c.members.values()].sort((a, b) => Number(b.state === 'ringing') - Number(a.state === 'ringing'));
    for (const m of order) this.drop(c, m.user.id, m.state === 'ringing' ? (reason === 'cancelled' ? 'cancelled' : 'missed') : reason);
    this.d.closeVoice(c.id);
  }
}
