import { MODES, type AiLevel, type GameSettings, type ModeKey } from '@quizwar/shared';
import { randomToken } from '../../lib/crypto';
import { GameError, type GameEngine } from '../../game/engine';
import type { Emitter, PlayerIdentity } from '../../game/types';

export interface Ticket {
  id: string;
  user: PlayerIdentity;
  mode: ModeKey;
  ranked: boolean;
  categoryId: number | null;
  joinedAt: number;
  aiOffered: boolean;
  blocked: Set<number>;
  firstMatch: boolean;
}

/**
 * Quick Battle matchmaking. Tickets are bucketed by mode + ranked; every tick the oldest
 * tickets look for opponents within a rating window that widens the longer they wait.
 * The same pair is not matched again within the rematch cooldown. If nobody suitable shows
 * up within `aiFallbackSec`, the player is offered (or auto-started into) an AI battle.
 */
export class MatchmakingService {
  private tickets = new Map<number, Ticket>();
  private recentPairs = new Map<string, number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;

  constructor(
    private readonly engine: GameEngine,
    private readonly settings: () => GameSettings,
    private readonly emitter: Emitter,
    private readonly log?: { error: (o: object, m: string) => void },
  ) {}

  start(intervalMs = 1000) {
    this.timer ??= setInterval(() => void this.tick(), intervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  size() {
    return this.tickets.size;
  }

  isQueued(userId: number) {
    return this.tickets.has(userId);
  }

  join(user: PlayerIdentity, o: { mode: ModeKey; ranked: boolean; categoryId: number | null; blocked: Set<number>; firstMatch?: boolean }): Ticket {
    const def = MODES[o.mode];
    if (!def?.matchmaking) throw new GameError('invalid_mode', 'This mode does not support Quick Battle');
    if (this.engine.activeMatchOf(user.userId)) throw new GameError('already_in_match', 'You are already in a match');
    const t: Ticket = {
      id: randomToken(8),
      user,
      mode: o.mode,
      ranked: o.ranked && this.settings().ranked.enabled,
      categoryId: o.categoryId,
      joinedAt: Date.now(),
      aiOffered: false,
      blocked: o.blocked,
      firstMatch: !!o.firstMatch,
    };
    this.tickets.set(user.userId, t);
    return t;
  }

  leave(userId: number) {
    return this.tickets.delete(userId);
  }

  private windowFor(t: Ticket, now: number) {
    const s = this.settings().matchmaking;
    const waited = (now - t.joinedAt) / 1000;
    return Math.min(s.maxRatingWindow, s.initialRatingWindow + waited * s.windowGrowthPerSec);
  }

  private compatible(a: Ticket, b: Ticket, now: number) {
    if (a.mode !== b.mode || a.ranked !== b.ranked) return false;
    if (a.categoryId && b.categoryId && a.categoryId !== b.categoryId) return false;
    if (a.blocked.has(b.user.userId) || b.blocked.has(a.user.userId)) return false;
    const diff = Math.abs(a.user.rating - b.user.rating);
    if (diff > this.windowFor(a, now) || diff > this.windowFor(b, now)) return false;
    const cooldown = this.settings().matchmaking.rematchCooldownMin * 60_000;
    const last = this.recentPairs.get(pairKey(a.user.userId, b.user.userId));
    if (last && now - last < cooldown) return false;
    return true;
  }

  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const now = Date.now();
      const s = this.settings();
      const waiting = [...this.tickets.values()].sort((a, b) => a.joinedAt - b.joinedAt);
      const used = new Set<number>();
      for (const t of waiting) {
        if (used.has(t.user.userId) || !this.tickets.has(t.user.userId)) continue;
        const size = MODES[t.mode].teams * MODES[t.mode].teamSize;
        const group = [t];
        for (const c of waiting) {
          if (group.length >= size) break;
          if (c === t || used.has(c.user.userId)) continue;
          if (group.every((g) => this.compatible(g, c, now))) group.push(c);
        }
        if (group.length === size) {
          group.forEach((g) => used.add(g.user.userId));
          await this.startHumanMatch(group);
          continue;
        }
        const waited = (now - t.joinedAt) / 1000;
        if (!t.aiOffered && s.ai.enabled && (waited >= s.matchmaking.aiFallbackSec || t.firstMatch)) {
          t.aiOffered = true;
          if (s.ai.autoStartOnFallback || t.firstMatch) {
            used.add(t.user.userId);
            await this.acceptAi(t.user.userId, t.firstMatch ? 'easy' : s.ai.defaultLevel).catch((err) => this.log?.error({ err }, 'ai fallback failed'));
          } else {
            this.emitter.toUser(t.user.userId, 'mm:ai_offer', { level: s.ai.defaultLevel });
          }
          continue;
        }
        if (waited >= s.matchmaking.timeoutSec) {
          this.tickets.delete(t.user.userId);
          this.emitter.toUser(t.user.userId, 'mm:timeout', undefined as never);
          continue;
        }
        this.emitter.toUser(t.user.userId, 'mm:status', { state: 'searching', elapsedSec: Math.floor(waited), mode: t.mode });
      }
      // forget old pairs
      const cutoff = now - s.matchmaking.rematchCooldownMin * 60_000;
      for (const [k, ts] of this.recentPairs) if (ts < cutoff) this.recentPairs.delete(k);
    } finally {
      this.busy = false;
    }
  }

  private async startHumanMatch(group: Ticket[]) {
    for (const g of group) this.tickets.delete(g.user.userId);
    const def = MODES[group[0].mode];
    // Balance teams: sort by rating and snake-draft (A B B A …) so team averages stay close.
    const sorted = [...group].sort((a, b) => b.user.rating - a.user.rating);
    const players = sorted.map((g, i) => {
      const round = Math.floor(i / def.teams);
      const pos = i % def.teams;
      const team = round % 2 === 0 ? pos : def.teams - 1 - pos;
      return { ...g.user, team };
    });
    const categoryId = group.find((g) => g.categoryId)?.categoryId ?? null;
    const now = Date.now();
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++) this.recentPairs.set(pairKey(group[i].user.userId, group[j].user.userId), now);
    try {
      const m = await this.engine.createMatch({
        mode: group[0].mode,
        source: 'matchmaking',
        ranked: group[0].ranked,
        categoryId,
        players,
        autoStart: true,
      });
      for (const g of group) this.emitter.toUser(g.user.userId, 'mm:found', { matchId: m.id });
    } catch (err) {
      this.log?.error({ err }, 'failed to start matched game');
      for (const g of group) this.emitter.toUser(g.user.userId, 'mm:timeout', undefined as never);
    }
  }

  /** Player accepted the AI offer (or AI was auto-started). Bots fill every empty slot. */
  async acceptAi(userId: number, level: AiLevel) {
    const t = this.tickets.get(userId);
    if (!t) throw new GameError('not_queued', 'You are not searching for a match');
    if (!this.settings().ai.enabled) throw new GameError('ai_disabled', 'AI battles are disabled right now');
    this.tickets.delete(userId);
    const def = MODES[t.mode];
    const bots: { team: number; level: AiLevel }[] = [];
    for (let team = 0; team < def.teams; team++) {
      const slots = team === 0 ? def.teamSize - 1 : def.teamSize;
      for (let i = 0; i < slots; i++) bots.push({ team, level });
    }
    const m = await this.engine.createMatch({
      mode: t.mode,
      source: 'ai',
      ranked: false,
      categoryId: t.categoryId,
      players: [{ ...t.user, team: 0 }],
      bots,
      autoStart: true,
    });
    this.emitter.toUser(userId, 'mm:found', { matchId: m.id });
    return m;
  }
}

function pairKey(a: number, b: number) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}
