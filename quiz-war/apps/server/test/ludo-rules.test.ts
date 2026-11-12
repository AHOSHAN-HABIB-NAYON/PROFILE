import { describe, expect, it } from 'vitest';
import { applyMove, newLudoGame, trackIndex, type LudoState } from '@quizwar/shared';

/** Put a token so it stands on a given track square (0–51). */
const progressFor = (color: number, idx: number) => (idx - color * 13 + 52) % 52;

describe('ludo capture rules', () => {
  const setup = () => {
    // 2 vs 2: seats 0+2 vs 1+3.
    const s: LudoState = newLudoGame([3, 0, 1, 2], [0, 1, 0, 1]);
    return s;
  };

  it('two partner tokens on one square (a joda) cannot be captured', () => {
    const s = setup();
    const sq = 30; // not a safe square
    s.players[1]!.tokens[0] = progressFor(s.players[1]!.color, sq);
    s.players[3]!.tokens[0] = progressFor(s.players[3]!.color, sq);
    expect(trackIndex(s.players[1]!.color, s.players[1]!.tokens[0]!)).toBe(sq);
    expect(trackIndex(s.players[3]!.color, s.players[3]!.tokens[0]!)).toBe(sq);
    // Seat 0 lands on that square.
    const from = progressFor(s.players[0]!.color, sq) - 3;
    s.players[0]!.tokens[0] = from;
    s.turn = 0;
    s.dice = 3;
    const r = applyMove(s, 0);
    expect(r.captured).toEqual([]);
    expect(r.state.players[1]!.tokens[0]).toBeGreaterThanOrEqual(0);
    expect(r.state.players[3]!.tokens[0]).toBeGreaterThanOrEqual(0);
  });

  it('a single token left alone can be captured again', () => {
    const s = setup();
    const sq = 30;
    s.players[1]!.tokens[0] = progressFor(s.players[1]!.color, sq);
    const from = progressFor(s.players[0]!.color, sq) - 3;
    s.players[0]!.tokens[0] = from;
    s.turn = 0;
    s.dice = 3;
    const r = applyMove(s, 0);
    expect(r.captured).toEqual([{ player: 1, token: 0 }]);
    expect(r.state.players[1]!.tokens[0]).toBe(-1);
  });
});

describe('ludo fair dice', () => {
  const rnd = (n: number) => Math.floor(Math.random() * n);
  it('nobody waits more than 5 rolls for a six (3 with all tokens in the yard)', async () => {
    const { fairDice } = await import('@quizwar/shared');
    for (const [yard, limit] of [[false, 5], [true, 3]] as const) {
      const st = { bags: [] as number[][], sinceSix: [] as number[] };
      let since = 0, worst = 0, sixes = 0;
      for (let i = 0; i < 3000; i++) {
        const d = fairDice(st, 0, yard, rnd);
        if (d === 6) (sixes++, (since = 0));
        else worst = Math.max(worst, ++since);
      }
      expect(worst).toBeLessThanOrEqual(limit);
      expect(sixes).toBeGreaterThan(400); // every player gets plenty of sixes
    }
  });
  it('the turn passes on a miss (no extra tries)', async () => {
    const { applyRoll } = await import('@quizwar/shared');
    const r = applyRoll(newLudoGame([3, 1]), 2);
    expect(r.moves).toEqual([]);
    expect(r.lost).toBe(false);
  });
});
