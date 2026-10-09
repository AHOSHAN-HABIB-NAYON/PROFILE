export const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const AI_LEVELS = ['easy', 'normal', 'hard', 'expert'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

export const PRESENCE_STATUSES = ['online', 'away', 'in_match', 'offline', 'dnd'] as const;
export type PresenceStatus = (typeof PRESENCE_STATUSES)[number];

/** How a match was created / who is in it. Stored as matches.match_type. */
export const MATCH_TYPES = ['pvp', 'ai', 'solo', 'daily'] as const;
export type MatchType = (typeof MATCH_TYPES)[number];

export const MATCH_STATES = ['lobby', 'countdown', 'question', 'reveal', 'finished', 'aborted'] as const;
export type MatchState = (typeof MATCH_STATES)[number];

export const POWER_UPS = ['fifty_fifty', 'time_boost', 'double_score', 'hint'] as const;
export type PowerUp = (typeof POWER_UPS)[number];

export const REPORT_REASONS = [
  'cheating',
  'abuse',
  'inappropriate_username',
  'inappropriate_avatar',
  'exploit',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const LEADERBOARD_SCOPES = ['global', 'weekly', 'monthly', 'season', 'category', 'squad', 'friends'] as const;
export type LeaderboardScope = (typeof LEADERBOARD_SCOPES)[number];

export const SQUAD_ROLES = ['captain', 'officer', 'member'] as const;
export type SquadRole = (typeof SQUAD_ROLES)[number];

export interface PublicUser {
  id: number;
  uid: string;
  username: string;
  avatarUrl: string | null;
  avatarThumbUrl: string | null;
  level: number;
  rating: number;
  league: string;
  frame?: string | null;
  title?: string | null;
}

export interface MeUser extends PublicUser {
  email: string | null;
  emailVerified: boolean;
  needsOnboarding: boolean;
  xp: number;
  coins: number;
  streakDays: number;
  availableForBattle: boolean;
  dnd: boolean;
  bio: string | null;
  lang: 'bn' | 'en';
  emailActivity: boolean;
  hasPassword: boolean;
  hasGoogle: boolean;
}

export interface QuestionPublic {
  /** Index in the match (0-based). */
  index: number;
  total: number | null;
  text: string;
  options: string[];
  imageUrl: string | null;
  category: string;
  difficulty: Difficulty;
  /** Server time (ms epoch) the round started and the per-player deadline. */
  startedAt: number;
  deadline: number;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

/** In-match reactions players can send (rendered as animated stickers). */
export const MATCH_REACTIONS = ['👍', '🔥', '😂', '😮', '👏', '💪', '😅', '🤝'] as const;
export type MatchReaction = (typeof MATCH_REACTIONS)[number];
