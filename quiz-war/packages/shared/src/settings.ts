import { z } from 'zod';

/**
 * Every tunable gameplay value lives here. Defaults are used until an admin overrides a
 * section via the Admin Panel (stored in the `settings` table, one row per section).
 */
const aiLevel = z.object({
  /** Probability [0..1] of answering correctly. */
  accuracyMin: z.number().min(0).max(1),
  accuracyMax: z.number().min(0).max(1),
  /** Response delay range in ms. */
  responseMinMs: z.number().int().min(200),
  responseMaxMs: z.number().int().min(200),
});

export const gameSettingsSchema = z.object({
  match: z.object({
    questionCount: z.number().int().min(3).max(50),
    questionTimeSec: z.number().int().min(5).max(60),
    countdownSec: z.number().int().min(0).max(10),
    revealMs: z.number().int().min(500).max(10000),
    /** Minimum plausible human response time; faster correct answers are flagged. */
    minHumanResponseMs: z.number().int().min(50).max(2000),
  }),
  scoring: z.object({
    basePoints: z.number().int().min(0),
    /** Maximum extra points for an instant answer, linearly decaying to 0 at the deadline. */
    speedBonusMax: z.number().int().min(0),
    /** Answers within this fraction of the time limit get the full "fast answer" flag. */
    fastAnswerFraction: z.number().min(0).max(1),
    /** Combo multiplier applied per combo step (combo 1 = no multiplier). */
    comboStep: z.number().min(0).max(1),
    comboMaxMultiplier: z.number().min(1).max(5),
    wrongPenalty: z.number().int().min(0),
  }),
  rewards: z.object({
    xpPerCorrect: z.number().int().min(0),
    xpWin: z.number().int().min(0),
    xpLoss: z.number().int().min(0),
    xpDraw: z.number().int().min(0),
    coinsWin: z.number().int().min(0),
    coinsLoss: z.number().int().min(0),
    coinsDraw: z.number().int().min(0),
    aiRewardFactor: z.number().min(0).max(1),
    soloRewardFactor: z.number().min(0).max(1),
    dailyChallengeXp: z.number().int().min(0),
    dailyChallengeCoins: z.number().int().min(0),
    /** Daily login reward ladder, index 0 = day 1. Values are coin amounts unless type says otherwise. */
    dailyLogin: z.array(
      z.object({
        type: z.enum(['coins', 'xp', 'power_up', 'mystery']),
        amount: z.number().int().min(0),
        powerUp: z.enum(['fifty_fifty', 'time_boost', 'double_score', 'hint']).optional(),
      }),
    ).min(1).max(31),
    streakMilestones: z.array(z.object({ days: z.number().int().min(1), coins: z.number().int().min(0), xp: z.number().int().min(0) })),
  }),
  levels: z.object({
    /** XP needed for level n -> n+1 = base * n^exponent. */
    base: z.number().int().min(10),
    exponent: z.number().min(1).max(3),
    maxLevel: z.number().int().min(10).max(1000),
  }),
  powerUps: z.object({
    enabled: z.boolean(),
    perMatchLimit: z.number().int().min(0).max(10),
    timeBoostSec: z.number().int().min(1).max(20),
    items: z.record(
      z.enum(['fifty_fifty', 'time_boost', 'double_score', 'hint']),
      z.object({ enabled: z.boolean(), cost: z.number().int().min(0), perMatch: z.number().int().min(0), cooldownRounds: z.number().int().min(0) }),
    ),
    /** Allowed in ranked matches? (cosmetic-only economy keeps ranked fair by default) */
    allowInRanked: z.boolean(),
  }),
  matchmaking: z.object({
    initialRatingWindow: z.number().int().min(10),
    windowGrowthPerSec: z.number().min(0),
    maxRatingWindow: z.number().int().min(50),
    timeoutSec: z.number().int().min(5).max(300),
    aiFallbackSec: z.number().int().min(3).max(120),
    /** Avoid pairing the same two players again within this many minutes. */
    rematchCooldownMin: z.number().int().min(0),
  }),
  ai: z.object({
    enabled: z.boolean(),
    autoStartOnFallback: z.boolean(),
    defaultLevel: z.enum(['easy', 'normal', 'hard', 'expert']),
    levels: z.object({ easy: aiLevel, normal: aiLevel, hard: aiLevel, expert: aiLevel }),
  }),
  disconnect: z.object({
    graceSec: z.number().int().min(0).max(300),
    /** If a whole team is gone after the grace period the other team wins by forfeit. */
    forfeitOnTimeout: z.boolean(),
  }),
  ranked: z.object({
    enabled: z.boolean(),
    startRating: z.number().int().min(0),
    kFactor: z.number().int().min(1).max(100),
    minRating: z.number().int().min(0),
    /** Same opponent pair: ranked matches beyond this count in 24h give 0 rating (anti-boosting). */
    sameOpponentDailyLimit: z.number().int().min(1),
    leagues: z.array(z.object({ key: z.string(), name: z.string(), icon: z.string(), minRating: z.number().int() })).min(1),
  }),
  battleRequests: z.object({
    expirySec: z.number().int().min(10).max(600),
    maxPendingOutgoing: z.number().int().min(1).max(50),
    perMinuteLimit: z.number().int().min(1).max(60),
    defaultQuestionCount: z.number().int().min(3).max(50),
  }),
  survival: z.object({ questionTimeSec: z.number().int().min(5).max(60) }),
  speedRound: z.object({ totalTimeSec: z.number().int().min(15).max(600) }),
  dailyChallenge: z.object({
    questionCount: z.number().int().min(5).max(100),
    totalTimeSec: z.number().int().min(30).max(3600),
  }),
});

export type GameSettings = z.infer<typeof gameSettingsSchema>;

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  match: { questionCount: 15, questionTimeSec: 10, countdownSec: 3, revealMs: 2200, minHumanResponseMs: 250 },
  scoring: { basePoints: 100, speedBonusMax: 50, fastAnswerFraction: 0.3, comboStep: 0.1, comboMaxMultiplier: 2, wrongPenalty: 0 },
  rewards: {
    xpPerCorrect: 5,
    xpWin: 60,
    xpLoss: 20,
    xpDraw: 35,
    coinsWin: 40,
    coinsLoss: 10,
    coinsDraw: 20,
    aiRewardFactor: 0.6,
    soloRewardFactor: 0.4,
    dailyChallengeXp: 120,
    dailyChallengeCoins: 80,
    dailyLogin: [
      { type: 'coins', amount: 100 },
      { type: 'coins', amount: 150 },
      { type: 'power_up', amount: 1, powerUp: 'fifty_fifty' },
      { type: 'coins', amount: 250 },
      { type: 'xp', amount: 150 },
      { type: 'coins', amount: 300 },
      { type: 'mystery', amount: 500 },
    ],
    streakMilestones: [
      { days: 3, coins: 50, xp: 50 },
      { days: 7, coins: 150, xp: 150 },
      { days: 30, coins: 600, xp: 500 },
      { days: 100, coins: 2500, xp: 2000 },
    ],
  },
  levels: { base: 100, exponent: 1.35, maxLevel: 200 },
  powerUps: {
    enabled: true,
    perMatchLimit: 3,
    timeBoostSec: 5,
    items: {
      fifty_fifty: { enabled: true, cost: 60, perMatch: 1, cooldownRounds: 0 },
      time_boost: { enabled: true, cost: 40, perMatch: 1, cooldownRounds: 0 },
      double_score: { enabled: true, cost: 80, perMatch: 1, cooldownRounds: 0 },
      hint: { enabled: true, cost: 50, perMatch: 1, cooldownRounds: 0 },
    },
    allowInRanked: false,
  },
  matchmaking: {
    initialRatingWindow: 100,
    windowGrowthPerSec: 15,
    maxRatingWindow: 600,
    timeoutSec: 60,
    aiFallbackSec: 15,
    rematchCooldownMin: 10,
  },
  ai: {
    enabled: true,
    autoStartOnFallback: false,
    defaultLevel: 'normal',
    levels: {
      easy: { accuracyMin: 0.35, accuracyMax: 0.5, responseMinMs: 3500, responseMaxMs: 8500 },
      normal: { accuracyMin: 0.55, accuracyMax: 0.7, responseMinMs: 2500, responseMaxMs: 7000 },
      hard: { accuracyMin: 0.72, accuracyMax: 0.85, responseMinMs: 1800, responseMaxMs: 5500 },
      expert: { accuracyMin: 0.86, accuracyMax: 0.95, responseMinMs: 1200, responseMaxMs: 4000 },
    },
  },
  disconnect: { graceSec: 20, forfeitOnTimeout: true },
  ranked: {
    enabled: true,
    startRating: 1000,
    kFactor: 32,
    minRating: 0,
    sameOpponentDailyLimit: 3,
    leagues: [
      { key: 'bronze', name: 'Bronze', icon: '🥉', minRating: 0 },
      { key: 'silver', name: 'Silver', icon: '🥈', minRating: 1100 },
      { key: 'gold', name: 'Gold', icon: '🥇', minRating: 1250 },
      { key: 'platinum', name: 'Platinum', icon: '💠', minRating: 1400 },
      { key: 'diamond', name: 'Diamond', icon: '💎', minRating: 1600 },
      { key: 'master', name: 'Master', icon: '👑', minRating: 1800 },
      { key: 'champion', name: 'Champion', icon: '🏆', minRating: 2050 },
    ],
  },
  battleRequests: { expirySec: 45, maxPendingOutgoing: 5, perMinuteLimit: 6, defaultQuestionCount: 15 },
  survival: { questionTimeSec: 12 },
  speedRound: { totalTimeSec: 60 },
  dailyChallenge: { questionCount: 25, totalTimeSec: 300 },
};

export const appSettingsSchema = z.object({
  appName: z.string().min(1).max(60),
  logoUrl: z.string().max(500).nullable(),
  faviconUrl: z.string().max(500).nullable(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  maintenanceMode: z.boolean(),
  maintenanceMessage: z.string().max(500),
  registrationEnabled: z.boolean(),
  googleLoginEnabled: z.boolean(),
  passkeyEnabled: z.boolean(),
  notificationsEnabled: z.boolean(),
  minAppVersionCode: z.number().int().min(0),
  latestAppVersionCode: z.number().int().min(0),
  forceUpdate: z.boolean(),
  playStoreUrl: z.string().max(500),
  privacyUrl: z.string().max(500),
  termsUrl: z.string().max(500),
});
export type AppSettings = z.infer<typeof appSettingsSchema>;

export const DEFAULT_APP_SETTINGS: AppSettings = {
  appName: 'QUIZ WAR: Bangladesh',
  logoUrl: null,
  faviconUrl: null,
  primaryColor: '#1d4ed8',
  accentColor: '#7c3aed',
  maintenanceMode: false,
  maintenanceMessage: 'আমরা সার্ভার আপগ্রেড করছি। কিছুক্ষণ পর আবার চেষ্টা করুন।',
  registrationEnabled: true,
  googleLoginEnabled: true,
  passkeyEnabled: true,
  notificationsEnabled: true,
  minAppVersionCode: 1,
  latestAppVersionCode: 1,
  forceUpdate: false,
  playStoreUrl: '',
  privacyUrl: '/legal/privacy',
  termsUrl: '/legal/terms',
};

/** Public subset of app settings exposed to clients (no admin-only flags). */
export type PublicConfig = AppSettings & {
  game: Pick<GameSettings, 'match' | 'powerUps' | 'levels'> & { leagues: GameSettings['ranked']['leagues']; aiEnabled: boolean };
  googleClientId: string | null;
  vapidPublicKey: string | null;
};
