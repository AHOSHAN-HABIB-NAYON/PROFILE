import type {
  AiLevel,
  Difficulty,
  GameSettings,
  MatchEndPayload,
  MatchState,
  MatchType,
  ModeDefinition,
  PlayerResult,
  PowerUp,
  ServerToClientEvents,
} from '@quizwar/shared';

export interface EngineQuestion {
  id: number;
  text: string;
  options: string[];
  correctIndex: number;
  explanation: string | null;
  hint: string | null;
  imageUrl: string | null;
  category: string;
  difficulty: Difficulty;
}

export interface PickOptions {
  categoryId: number | null;
  count: number;
  difficulties?: Difficulty[] | null;
  /** Avoid questions these users have seen recently. */
  userIds: number[];
  excludeIds?: number[];
  /** Only questions this user previously answered wrong ("Practice Mistakes"). */
  mistakesOfUserId?: number | null;
}

export interface QuestionSource {
  pick(opts: PickOptions): Promise<EngineQuestion[]>;
  byIds(ids: number[]): Promise<EngineQuestion[]>;
}

export interface PlayerIdentity {
  userId: number;
  username: string;
  uid: string | null;
  avatarUrl: string | null;
  level: number;
  rating: number;
}

export interface AnswerRecord {
  questionIndex: number;
  questionId: number;
  optionIndex: number | null;
  correct: boolean;
  points: number;
  combo: number;
  responseMs: number | null;
  powerUp: PowerUp | null;
}

export interface LivePlayer extends PlayerIdentity {
  matchPlayerId: number | null;
  team: number;
  isBot: boolean;
  botLevel: AiLevel | null;
  botAccuracy: number;
  ready: boolean;
  connected: boolean;
  disconnects: number;
  graceUntil: number | null;
  forfeited: boolean;
  /** Questions left unanswered in a row while connected (AFK detection). */
  missedInRow: number;
  reactions: number;
  lastReactionAt: number;
  score: number;
  combo: number;
  bestCombo: number;
  correct: number;
  answeredCount: number;
  totalResponseMs: number;
  fastAnswers: number;
  suspiciousFast: number;
  answers: Map<number, AnswerRecord>;
  powerUpsUsed: Map<PowerUp, number>;
  powerUpLastRound: Map<PowerUp, number>;
  /** Per-round state */
  roundDeadline: number;
  removedOptions: number[];
  hint: string | null;
  doubleScore: boolean;
  roundPowerUp: PowerUp | null;
}

export type MatchSource = 'matchmaking' | 'challenge' | 'room' | 'ai' | 'solo' | 'tutorial' | 'daily';

export interface LiveMatch {
  id: string;
  mode: ModeDefinition;
  type: MatchType;
  source: MatchSource;
  ranked: boolean;
  categoryId: number | null;
  category: { id: number; name: string; icon: string } | null;
  difficulties: Difficulty[] | null;
  hostUserId: number | null;
  squadId: number | null;
  state: MatchState;
  settings: GameSettings;
  questions: EngineQuestion[];
  fixedQuestionIds: number[] | null;
  practiceMistakesOf: number | null;
  questionCount: number | null;
  questionTimeMs: number;
  currentIndex: number;
  roundStartedAt: number;
  roundDeadline: number;
  startsAt: number | null;
  /** Overall deadline for timed runs (speed round / daily challenge). */
  endsAt: number | null;
  players: LivePlayer[];
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  winnerTeam: number | null;
  endReason: MatchEndPayload['reason'] | null;
  result: MatchEndPayload | null;
  flags: string[];
  dailyChallengeId: number | null;
  timers: Set<ReturnType<typeof setTimeout>>;
  roundTimer: ReturnType<typeof setTimeout> | null;
  persistChain: Promise<unknown>;
  fetchingMore: boolean;
}

export interface MatchPersistence {
  createMatch(m: LiveMatch): Promise<void>;
  addPlayer(m: LiveMatch, p: LivePlayer): Promise<void>;
  removePlayer(m: LiveMatch, p: LivePlayer): Promise<void>;
  markStarted(m: LiveMatch): Promise<void>;
  saveQuestions(m: LiveMatch, from: number): Promise<void>;
  saveAnswer(m: LiveMatch, p: LivePlayer, a: AnswerRecord): Promise<void>;
  saveEvent(matchId: string, type: string, userId: number | null, data?: unknown): Promise<void>;
  finish(m: LiveMatch): Promise<void>;
}

export interface RewardHandler {
  /** Computes and persists XP, coins, rating, stats, achievements. Server authoritative. */
  applyMatchResult(m: LiveMatch): Promise<PlayerResult[]>;
}

export interface PowerUpWallet {
  /** Atomically consume one power-up from the player's inventory. */
  consume(userId: number, powerUp: PowerUp): Promise<boolean>;
}

export interface Emitter {
  toUser<E extends keyof ServerToClientEvents>(userId: number, event: E, payload: Parameters<ServerToClientEvents[E]>[0]): void;
  toMatch<E extends keyof ServerToClientEvents>(matchId: string, event: E, payload: Parameters<ServerToClientEvents[E]>[0]): void;
  joinMatch(userId: number, matchId: string): void;
  leaveMatch(userId: number, matchId: string): void;
}

export interface EngineHooks {
  onPlayerMatchState?(userId: number, inMatch: boolean): void;
  onMatchFinished?(m: LiveMatch): void;
}
