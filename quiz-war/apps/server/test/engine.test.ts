import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeEngine, player } from './helpers';

beforeEach(() => vi.useFakeTimers({ now: new Date('2026-10-08T10:00:00Z') }));
afterEach(() => vi.useRealTimers());

async function toFirstQuestion(engine: any, m: any) {
  await vi.advanceTimersByTimeAsync(m.settings.match.countdownSec * 1000 + 1);
  expect(m.state).toBe('question');
}

describe('GameEngine — 1 VS 1', () => {
  it('two players answering simultaneously are both scored by the server', async () => {
    const { engine, last } = makeEngine();
    const m = await engine.createMatch({ mode: 'duel', source: 'matchmaking', players: [player(1, 0), player(2, 1)], autoStart: true, questionCount: 3 });
    await toFirstQuestion(engine, m);
    await vi.advanceTimersByTimeAsync(1000);
    const q0 = m.questions[0];
    const a = engine.submitAnswer(m.id, 1, 0, q0.correctIndex);
    const b = engine.submitAnswer(m.id, 2, 0, (q0.correctIndex + 1) % 4);
    expect(a.correct).toBe(true);
    expect(b.correct).toBe(false);
    expect(a.points).toBeGreaterThan(100);
    // both answered → round ends immediately with a reveal
    expect(m.state).toBe('reveal');
    const reveal = last('match:reveal');
    expect(reveal.correctIndex).toBe(q0.correctIndex);
    expect(reveal.teamScores[0]).toBe(a.points);
    expect(reveal.teamScores[1]).toBe(0);
  });

  it('client cannot answer for a stale or future question, or after the deadline', async () => {
    const { engine } = makeEngine();
    const m = await engine.createMatch({ mode: 'duel', source: 'matchmaking', players: [player(1, 0), player(2, 1)], autoStart: true, questionCount: 3 });
    expect(() => engine.submitAnswer(m.id, 1, 0, 0)).toThrow(/closed/);
    await toFirstQuestion(engine, m);
    expect(() => engine.submitAnswer(m.id, 1, 1, 0)).toThrow(/no longer active/);
    expect(() => engine.submitAnswer(m.id, 1, 0, 7)).toThrow(/Invalid option/);
    expect(() => engine.submitAnswer(m.id, 99, 0, 0)).toThrow(/not part/);
    await vi.advanceTimersByTimeAsync(m.questionTimeMs + 300);
    // within latency grace the round is still open but deadline passed → accepted only within grace
    await vi.advanceTimersByTimeAsync(200);
    expect(() => engine.submitAnswer(m.id, 1, 0, 0)).toThrow();
  });

  it('rejects duplicate answer submissions', async () => {
    const { engine, persistence } = makeEngine();
    const m = await engine.createMatch({ mode: 'duel', source: 'matchmaking', players: [player(1, 0), player(2, 1)], autoStart: true, questionCount: 3 });
    await toFirstQuestion(engine, m);
    engine.submitAnswer(m.id, 1, 0, 0);
    expect(() => engine.submitAnswer(m.id, 1, 0, 1)).toThrow(/already answered/);
    await engine.flush(m.id);
    expect(persistence.answers.filter((a) => a.userId === 1 && a.questionIndex === 0)).toHaveLength(1);
  });

  it('times out unanswered rounds, resets combo and finishes with a winner + rewards', async () => {
    const { engine, last, rewardsCalls } = makeEngine();
    const m = await engine.createMatch({ mode: 'duel', source: 'matchmaking', players: [player(1, 0), player(2, 1)], autoStart: true, questionCount: 2 });
    await toFirstQuestion(engine, m);
    engine.submitAnswer(m.id, 1, 0, m.questions[0].correctIndex);
    // player 2 never answers → round closes at deadline
    await vi.advanceTimersByTimeAsync(m.questionTimeMs + 1000);
    expect(m.state).toBe('reveal');
    await vi.advanceTimersByTimeAsync(m.settings.match.revealMs + 10);
    expect(m.currentIndex).toBe(1);
    engine.submitAnswer(m.id, 1, 1, m.questions[1].correctIndex);
    engine.submitAnswer(m.id, 2, 1, m.questions[1].correctIndex);
    await vi.advanceTimersByTimeAsync(5000);
    expect(m.state).toBe('finished');
    const end = last('match:end');
    expect(end.winnerTeam).toBe(0);
    expect(rewardsCalls).toContain(m.id);
    expect(m.players[0].bestCombo).toBe(2);
  });

  it('combo multiplies points for consecutive correct answers', async () => {
    const { engine } = makeEngine();
    const m = await engine.createMatch({ mode: 'duel', source: 'matchmaking', players: [player(1, 0), player(2, 1)], autoStart: true, questionCount: 5 });
    await toFirstQuestion(engine, m);
    const pts: number[] = [];
    for (let i = 0; i < 3; i++) {
      pts.push(engine.submitAnswer(m.id, 1, i, m.questions[i].correctIndex).points);
      engine.submitAnswer(m.id, 2, i, (m.questions[i].correctIndex + 1) % 4);
      await vi.advanceTimersByTimeAsync(m.settings.match.revealMs + 10);
    }
    expect(pts[2]).toBeGreaterThan(pts[0]);
    expect(m.players[0].combo).toBe(3);
    expect(m.players[1].combo).toBe(0);
  });
});

describe('GameEngine — Duo (2 VS 2)', () => {
  it('sums team scores across 4 players', async () => {
    const { engine, last } = makeEngine();
    const m = await engine.createMatch({
      mode: 'duo',
      source: 'matchmaking',
      players: [player(1, 0), player(2, 0), player(3, 1), player(4, 1)],
      autoStart: true,
      questionCount: 1,
    });
    await toFirstQuestion(engine, m);
    const c = m.questions[0].correctIndex;
    const r1 = engine.submitAnswer(m.id, 1, 0, c);
    const r2 = engine.submitAnswer(m.id, 2, 0, c);
    const r3 = engine.submitAnswer(m.id, 3, 0, c);
    engine.submitAnswer(m.id, 4, 0, (c + 1) % 4);
    expect(m.state).toBe('reveal');
    expect(last('match:reveal').teamScores).toEqual([r1.points + r2.points, r3.points]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(last('match:end').winnerTeam).toBe(0);
  });

  it('rejects incomplete teams for auto-started team matches', async () => {
    const { engine } = makeEngine();
    await expect(
      engine.createMatch({ mode: 'duo', source: 'matchmaking', players: [player(1, 0), player(2, 1), player(3, 1)], autoStart: true }),
    ).rejects.toThrow(/not complete/);
  });
});

describe('GameEngine — disconnect handling', () => {
  it('player disconnecting during a question can reconnect within grace and resume', async () => {
    const { engine, last } = makeEngine();
    const m = await engine.createMatch({ mode: 'duel', source: 'matchmaking', players: [player(1, 0), player(2, 1)], autoStart: true, questionCount: 3 });
    await toFirstQuestion(engine, m);
    engine.playerDisconnected(2);
    expect(last('match:player')).toMatchObject({ userId: 2, connected: false });
    await vi.advanceTimersByTimeAsync(3000);
    const snap = engine.resume(2);
    expect(snap?.matchId).toBe(m.id);
    expect(snap?.state).toBe('question');
    expect(snap?.currentQuestion?.index).toBe(0);
    expect(snap?.you?.answeredIndex).toBeNull();
    // the reconnected player can still answer the current question
    expect(engine.submitAnswer(m.id, 2, 0, 0)).toBeDefined();
    expect(m.players[1].connected).toBe(true);
  });

  it('an online player who stops answering is warned, then removed as AFK and loses by forfeit', async () => {
    const { engine, events, last } = makeEngine();
    const m = await engine.createMatch({ mode: 'duel', source: 'matchmaking', players: [player(1, 0), player(2, 1)], autoStart: true, questionCount: 10 });
    await toFirstQuestion(engine, m);
    const limit = m.settings.penalties.afkMissLimit;
    for (let i = 0; i < limit; i++) {
      engine.submitAnswer(m.id, 1, i, m.questions[i].correctIndex);
      await vi.advanceTimersByTimeAsync(m.questionTimeMs + 1000);
      if (i === limit - 2) expect(events.find((e) => e.event === 'match:afk_warning' && e.to === 'user:2')?.payload).toMatchObject({ missed: limit - 1, limit });
      if (i < limit - 1) await vi.advanceTimersByTimeAsync(m.settings.match.revealMs + 10);
    }
    await vi.advanceTimersByTimeAsync(10);
    expect(m.players[1].forfeited).toBe(true);
    expect(m.state).toBe('finished');
    expect(last('match:end')).toMatchObject({ reason: 'forfeit', winnerTeam: 0 });
  });

  it('a match where nobody is playing any more is aborted without rewards', async () => {
    const { engine, rewardsCalls } = makeEngine();
    const m = await engine.createMatch({ mode: 'duel', source: 'matchmaking', players: [player(1, 0), player(2, 1)], autoStart: true, questionCount: 10 });
    await toFirstQuestion(engine, m);
    await vi.advanceTimersByTimeAsync((m.questionTimeMs + m.settings.match.revealMs + 1000) * m.settings.penalties.afkMissLimit);
    expect(m.state).toBe('aborted');
    expect(rewardsCalls).toHaveLength(0);
  });

  it('opponent wins by forfeit when the grace period expires', async () => {
    const { engine, last, settings } = makeEngine();
    const m = await engine.createMatch({ mode: 'duel', source: 'matchmaking', players: [player(1, 0), player(2, 1)], autoStart: true, questionCount: 10 });
    await toFirstQuestion(engine, m);
    engine.playerDisconnected(2);
    await vi.advanceTimersByTimeAsync(settings.disconnect.graceSec * 1000 + 50);
    expect(m.state).toBe('finished');
    expect(last('match:end')).toMatchObject({ winnerTeam: 0, reason: 'forfeit' });
    expect(engine.activeMatchOf(2)).toBeUndefined();
  });

  it('match is not destroyed instantly on disconnect', async () => {
    const { engine } = makeEngine();
    const m = await engine.createMatch({ mode: 'duel', source: 'matchmaking', players: [player(1, 0), player(2, 1)], autoStart: true, questionCount: 10 });
    await toFirstQuestion(engine, m);
    engine.playerDisconnected(1);
    expect(['question', 'reveal']).toContain(m.state);
    expect(engine.activeMatchOf(1)?.id).toBe(m.id);
  });
});

describe('GameEngine — AI opponent', () => {
  it('bot answers on its own and the match completes as type ai', async () => {
    const { engine, last } = makeEngine();
    const m = await engine.createMatch({ mode: 'duel', source: 'ai', players: [player(1, 0)], bots: [{ team: 1, level: 'expert' }], autoStart: true, questionCount: 2 });
    expect(m.type).toBe('ai');
    expect(m.ranked).toBe(false);
    const bot = m.players.find((p) => p.isBot)!;
    expect(bot.username).toContain('🤖');
    await toFirstQuestion(engine, m);
    await vi.advanceTimersByTimeAsync(m.questionTimeMs);
    expect(bot.answers.has(0)).toBe(true);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(m.state).toBe('finished');
    expect(last('match:end').type).toBe('ai');
  });
});

describe('GameEngine — solo modes', () => {
  it('survival ends on the first wrong answer', async () => {
    const { engine, last } = makeEngine();
    const m = await engine.createMatch({ mode: 'survival', source: 'solo', players: [player(1, 0)], autoStart: true });
    await vi.advanceTimersByTimeAsync(3000);
    engine.submitAnswer(m.id, 1, 0, m.questions[0].correctIndex);
    await vi.advanceTimersByTimeAsync(1500);
    engine.submitAnswer(m.id, 1, 1, (m.questions[1].correctIndex + 1) % 4);
    await vi.advanceTimersByTimeAsync(3000);
    expect(m.state).toBe('finished');
    expect(last('match:end').reason).toBe('wrong_answer');
    expect(m.players[0].correct).toBe(1);
  });

  it('speed round stops at the overall time limit', async () => {
    const { engine, last, settings } = makeEngine();
    const m = await engine.createMatch({ mode: 'speed', source: 'solo', players: [player(1, 0)], autoStart: true });
    expect(m.endsAt).not.toBeNull();
    await vi.advanceTimersByTimeAsync(settings.speedRound.totalTimeSec * 1000 + 20_000);
    expect(m.state).toBe('finished');
    expect(last('match:end').reason).toBe('time_up');
  });
});

describe('GameEngine — power-ups', () => {
  it('50/50 removes exactly two wrong options and respects the per-match limit', async () => {
    const { engine } = makeEngine();
    const m = await engine.createMatch({ mode: 'duel', source: 'ai', players: [player(1, 0)], bots: [{ team: 1, level: 'easy' }], autoStart: true, questionCount: 5 });
    await toFirstQuestion(engine, m);
    const r = await engine.usePowerUp(m.id, 1, 0, 'fifty_fifty');
    expect(r.removedOptions).toHaveLength(2);
    expect(r.removedOptions).not.toContain(m.questions[0].correctIndex);
    await expect(engine.usePowerUp(m.id, 1, 0, 'double_score')).rejects.toThrow(/one power-up/i);
    engine.submitAnswer(m.id, 1, 0, 0);
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(engine.usePowerUp(m.id, 1, m.currentIndex, 'fifty_fifty')).rejects.toThrow(/limit/);
  });

  it('power-ups are blocked in ranked battles by default and without inventory', async () => {
    const { engine } = makeEngine({ walletOk: false });
    const m = await engine.createMatch({ mode: 'duel', source: 'matchmaking', ranked: true, players: [player(1, 0), player(2, 1)], autoStart: true });
    await toFirstQuestion(engine, m);
    await expect(engine.usePowerUp(m.id, 1, 0, 'hint')).rejects.toThrow(/ranked/);
    const m2 = await engine.createMatch({ mode: 'duel', source: 'ai', players: [player(3, 0)], bots: [{ team: 1, level: 'easy' }], autoStart: true });
    await toFirstQuestion(engine, m2);
    await expect(engine.usePowerUp(m2.id, 3, 0, 'time_boost')).rejects.toThrow(/don't have/);
  });

  it('time boost extends only the personal deadline', async () => {
    const { engine } = makeEngine();
    const m = await engine.createMatch({ mode: 'duel', source: 'ai', players: [player(1, 0)], bots: [{ team: 1, level: 'easy' }], autoStart: true });
    await toFirstQuestion(engine, m);
    const before = m.players[0].roundDeadline;
    const r = await engine.usePowerUp(m.id, 1, 0, 'time_boost');
    expect(r.deadline).toBe(before + m.settings.powerUps.timeBoostSec * 1000);
    expect(m.players[1].roundDeadline).toBe(before);
  });
});

describe('GameEngine — War Room', () => {
  it('challenge rooms start when both players are ready', async () => {
    const { engine, last } = makeEngine();
    const m = await engine.createMatch({ mode: 'duel', source: 'challenge', players: [player(1, 0), player(2, 1)] });
    expect(m.state).toBe('lobby');
    engine.setReady(m.id, 1, true);
    expect(last('room:state').players.find((p: any) => p.userId === 1).ready).toBe(true);
    expect(m.state).toBe('lobby');
    engine.setReady(m.id, 2, true);
    await vi.advanceTimersByTimeAsync(10);
    expect(m.state).toBe('countdown');
  });

  it('custom room: host starts once players joined and are ready; only host can start', async () => {
    const { engine } = makeEngine();
    const m = await engine.createMatch({ mode: 'duo', source: 'room', players: [player(1, 0)], hostUserId: 1 });
    await engine.joinMatch(m.id, player(2));
    await engine.joinMatch(m.id, player(3));
    expect(m.players.map((p) => p.team).sort()).toEqual([0, 0, 1]);
    for (const id of [1, 2, 3]) engine.setReady(m.id, id, true);
    await expect(engine.hostStart(m.id, 2)).rejects.toThrow(/host/);
    await engine.hostStart(m.id, 1);
    expect(m.state).toBe('countdown');
    await expect(engine.joinMatch(m.id, player(4))).rejects.toThrow(/already started/);
  });

  it('a player cannot be in two matches at once', async () => {
    const { engine } = makeEngine();
    await engine.createMatch({ mode: 'duel', source: 'challenge', players: [player(1, 0), player(2, 1)] });
    await expect(engine.createMatch({ mode: 'solo', source: 'solo', players: [player(1, 0)], autoStart: true })).rejects.toThrow(/already in a match/);
  });
});
