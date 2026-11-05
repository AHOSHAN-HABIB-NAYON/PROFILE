import type { CallEndReason, CallStatus, PublicUser, ServerToClientEvents } from '@quizwar/shared';
import { AppError, badRequest } from '../lib/errors';
import { ulid } from '../lib/crypto';

/** How long a call rings before it counts as missed. */
export const RING_MS = 35_000;
/** A phone that dropped off the network gets this long to come back before the call ends. */
const LOST_MS = 25_000;

interface Call {
  id: string;
  caller: number;
  callee: number;
  state: 'ringing' | 'active';
  answeredAt: number;
  ring?: NodeJS.Timeout;
  /** userId → timer that ends the call if that phone does not come back. */
  lost: Map<number, NodeJS.Timeout>;
  /** userId → the device (socket) that is in the call. */
  sockets: Map<number, string>;
}

interface Deps {
  emit<E extends keyof ServerToClientEvents>(userId: number, event: E, payload: Parameters<ServerToClientEvents[E]>[0], exceptSocket?: string): void;
  publicUser(id: number): Promise<PublicUser | null>;
  assertCanCall(from: number, to: number): Promise<void>;
  logCall(caller: number, callee: number, status: CallStatus, secs: number): Promise<unknown>;
  ringPush(to: number, from: PublicUser, callId: string): Promise<void>;
  missedPush(to: number, from: PublicUser, callId: string): Promise<void>;
  /** Stop the ringing notification on the callee's phones. */
  endPush(to: number, callId: string): Promise<void>;
  /** Drop both phones from the call's voice room. */
  closeVoice(callId: string): void;
  enabled(): boolean;
  log: { warn: (o: object, m: string) => void };
}

/**
 * One-to-one audio calls. The server only rings, keeps who is in which call, and writes the call
 * into the chat when it ends; the sound itself goes phone-to-phone through the voice room that
 * has the call id as its room id.
 */
export class CallService {
  private calls = new Map<string, Call>();
  private byUser = new Map<number, string>();
  private lastStart = new Map<number, number>();

  constructor(private readonly d: Deps) {}

  has(callId: string) {
    return this.calls.has(callId);
  }

  /** May this user be in the call's voice room right now? (picked-up calls only) */
  isMember(callId: string, userId: number) {
    const c = this.calls.get(callId);
    return !!c && c.state === 'active' && (c.caller === userId || c.callee === userId);
  }

  /** The user's phone (maybe a new connection) is in the call: stop the "lost" countdown. */
  bind(callId: string, userId: number, socketId: string) {
    const c = this.calls.get(callId);
    if (!c) return;
    c.sockets.set(userId, socketId);
    const t = c.lost.get(userId);
    if (t) clearTimeout(t);
    c.lost.delete(userId);
  }

  async start(userId: number, socketId: string, to: number) {
    if (!this.d.enabled()) throw new AppError(403, 'calls_disabled', 'Calls are turned off');
    if (to === userId) throw badRequest('You cannot call yourself');
    const now = Date.now();
    if (now - (this.lastStart.get(userId) ?? 0) < 3000) throw new AppError(429, 'rate_limited', 'Please wait a moment');
    this.lastStart.set(userId, now);
    if (this.lastStart.size > 20_000) this.lastStart.clear();
    if (this.byUser.has(userId)) throw new AppError(409, 'in_call', 'You are already in a call');
    await this.d.assertCanCall(userId, to);
    const [me, peer] = await Promise.all([this.d.publicUser(userId), this.d.publicUser(to)]);
    if (!me || !peer) throw new AppError(404, 'not_found', 'Player not found');
    if (this.byUser.has(to)) {
      void this.d.logCall(userId, to, 'busy', 0).catch(() => undefined);
      throw new AppError(409, 'busy', 'This player is on another call');
    }
    const c: Call = { id: ulid(), caller: userId, callee: to, state: 'ringing', answeredAt: 0, lost: new Map(), sockets: new Map([[userId, socketId]]) };
    this.calls.set(c.id, c);
    this.byUser.set(userId, c.id);
    this.byUser.set(to, c.id);
    c.ring = setTimeout(() => void this.finish(c.id, 'missed'), RING_MS);
    this.d.emit(to, 'call:incoming', { callId: c.id, from: me });
    void this.d.ringPush(to, me, c.id).catch(() => undefined);
    return { callId: c.id, peer };
  }

  answer(userId: number, socketId: string, callId: string) {
    const c = this.calls.get(callId);
    if (!c || c.callee !== userId) throw new AppError(410, 'call_over', 'This call has ended');
    if (c.state === 'active') return;
    clearTimeout(c.ring);
    c.state = 'active';
    c.answeredAt = Date.now();
    c.sockets.set(userId, socketId);
    this.d.emit(c.caller, 'call:accepted', { callId });
    void this.d.endPush(userId, callId).catch(() => undefined);
    this.d.emit(userId, 'call:accepted', { callId, elsewhere: true }, socketId);
  }

  decline(userId: number, callId: string) {
    const c = this.calls.get(callId);
    if (!c || c.callee !== userId || c.state !== 'ringing') return;
    void this.finish(callId, 'declined');
  }

  end(userId: number, callId: string) {
    const c = this.calls.get(callId);
    if (!c || (c.caller !== userId && c.callee !== userId)) return;
    if (c.state === 'active') return void this.finish(callId, 'ended');
    void this.finish(callId, c.caller === userId ? 'cancelled' : 'declined');
  }

  /** Phone came online: still ringing for it? Show the call screen again. */
  async onConnect(userId: number) {
    const id = this.byUser.get(userId);
    const c = id ? this.calls.get(id) : null;
    if (!c || c.state !== 'ringing' || c.callee !== userId) return;
    const from = await this.d.publicUser(c.caller);
    if (from && this.calls.has(c.id)) this.d.emit(userId, 'call:incoming', { callId: c.id, from });
  }

  /** A phone dropped: give it a short while to come back before the call ends. */
  onDisconnect(userId: number, socketId: string) {
    const id = this.byUser.get(userId);
    const c = id ? this.calls.get(id) : null;
    if (!c || c.sockets.get(userId) !== socketId || c.lost.has(userId)) return;
    c.lost.set(userId, setTimeout(() => void this.finish(c.id, 'lost'), LOST_MS));
  }

  private async finish(callId: string, reason: CallEndReason) {
    const c = this.calls.get(callId);
    if (!c) return;
    this.calls.delete(callId);
    clearTimeout(c.ring);
    for (const t of c.lost.values()) clearTimeout(t);
    if (this.byUser.get(c.caller) === callId) this.byUser.delete(c.caller);
    if (this.byUser.get(c.callee) === callId) this.byUser.delete(c.callee);
    if (c.state === 'ringing') void this.d.endPush(c.callee, callId).catch(() => undefined);
    const secs = c.state === 'active' ? Math.max(1, Math.round((Date.now() - c.answeredAt) / 1000)) : 0;
    const status: CallStatus = c.state === 'active' ? 'done' : reason === 'declined' ? 'declined' : reason === 'cancelled' ? 'cancelled' : 'missed';
    for (const u of [c.caller, c.callee]) this.d.emit(u, 'call:ended', { callId, reason, secs });
    this.d.closeVoice(callId);
    try {
      await this.d.logCall(c.caller, c.callee, status, secs);
      if (status === 'missed' || status === 'cancelled') {
        const from = await this.d.publicUser(c.caller);
        if (from) await this.d.missedPush(c.callee, from, callId);
      }
    } catch (err) {
      this.d.log.warn({ err }, 'call log failed');
    }
  }
}
