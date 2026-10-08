import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAME_SETTINGS as S,
  calculateScore,
  comboMultiplier,
  comboTier,
  gameSettingsSchema,
  generateUid,
  leagueForRating,
  levelFromXp,
  normalizeUid,
  ratingDelta,
  UID_REGEX,
  xpForNextLevel,
} from '../src';

describe('scoring', () => {
  it('awards base + speed bonus for an instant correct answer', () => {
    const r = calculateScore({ correct: true, responseMs: 0, timeLimitMs: 10000, comboBefore: 0 }, S.scoring);
    expect(r.points).toBe(S.scoring.basePoints + S.scoring.speedBonusMax);
    expect(r.comboAfter).toBe(1);
    expect(r.fast).toBe(true);
  });
  it('gives no speed bonus at the deadline', () => {
    const r = calculateScore({ correct: true, responseMs: 10000, timeLimitMs: 10000, comboBefore: 0 }, S.scoring);
    expect(r.speedBonus).toBe(0);
    expect(r.points).toBe(S.scoring.basePoints);
  });
  it('wrong answer resets combo', () => {
    const r = calculateScore({ correct: false, responseMs: 100, timeLimitMs: 10000, comboBefore: 7 }, S.scoring);
    expect(r.comboAfter).toBe(0);
    expect(r.points).toBe(-S.scoring.wrongPenalty);
  });
  it('combo multiplier grows and caps', () => {
    expect(comboMultiplier(1, S.scoring)).toBe(1);
    expect(comboMultiplier(3, S.scoring)).toBe(1.2);
    expect(comboMultiplier(100, S.scoring)).toBe(S.scoring.comboMaxMultiplier);
  });
  it('double score doubles points', () => {
    const a = calculateScore({ correct: true, responseMs: 5000, timeLimitMs: 10000, comboBefore: 0 }, S.scoring);
    const b = calculateScore({ correct: true, responseMs: 5000, timeLimitMs: 10000, comboBefore: 0, doubleScore: true }, S.scoring);
    expect(b.points).toBe(a.points * 2);
  });
  it('combo tiers', () => {
    expect([0, 1, 3, 5, 10].map(comboTier)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('levels', () => {
  it('level 1 at 0 xp and increases with xp', () => {
    expect(levelFromXp(0, S.levels).level).toBe(1);
    expect(levelFromXp(xpForNextLevel(1, S.levels), S.levels).level).toBe(2);
  });
  it('caps at max level', () => {
    expect(levelFromXp(1e12, S.levels).level).toBe(S.levels.maxLevel);
  });
});

describe('rating', () => {
  it('equal ratings: win +k/2, loss -k/2', () => {
    expect(ratingDelta(1000, 1000, 1, 32)).toBe(16);
    expect(ratingDelta(1000, 1000, 0, 32)).toBe(-16);
    expect(ratingDelta(1000, 1000, 0.5, 32)).toBe(0);
  });
  it('upset wins more', () => {
    expect(ratingDelta(1000, 1400, 1, 32)).toBeGreaterThan(ratingDelta(1400, 1000, 1, 32));
  });
  it('league lookup', () => {
    expect(leagueForRating(0, S.ranked.leagues).key).toBe('bronze');
    expect(leagueForRating(1260, S.ranked.leagues).key).toBe('gold');
    expect(leagueForRating(5000, S.ranked.leagues).key).toBe('champion');
  });
});

describe('uid', () => {
  it('generates valid uids', () => {
    for (let i = 0; i < 200; i++) expect(generateUid((m) => Math.floor(Math.random() * m))).toMatch(UID_REGEX);
  });
  it('normalizes user input', () => {
    expect(normalizeUid(' qw-8f29k7 ')).toBe('QW-8F29K7');
    expect(normalizeUid('8F29K7')).toBe('QW-8F29K7');
    expect(normalizeUid('QW-0000')).toBeNull();
  });
});

describe('settings', () => {
  it('defaults satisfy the schema', () => {
    expect(() => gameSettingsSchema.parse(S)).not.toThrow();
  });
});
