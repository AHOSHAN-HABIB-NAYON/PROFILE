import type { GameSettings } from '../settings';

export function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - rating) / 400));
}

/**
 * Elo update. `result` is 1 for a win, 0.5 for a draw and 0 for a loss.
 * For team games pass the average rating of each team.
 */
export function ratingDelta(rating: number, opponentRating: number, result: 0 | 0.5 | 1, k: number): number {
  return Math.round(k * (result - expectedScore(rating, opponentRating)));
}

export type League = GameSettings['ranked']['leagues'][number];

export function leagueForRating(rating: number, leagues: League[]): League {
  const sorted = [...leagues].sort((a, b) => a.minRating - b.minRating);
  let current = sorted[0];
  for (const l of sorted) if (rating >= l.minRating) current = l;
  return current;
}
