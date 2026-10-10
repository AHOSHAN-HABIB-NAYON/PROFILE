import type { ModeKey } from './modes';
import type { AiLevel, ChatMessage, Difficulty, MatchState, MatchType, PowerUp, PresenceStatus, PublicUser, QuestionPublic } from './types';

/* ----------------------------- Match snapshots ----------------------------- */

export interface MatchPlayerView {
  userId: number;
  username: string;
  uid: string | null;
  avatarUrl: string | null;
  level: number;
  rating: number;
  team: number;
  isBot: boolean;
  botLevel: AiLevel | null;
  ready: boolean;
  connected: boolean;
  /** When a disconnected player is forfeited (server clock), if they don't return. */
  graceUntil?: number | null;
  score: number;
  combo: number;
  correct: number;
  answered: boolean;
}

export interface MatchSnapshot {
  matchId: string;
  mode: ModeKey;
  type: MatchType;
  ranked: boolean;
  state: MatchState;
  hostUserId: number | null;
  category: { id: number; name: string; icon: string } | null;
  questionCount: number | null;
  questionTimeSec: number;
  /** Chosen question difficulty (null = mixed). */
  difficulty?: Difficulty | null;
  /** Custom War Room join code (6 characters). */
  roomCode?: string | null;
  /** Whole-match time limit in seconds (time-limited rooms). */
  totalTimeSec?: number | null;
  players: MatchPlayerView[];
  teamScores: number[];
  currentQuestion: QuestionPublic | null;
  /** Personal state for the receiving player. */
  you: {
    userId: number;
    answeredIndex: number | null;
    powerUpsLeft: Partial<Record<PowerUp, number>>;
    removedOptions: number[];
    hint: string | null;
  } | null;
  startsAt: number | null;
  endsAt: number | null;
  serverTime: number;
}

export interface RevealResult {
  userId: number;
  optionIndex: number | null;
  correct: boolean;
  points: number;
  score: number;
  combo: number;
  responseMs: number | null;
}

export interface RevealPayload {
  matchId: string;
  questionIndex: number;
  correctIndex: number;
  explanation: string | null;
  results: RevealResult[];
  teamScores: number[];
  nextAt: number | null;
}

export interface PlayerResult {
  userId: number;
  team: number;
  isBot: boolean;
  score: number;
  correct: number;
  answered: number;
  bestCombo: number;
  avgResponseMs: number | null;
  xpGained: number;
  coinsGained: number;
  ratingBefore: number | null;
  ratingAfter: number | null;
  levelBefore: number;
  levelAfter: number;
  leagueBefore: string | null;
  leagueAfter: string | null;
  achievements: { key: string; name: string; icon: string }[];
  /** Coins/XP taken for leaving the match early. */
  penaltyCoins?: number;
  penaltyXp?: number;
  /** Coins received from opponents who left. */
  bonusCoins?: number;
}

export interface MatchEndPayload {
  matchId: string;
  mode: ModeKey;
  type: MatchType;
  ranked: boolean;
  winnerTeam: number | null;
  reason: 'completed' | 'forfeit' | 'aborted' | 'wrong_answer' | 'time_up';
  teamScores: number[];
  players: PlayerResult[];
}

/* ------------------------------- Requests -------------------------------- */

export interface BattleRequestView {
  id: number;
  from: PublicUser;
  to: PublicUser;
  mode: ModeKey;
  questionCount: number;
  questionTimeSec: number;
  difficulty: Difficulty | null;
  category: { id: number; name: string } | null;
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';
  expiresAt: number;
  matchId: string | null;
}

export interface NotificationView {
  id: number;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

/* ----------------------------- Socket contract ---------------------------- */

export type Ack<T extends object = object> = (res: ({ ok: true } & T) | { ok: false; code: string; message: string }) => void;

export interface ClientToServerEvents {
  'presence:set': (p: { status?: Exclude<PresenceStatus, 'offline' | 'in_match'>; available?: boolean }) => void;
  'mm:join': (p: { mode: ModeKey; ranked: boolean; categoryId?: number | null }, ack: Ack<{ ticketId: string }>) => void;
  'mm:leave': (ack?: Ack) => void;
  'mm:accept_ai': (p: { level?: AiLevel }, ack: Ack<{ matchId: string }>) => void;
  'ai:start': (p: { mode?: ModeKey; level: AiLevel; categoryId?: number | null; tutorial?: boolean; questionCount?: number | null }, ack: Ack<{ matchId: string }>) => void;
  'solo:start': (p: { mode: 'solo' | 'survival' | 'speed' | 'daily'; categoryId?: number | null; difficulty?: Difficulty | null; practiceMistakes?: boolean; questionCount?: number | null }, ack: Ack<{ matchId: string }>) => void;
  'room:create': (p: { mode: ModeKey; categoryId?: number | null; questionCount?: number; difficulty?: Difficulty | null; questionTimeSec?: number | null; squadId?: number | null }, ack: Ack<{ matchId: string }>) => void;
  'room:join': (p: { matchId: string; team?: number }, ack: Ack<{ snapshot: MatchSnapshot }>) => void;
  'room:settings': (
    p: { matchId: string; questionCount?: number | null; questionTimeSec?: number; totalTimeSec?: number | null; difficulty?: Difficulty | null; categoryId?: number | null },
    ack?: Ack,
  ) => void;
  'room:ready': (p: { matchId: string; ready: boolean }, ack?: Ack) => void;
  'room:start': (p: { matchId: string }, ack?: Ack) => void;
  'room:leave': (p: { matchId: string }, ack?: Ack) => void;
  'match:resume': (p: { matchId?: string }, ack: Ack<{ snapshot: MatchSnapshot | null }>) => void;
  'match:answer': (p: { matchId: string; questionIndex: number; optionIndex: number }, ack: Ack<{ correct: boolean; points: number; combo: number }>) => void;
  'match:powerup': (p: { matchId: string; questionIndex: number; powerUp: PowerUp }, ack: Ack<{ removedOptions?: number[]; hint?: string; deadline?: number }>) => void;
  'match:forfeit': (p: { matchId: string }, ack?: Ack) => void;
  /** Quick emoji reaction during a match (rate-limited, from a fixed set). */
  'match:react': (p: { matchId: string; reaction: string }, ack?: Ack) => void;
  'time:sync': (p: { clientTime: number }, ack: Ack<{ serverTime: number; clientTime: number }>) => void;
  /** "is typing…" to a chat partner (throttled by the client). */
  'chat:typing': (p: { to: number }) => void;
  /** Which chat is open and visible on this device (null = none); no push for that chat. */
  'chat:focus': (p: { peerId: number | null }) => void;
}

export interface ServerToClientEvents {
  'presence:count': (p: { online: number }) => void;
  'presence:update': (p: { userId: number; status: PresenceStatus }) => void;
  'mm:status': (p: { state: 'searching'; elapsedSec: number; mode: ModeKey }) => void;
  'mm:found': (p: { matchId: string }) => void;
  'mm:ai_offer': (p: { level: AiLevel }) => void;
  'mm:timeout': () => void;
  'battle:request': (p: BattleRequestView) => void;
  'battle:update': (p: BattleRequestView) => void;
  'room:state': (p: MatchSnapshot) => void;
  'match:countdown': (p: { matchId: string; startsAt: number; serverTime: number }) => void;
  'match:question': (p: { matchId: string; question: QuestionPublic; serverTime: number }) => void;
  'match:answered': (p: { matchId: string; userId: number; questionIndex: number }) => void;
  'match:reveal': (p: RevealPayload) => void;
  'match:player': (p: { matchId: string; userId: number; connected: boolean; graceUntil: number | null }) => void;
  'match:end': (p: MatchEndPayload) => void;
  'match:reaction': (p: { matchId: string; userId: number; team: number; reaction: string }) => void;
  /** You missed questions in a row; one more and you are removed (and fined). */
  'match:afk_warning': (p: { matchId: string; missed: number; limit: number }) => void;
  'missions:update': (p: { claimable: number }) => void;
  'notification:new': (p: NotificationView) => void;
  'account:update': (p: { coins?: number; xp?: number; level?: number; rating?: number }) => void;
  'server:announcement': (p: { title: string; body: string }) => void;
  'chat:message': (p: { message: ChatMessage; peer: PublicUser; request?: boolean }) => void;
  'chat:read': (p: { peerId: number; upTo: number }) => void;
  'chat:typing': (p: { from: number }) => void;
  'chat:deleted': (p: { ids: number[]; unsent?: boolean }) => void;
}
