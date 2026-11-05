import { describe, expect, it } from 'vitest';
import { applyMove, applyRoll, chooseAiMove, LUDO_FINISH, LUDO_TRACK, moverOf, newLudoGame, trackIndex, type LudoColor } from '../src/ludo';

function play(colors: LudoColor[], seed: number, teams?: number[]) {
  let x = seed;
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  let s = newLudoGame(colors, teams);
  let turns = 0;
  while (!s.finished && turns < 5000) {
    turns++;
    const dice = 1 + Math.floor(rnd() * 6);
    const r = applyRoll(s, dice);
    s = r.state;
    if (r.lost) continue;
    if (!r.moves.length) {
      s.turn = (s.turn + 1) % s.players.length;
      while (s.players[s.turn]!.place) s.turn = (s.turn + 1) % s.players.length;
      s.dice = 0;
      s.sixes = 0;
      continue;
    }
    const t = chooseAiMove(s, r.moves, (turns % 3) as 0 | 1 | 2, rnd);
    s = applyMove(s, t).state;
  }
  return { s, turns };
}

describe('ludo', () => {
  it('track has 52 unique cells', () => {
    expect(LUDO_TRACK).toHaveLength(52);
    expect(new Set(LUDO_TRACK.map((c) => c.join(','))).size).toBe(52);
  });
  it('each colour starts 13 apart', () => {
    expect([0, 1, 2, 3].map((c) => trackIndex(c as LudoColor, 0))).toEqual([0, 13, 26, 39]);
  });
  it('needs a six to leave the yard', () => {
    const s = newLudoGame([3, 1]);
    expect(applyRoll(s, 5).moves).toEqual([]);
    expect(applyRoll(s, 6).moves).toEqual([0, 1, 2, 3]);
  });
  it('captures a lone token and sends it home', () => {
    const s = newLudoGame([0, 1]);
    s.players[0]!.tokens[0] = 10; // red at track 10
    s.players[1]!.tokens[0] = 50; // green progress 50 → track (13+50)%52 = 11
    s.dice = 1;
    const r = applyMove(s, 0);
    expect(r.captured).toHaveLength(1);
    expect(r.state.players[1]!.tokens[0]).toBe(-1);
    expect(r.extraTurn).toBe(true);
  });
  it('full games always end with places for everyone', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { s, turns } = play(seed % 2 ? [3, 1] : [3, 0, 1, 2], seed);
      expect(turns).toBeLessThan(5000);
      expect(s.finished).toBe(true);
      expect(new Set(s.players.map((p) => p.place)).size).toBe(s.players.length);
      const winner = s.players.find((p) => p.place === 1)!;
      expect(winner.tokens.every((t) => t === LUDO_FINISH)).toBe(true);
    }
  });
  it('2 vs 2: partners do not capture each other and win together', () => {
    const s = newLudoGame([3, 0, 1, 2], [0, 1, 0, 1]);
    s.players[0]!.tokens[0] = 10; // blue (team 0)
    s.players[2]!.tokens[0] = 50 - 2; // green (team 0): track (13+48)%52 = 9
    s.turn = 2;
    s.dice = 1; // green moves to track 10, where its partner stands
    expect(applyMove(s, 0).captured).toHaveLength(0);
    for (let seed = 1; seed <= 30; seed++) {
      const { s: end, turns } = play([3, 0, 1, 2], seed, [0, 1, 0, 1]);
      expect(turns).toBeLessThan(6000);
      expect(end.finished).toBe(true);
      const winners = end.players.filter((p) => p.place === 1);
      expect(winners).toHaveLength(2);
      expect(winners.every((p) => p.tokens.every((x) => x === LUDO_FINISH))).toBe(true);
    }
  });
  it('a finished partner moves the other partner', () => {
    const s = newLudoGame([3, 0, 1, 2], [0, 1, 0, 1]);
    s.players[0]!.tokens = [56, 56, 56, 56];
    expect(moverOf(s)).toBe(2);
  });
});
