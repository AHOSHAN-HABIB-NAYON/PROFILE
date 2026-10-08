import type { GameSettings } from '../settings';

export interface ScoreInput {
  correct: boolean;
  /** Time the player took to answer, measured by the SERVER. */
  responseMs: number;
  timeLimitMs: number;
  /** Combo count BEFORE this answer (number of consecutive correct answers so far). */
  comboBefore: number;
  doubleScore?: boolean;
}

export interface ScoreResult {
  points: number;
  base: number;
  speedBonus: number;
  multiplier: number;
  comboAfter: number;
  fast: boolean;
}

export function comboMultiplier(combo: number, s: GameSettings['scoring']): number {
  if (combo <= 1) return 1;
  const m = 1 + (combo - 1) * s.comboStep;
  return Math.round(Math.min(m, s.comboMaxMultiplier) * 100) / 100;
}

export function calculateScore(input: ScoreInput, s: GameSettings['scoring']): ScoreResult {
  if (!input.correct) {
    return { points: -s.wrongPenalty, base: 0, speedBonus: 0, multiplier: 1, comboAfter: 0, fast: false };
  }
  const limit = Math.max(1, input.timeLimitMs);
  const ratio = Math.min(1, Math.max(0, input.responseMs / limit));
  const speedBonus = Math.round(s.speedBonusMax * (1 - ratio));
  const comboAfter = input.comboBefore + 1;
  const multiplier = comboMultiplier(comboAfter, s);
  let points = Math.round((s.basePoints + speedBonus) * multiplier);
  if (input.doubleScore) points *= 2;
  return { points, base: s.basePoints, speedBonus, multiplier, comboAfter, fast: ratio <= s.fastAnswerFraction };
}

/** Visual tier for combo flames: 1 → 🔥, 3 → 🔥🔥, 5 → 🔥🔥🔥, 10 → 💥 SUPER COMBO */
export function comboTier(combo: number): 0 | 1 | 2 | 3 | 4 {
  if (combo >= 10) return 4;
  if (combo >= 5) return 3;
  if (combo >= 3) return 2;
  if (combo >= 1) return 1;
  return 0;
}
