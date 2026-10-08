import type { AiLevel, Difficulty, GameSettings } from '@quizwar/shared';

const BOT_NAMES = ['বট রাহাত', 'বট নীলা', 'বট সাকিব', 'বট তানিয়া', 'বট আরিফ', 'বট মিম', 'বট জয়', 'বট রিয়া'];

export function botName(i: number, level: AiLevel): string {
  // Bots are always clearly labelled as AI — never disguised as real players.
  return `🤖 ${BOT_NAMES[i % BOT_NAMES.length]} (${level.toUpperCase()})`;
}

export function botAccuracy(level: AiLevel, s: GameSettings['ai'], rnd = Math.random): number {
  const l = s.levels[level];
  return l.accuracyMin + (l.accuracyMax - l.accuracyMin) * rnd();
}

export function botRating(level: AiLevel): number {
  return { easy: 850, normal: 1000, hard: 1250, expert: 1500 }[level];
}

const DIFFICULTY_ADJUST: Record<Difficulty, number> = { easy: 0.1, medium: 0, hard: -0.08, expert: -0.15 };

export interface BotDecision {
  delayMs: number;
  correct: boolean;
}

export function decideBotAnswer(
  level: AiLevel,
  accuracy: number,
  difficulty: Difficulty,
  timeLimitMs: number,
  s: GameSettings['ai'],
  rnd = Math.random,
): BotDecision {
  const l = s.levels[level];
  const p = Math.min(0.99, Math.max(0.05, accuracy + DIFFICULTY_ADJUST[difficulty]));
  const correct = rnd() < p;
  // Wrong answers tend to be a bit slower (hesitation) to feel natural.
  let delay = l.responseMinMs + (l.responseMaxMs - l.responseMinMs) * rnd();
  if (!correct) delay *= 1.1;
  delay = Math.min(delay, timeLimitMs - 300);
  return { delayMs: Math.max(300, Math.round(delay)), correct };
}
