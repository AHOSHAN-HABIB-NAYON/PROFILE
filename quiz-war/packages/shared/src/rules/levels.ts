import type { GameSettings } from '../settings';

/** XP required to go from `level` to `level + 1`. */
export function xpForNextLevel(level: number, s: GameSettings['levels']): number {
  return Math.round(s.base * Math.pow(level, s.exponent));
}

export interface LevelInfo {
  level: number;
  /** XP accumulated inside the current level. */
  intoLevel: number;
  /** XP needed for the current level in total. */
  needed: number;
  progress: number;
}

export function levelFromXp(totalXp: number, s: GameSettings['levels']): LevelInfo {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp));
  while (level < s.maxLevel) {
    const need = xpForNextLevel(level, s);
    if (remaining < need) return { level, intoLevel: remaining, needed: need, progress: remaining / need };
    remaining -= need;
    level++;
  }
  return { level: s.maxLevel, intoLevel: 0, needed: 0, progress: 1 };
}
