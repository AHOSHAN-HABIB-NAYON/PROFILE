import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MatchmakingService } from '../src/modules/matchmaking/matchmaking.service';
import { makeEngine, player } from './helpers';

beforeEach(() => vi.useFakeTimers({ now: new Date('2026-10-08T10:00:00Z') }));
afterEach(() => vi.useRealTimers());

function setup(patch: (s: any) => void = () => undefined) {
  const e = makeEngine();
  patch(e.settings);
  const mm = new MatchmakingService(e.engine, () => e.settings, e.emitter);
  return { ...e, mm };
}

const opts = { mode: 'duel' as const, ranked: true, categoryId: null, blocked: new Set<number>() };

describe('Matchmaking', () => {
  it('pairs two players with similar rating', async () => {
    const { mm, events, engine } = setup();
    mm.join(player(1), opts);
    mm.join({ ...player(2), rating: 1050 }, opts);
    await mm.tick();
    const found = events.filter((e) => e.event === 'mm:found');
    expect(found).toHaveLength(2);
    expect(found[0].payload.matchId).toBe(found[1].payload.matchId);
    expect(engine.get(found[0].payload.matchId)!.ranked).toBe(true);
    expect(mm.size()).toBe(0);
  });

  it('does not pair very different ratings until the window has grown', async () => {
    const { mm, events } = setup((s) => (s.matchmaking.aiFallbackSec = 120));
    mm.join(player(1), opts);
    mm.join({ ...player(2), rating: 1500 }, opts);
    await mm.tick();
    expect(events.filter((e) => e.event === 'mm:found')).toHaveLength(0);
    vi.advanceTimersByTime(30_000); // window = 100 + 30*15 = 550
    await mm.tick();
    expect(events.filter((e) => e.event === 'mm:found')).toHaveLength(2);
  });

  it('never pairs blocked players', async () => {
    const { mm, events } = setup();
    mm.join(player(1), { ...opts, blocked: new Set([2]) });
    mm.join(player(2), opts);
    await mm.tick();
    expect(events.filter((e) => e.event === 'mm:found')).toHaveLength(0);
  });

  it('offers an AI battle after the fallback timeout and starts it on accept', async () => {
    const { mm, events, settings, engine } = setup();
    mm.join(player(1), opts);
    vi.advanceTimersByTime(settings.matchmaking.aiFallbackSec * 1000);
    await mm.tick();
    expect(events.find((e) => e.event === 'mm:ai_offer')?.to).toBe('user:1');
    const m = await mm.acceptAi(1, 'hard');
    expect(m.type).toBe('ai');
    expect(m.ranked).toBe(false);
    expect(m.players.filter((p) => p.isBot)).toHaveLength(1);
    expect(engine.activeMatchOf(1)?.id).toBe(m.id);
  });

  it("a brand-new player's first Quick Battle starts a beginner AI match immediately", async () => {
    const { mm, engine } = setup();
    mm.join(player(1), { ...opts, firstMatch: true });
    await mm.tick();
    const m = engine.activeMatchOf(1)!;
    expect(m.type).toBe('ai');
    expect(m.players.find((p) => p.isBot)!.botLevel).toBe('easy');
  });

  it('times out when AI is disabled and nobody is found', async () => {
    const { mm, events, settings } = setup((s) => (s.ai.enabled = false));
    mm.join(player(1), opts);
    vi.advanceTimersByTime(settings.matchmaking.timeoutSec * 1000);
    await mm.tick();
    expect(events.some((e) => e.event === 'mm:timeout')).toBe(true);
    expect(mm.isQueued(1)).toBe(false);
  });

  it('forms balanced 2 VS 2 teams', async () => {
    const { mm, events, engine } = setup();
    const ratings = [1200, 1180, 1100, 1090];
    ratings.forEach((r, i) => mm.join({ ...player(i + 1), rating: r }, { ...opts, mode: 'duo' }));
    vi.advanceTimersByTime(10_000);
    await mm.tick();
    const id = events.find((e) => e.event === 'mm:found')!.payload.matchId;
    const m = engine.get(id)!;
    const avg = (t: number) => m.players.filter((p) => p.team === t).reduce((a, p) => a + p.rating, 0) / 2;
    expect(Math.abs(avg(0) - avg(1))).toBeLessThanOrEqual(20);
  });
});
