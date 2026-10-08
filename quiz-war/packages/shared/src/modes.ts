import type { MatchType } from './types';

/**
 * Game mode registry. The engine is driven entirely by these definitions, so adding
 * 3v3 / 4v4 / tournament rounds / custom rooms is a matter of adding an entry here.
 */
export interface ModeDefinition {
  key: ModeKey;
  label: string;
  /** Number of teams. Solo modes have 1 team with 1 player. */
  teams: number;
  teamSize: number;
  kind: 'battle' | 'solo';
  /** Ends the run on the first wrong/timeout answer. */
  endOnWrong?: boolean;
  /** Overall time limit for the whole run in seconds (speed round, daily challenge). */
  totalTimeSec?: number | null;
  /** null = unlimited (survival / speed round keep drawing questions). */
  defaultQuestionCount: number | null;
  /** Rounds are synchronized between players (everybody sees the same question at once). */
  synchronized: boolean;
  matchmaking: boolean;
}

export const MODE_KEYS = [
  'duel',
  'duo',
  'trio',
  'squad',
  'solo',
  'survival',
  'speed',
  'daily',
] as const;
export type ModeKey = (typeof MODE_KEYS)[number];

export const MODES: Record<ModeKey, ModeDefinition> = {
  duel: { key: 'duel', label: '1 VS 1', teams: 2, teamSize: 1, kind: 'battle', defaultQuestionCount: 15, synchronized: true, matchmaking: true },
  duo: { key: 'duo', label: '2 VS 2', teams: 2, teamSize: 2, kind: 'battle', defaultQuestionCount: 15, synchronized: true, matchmaking: true },
  trio: { key: 'trio', label: '3 VS 3', teams: 2, teamSize: 3, kind: 'battle', defaultQuestionCount: 15, synchronized: true, matchmaking: false },
  squad: { key: 'squad', label: '4 VS 4', teams: 2, teamSize: 4, kind: 'battle', defaultQuestionCount: 20, synchronized: true, matchmaking: false },
  solo: { key: 'solo', label: 'Solo Practice', teams: 1, teamSize: 1, kind: 'solo', defaultQuestionCount: 10, synchronized: false, matchmaking: false },
  survival: { key: 'survival', label: 'Survival', teams: 1, teamSize: 1, kind: 'solo', endOnWrong: true, defaultQuestionCount: null, synchronized: false, matchmaking: false },
  speed: { key: 'speed', label: 'Speed Round', teams: 1, teamSize: 1, kind: 'solo', totalTimeSec: 60, defaultQuestionCount: null, synchronized: false, matchmaking: false },
  daily: { key: 'daily', label: 'Daily Challenge', teams: 1, teamSize: 1, kind: 'solo', totalTimeSec: 300, defaultQuestionCount: 25, synchronized: false, matchmaking: false },
};

export function matchTypeForMode(mode: ModeKey, hasBots: boolean): MatchType {
  const def = MODES[mode];
  if (mode === 'daily') return 'daily';
  if (def.kind === 'solo') return 'solo';
  return hasBots ? 'ai' : 'pvp';
}
