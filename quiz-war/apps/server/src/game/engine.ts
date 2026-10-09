import {
  calculateScore,
  MODES,
  POWER_UPS,
  matchTypeForMode,
  type AiLevel,
  type Difficulty,
  type GameSettings,
  type MatchEndPayload,
  type MatchPlayerView,
  type MatchSnapshot,
  type ModeKey,
  type PowerUp,
  type QuestionPublic,
  type RevealPayload,
} from '@quizwar/shared';
import { ulid } from '../lib/crypto';
import { botAccuracy, botName, botRating, decideBotAnswer } from './bot';
import type {
  AnswerRecord,
  EngineHooks,
  Emitter,
  LiveMatch,
  LivePlayer,
  MatchPersistence,
  MatchSource,
  PlayerIdentity,
  PowerUpWallet,
  QuestionSource,
  RewardHandler,
} from './types';

export class GameError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface CreateMatchOptions {
  mode: ModeKey;
  source: MatchSource;
  ranked?: boolean;
  categoryId?: number | null;
  category?: { id: number; name: string; icon: string } | null;
  difficulties?: Difficulty[] | null;
  questionCount?: number | null;
  questionTimeSec?: number | null;
  hostUserId?: number | null;
  squadId?: number | null;
  /** Humans with a team assignment. */
  players: (PlayerIdentity & { team: number })[];
  bots?: { team: number; level: AiLevel }[];
  fixedQuestionIds?: number[] | null;
  practiceMistakesOf?: number | null;
  dailyChallengeId?: number | null;
  totalTimeSec?: number | null;
  /** Start immediately (quick battle / AI / solo) instead of waiting in the War Room. */
  autoStart?: boolean;
}

export interface EngineDeps {
  settings: () => GameSettings;
  questions: QuestionSource;
  persistence: MatchPersistence;
  rewards: RewardHandler;
  wallet: PowerUpWallet;
  emitter: Emitter;
  hooks?: EngineHooks;
  log?: { error: (o: object, m: string) => void; warn: (o: object, m: string) => void; info?: (o: object, m: string) => void };
  random?: () => number;
  /** Extra time the server accepts after the deadline to absorb network latency. */
  latencyGraceMs?: number;
  /** How long a finished match stays in memory so reconnecting clients can fetch results. */
  retainFinishedMs?: number;
}

const SOLO_REVEAL_MS = 1200;
const SPEED_REVEAL_MS = 450;

/**
 * Server-authoritative multiplayer game engine.
 *
 * All state transitions happen synchronously on the in-memory LiveMatch; persistence runs
 * asynchronously on a per-match promise chain so writes are ordered. Clients only ever send
 * intents (ready, answer, power-up); timing, correctness, score, winner and rewards are all
 * decided here.
 */
export class GameEngine {
  readonly matches = new Map<string, LiveMatch>();
  private readonly userMatch = new Map<number, string>();
  private readonly rnd: () => number;
  private readonly latencyGraceMs: number;
  private botSeq = 0;

  constructor(private readonly d: EngineDeps) {
    this.rnd = d.random ?? Math.random;
    this.latencyGraceMs = d.latencyGraceMs ?? 400;
  }

  /* ------------------------------------------------------------------------ */
  /*                                 Queries                                  */
  /* ------------------------------------------------------------------------ */

  get(matchId: string): LiveMatch | undefined {
    return this.matches.get(matchId);
  }

  activeMatchOf(userId: number): LiveMatch | undefined {
    const id = this.userMatch.get(userId);
    const m = id ? this.matches.get(id) : undefined;
    if (!m || m.state === 'finished' || m.state === 'aborted') return undefined;
    return m;
  }

  isInMatch(userId: number) {
    const m = this.activeMatchOf(userId);
    return !!m && m.state !== 'lobby';
  }

  liveMatches(): LiveMatch[] {
    return [...this.matches.values()].filter((m) => m.state !== 'finished' && m.state !== 'aborted');
  }

  /* ------------------------------------------------------------------------ */
  /*                               Match setup                                */
  /* ------------------------------------------------------------------------ */

  async createMatch(o: CreateMatchOptions): Promise<LiveMatch> {
    const mode = MODES[o.mode];
    if (!mode) throw new GameError('invalid_mode', 'Unknown game mode');
    for (const p of o.players) {
      if (this.activeMatchOf(p.userId)) throw new GameError('already_in_match', 'Player is already in a match');
    }
    const s = structuredClone(this.d.settings());
    const bots = o.bots ?? [];
    const isSolo = mode.kind === 'solo';
    let questionTimeSec = o.questionTimeSec ?? s.match.questionTimeSec;
    let questionCount: number | null = o.questionCount ?? (mode.defaultQuestionCount === null ? null : s.match.questionCount);
    let totalTimeSec = o.totalTimeSec ?? mode.totalTimeSec ?? null;
    if (o.mode === 'solo') questionCount = o.questionCount ?? mode.defaultQuestionCount;
    if (o.mode === 'survival') questionTimeSec = s.survival.questionTimeSec;
    if (o.mode === 'speed') totalTimeSec = s.speedRound.totalTimeSec;
    if (o.mode === 'daily') {
      questionCount = o.fixedQuestionIds?.length ?? s.dailyChallenge.questionCount;
      totalTimeSec = o.totalTimeSec ?? s.dailyChallenge.totalTimeSec;
    }
    const ranked = !!o.ranked && !isSolo && bots.length === 0 && s.ranked.enabled;

    const m: LiveMatch = {
      id: ulid(),
      mode,
      type: matchTypeForMode(o.mode, bots.length > 0),
      source: o.source,
      ranked,
      categoryId: o.categoryId ?? null,
      category: o.category ?? null,
      difficulties: o.difficulties ?? null,
      hostUserId: o.hostUserId ?? o.players[0]?.userId ?? null,
      squadId: o.squadId ?? null,
      state: 'lobby',
      settings: s,
      questions: [],
      fixedQuestionIds: o.fixedQuestionIds ?? null,
      practiceMistakesOf: o.practiceMistakesOf ?? null,
      questionCount,
      questionTimeMs: questionTimeSec * 1000,
      currentIndex: -1,
      roundStartedAt: 0,
      roundDeadline: 0,
      startsAt: null,
      endsAt: null,
      players: [],
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
      winnerTeam: null,
      endReason: null,
      result: null,
      flags: [],
      dailyChallengeId: o.dailyChallengeId ?? null,
      timers: new Set(),
      roundTimer: null,
      persistChain: Promise.resolve(),
      fetchingMore: false,
    };
    (m as any).totalTimeSec = totalTimeSec;

    for (const p of o.players) m.players.push(this.newPlayer(p, p.team, false, null, s));
    for (const b of bots) {
      const id = -++this.botSeq;
      const bot = this.newPlayer(
        { userId: id, username: botName(this.botSeq, b.level), uid: null, avatarUrl: null, level: 1, rating: botRating(b.level) },
        b.team,
        true,
        b.level,
        s,
      );
      bot.ready = true;
      m.players.push(bot);
    }
    this.validateTeams(m, o.autoStart ?? false);

    await this.d.persistence.createMatch(m);
    this.matches.set(m.id, m);
    for (const p of m.players) {
      if (p.isBot) continue;
      this.userMatch.set(p.userId, m.id);
      this.d.emitter.joinMatch(p.userId, m.id);
    }
    this.persist(m, () => this.d.persistence.saveEvent(m.id, 'created', m.hostUserId, { source: m.source, mode: m.mode.key }));

    if (o.autoStart) {
      for (const p of m.players) p.ready = true;
      await this.startMatch(m.id);
    } else {
      this.broadcastState(m);
    }
    return m;
  }

  private validateTeams(m: LiveMatch, strict: boolean) {
    const counts = new Array(m.mode.teams).fill(0);
    for (const p of m.players) {
      if (p.team < 0 || p.team >= m.mode.teams) throw new GameError('invalid_team', 'Invalid team');
      counts[p.team]++;
    }
    if (counts.some((c) => c > m.mode.teamSize)) throw new GameError('team_full', 'Team is full');
    if (strict && counts.some((c) => c !== m.mode.teamSize)) throw new GameError('teams_incomplete', 'Teams are not complete');
  }

  private newPlayer(id: PlayerIdentity, team: number, isBot: boolean, botLevel: AiLevel | null, s: GameSettings): LivePlayer {
    return {
      ...id,
      matchPlayerId: null,
      team,
      isBot,
      botLevel,
      botAccuracy: botLevel ? botAccuracy(botLevel, s.ai, this.rnd) : 0,
      ready: false,
      connected: true,
      disconnects: 0,
      graceUntil: null,
      forfeited: false,
      missedInRow: 0,
      reactions: 0,
      lastReactionAt: 0,
      score: 0,
      combo: 0,
      bestCombo: 0,
      correct: 0,
      answeredCount: 0,
      totalResponseMs: 0,
      fastAnswers: 0,
      suspiciousFast: 0,
      answers: new Map(),
      powerUpsUsed: new Map(),
      powerUpLastRound: new Map(),
      roundDeadline: 0,
      removedOptions: [],
      hint: null,
      doubleScore: false,
      roundPowerUp: null,
    };
  }

  /** War Room: a player joins an existing lobby. */
  async joinMatch(matchId: string, who: PlayerIdentity, team?: number): Promise<LiveMatch> {
    const m = this.mustGet(matchId);
    const existing = m.players.find((p) => p.userId === who.userId);
    if (existing) {
      existing.connected = true;
      this.d.emitter.joinMatch(who.userId, m.id);
      this.broadcastState(m);
      return m;
    }
    if (m.state !== 'lobby') throw new GameError('match_started', 'This match has already started');
    if (this.activeMatchOf(who.userId)) throw new GameError('already_in_match', 'You are already in a match');
    const counts = new Array(m.mode.teams).fill(0);
    for (const p of m.players) counts[p.team]++;
    let t = team ?? counts.indexOf(Math.min(...counts));
    if (t < 0 || t >= m.mode.teams || counts[t] >= m.mode.teamSize) {
      t = counts.findIndex((c) => c < m.mode.teamSize);
      if (t === -1) throw new GameError('room_full', 'This War Room is full');
    }
    const p = this.newPlayer(who, t, false, null, m.settings);
    m.players.push(p);
    this.userMatch.set(p.userId, m.id);
    this.d.emitter.joinMatch(p.userId, m.id);
    await this.d.persistence.addPlayer(m, p);
    this.broadcastState(m);
    return m;
  }

  async leaveLobby(matchId: string, userId: number): Promise<void> {
    const m = this.mustGet(matchId);
    if (m.state !== 'lobby') {
      this.forfeit(matchId, userId);
      return;
    }
    const idx = m.players.findIndex((p) => p.userId === userId);
    if (idx === -1) return;
    const [p] = m.players.splice(idx, 1);
    this.userMatch.delete(userId);
    this.d.emitter.leaveMatch(userId, m.id);
    await this.d.persistence.removePlayer(m, p);
    if (!m.players.some((x) => !x.isBot)) {
      this.abort(m, 'aborted');
      return;
    }
    if (m.hostUserId === userId) m.hostUserId = m.players.find((x) => !x.isBot)?.userId ?? null;
    this.broadcastState(m);
  }

  setReady(matchId: string, userId: number, ready: boolean) {
    const m = this.mustGet(matchId);
    if (m.state !== 'lobby') return;
    const p = this.mustPlayer(m, userId);
    p.ready = ready;
    this.broadcastState(m);
    // Challenge rooms (1v1 from a battle request) start as soon as both are ready.
    if (m.source === 'challenge' && this.lobbyCanStart(m)) void this.startMatch(m.id).catch((err) => this.logErr(err, m));
  }

  lobbyCanStart(m: LiveMatch) {
    const counts = new Array(m.mode.teams).fill(0);
    for (const p of m.players) counts[p.team]++;
    return m.players.every((p) => p.ready) && counts.every((c) => c >= 1) && counts.every((c) => c <= m.mode.teamSize);
  }

  /** Host presses START WAR. */
  async hostStart(matchId: string, userId: number) {
    const m = this.mustGet(matchId);
    if (m.hostUserId !== userId) throw new GameError('not_host', 'Only the host can start the war');
    if (!this.lobbyCanStart(m)) throw new GameError('not_ready', 'All players must be ready and both teams need players');
    await this.startMatch(matchId);
  }

  /* ------------------------------------------------------------------------ */
  /*                                Match flow                                */
  /* ------------------------------------------------------------------------ */

  async startMatch(matchId: string) {
    const m = this.mustGet(matchId);
    if (m.state !== 'lobby') return;
    m.state = 'countdown'; // lock immediately so a double "start" cannot race
    try {
      const initial = m.questionCount ?? 12;
      if (m.fixedQuestionIds?.length) m.questions = await this.d.questions.byIds(m.fixedQuestionIds);
      else
        m.questions = await this.d.questions.pick({
          categoryId: m.categoryId,
          count: initial,
          difficulties: m.difficulties,
          userIds: m.players.filter((p) => !p.isBot).map((p) => p.userId),
          mistakesOfUserId: m.practiceMistakesOf,
        });
    } catch (err) {
      this.logErr(err, m);
      m.questions = [];
    }
    if (m.questions.length === 0) {
      this.abort(m, 'aborted', 'no_questions');
      return;
    }
    if (m.questionCount !== null && m.questions.length < m.questionCount) m.questionCount = m.questions.length;

    const now = Date.now();
    const countdownMs = m.mode.kind === 'solo' ? Math.min(m.settings.match.countdownSec, 2) * 1000 : m.settings.match.countdownSec * 1000;
    m.startsAt = now + countdownMs;
    m.startedAt = now;
    const totalTimeSec = (m as any).totalTimeSec as number | null;
    if (totalTimeSec) m.endsAt = m.startsAt + totalTimeSec * 1000;
    for (const p of m.players) if (!p.isBot) this.d.hooks?.onPlayerMatchState?.(p.userId, true);
    this.persist(m, () => this.d.persistence.markStarted(m));
    this.persist(m, () => this.d.persistence.saveQuestions(m, 0));
    this.d.emitter.toMatch(m.id, 'match:countdown', { matchId: m.id, startsAt: m.startsAt, serverTime: now });
    this.broadcastState(m);
    this.schedule(m, countdownMs, () => this.startRound(m, 0));
  }

  private startRound(m: LiveMatch, index: number) {
    if (m.state === 'finished' || m.state === 'aborted') return;
    const now = Date.now();
    if (m.endsAt && now >= m.endsAt) return void this.endMatch(m, 'time_up');
    if (index >= m.questions.length) {
      // Unlimited modes ran out of prefetched questions (or the bank is exhausted).
      return void this.endMatch(m, m.questionCount === null ? 'completed' : 'completed');
    }
    m.state = 'question';
    m.currentIndex = index;
    m.roundStartedAt = now;
    let deadline = now + m.questionTimeMs;
    if (m.endsAt) deadline = Math.min(deadline, m.endsAt);
    m.roundDeadline = deadline;
    for (const p of m.players) {
      p.roundDeadline = deadline;
      p.removedOptions = [];
      p.hint = null;
      p.doubleScore = false;
      p.roundPowerUp = null;
    }
    const q = m.questions[index];
    this.d.emitter.toMatch(m.id, 'match:question', { matchId: m.id, question: this.publicQuestion(m, index), serverTime: now });
    this.scheduleRoundEnd(m);
    this.scheduleBots(m, index, q.difficulty);
    this.maybePrefetch(m);
  }

  private scheduleRoundEnd(m: LiveMatch) {
    if (m.roundTimer) {
      clearTimeout(m.roundTimer);
      m.timers.delete(m.roundTimer);
    }
    const latest = Math.max(...m.players.map((p) => p.roundDeadline));
    const idx = m.currentIndex;
    m.roundTimer = this.schedule(m, Math.max(0, latest - Date.now()) + this.latencyGraceMs, () => {
      if (m.state === 'question' && m.currentIndex === idx) this.endRound(m);
    });
  }

  private scheduleBots(m: LiveMatch, index: number, difficulty: Difficulty) {
    for (const bot of m.players.filter((p) => p.isBot)) {
      const decision = decideBotAnswer(bot.botLevel!, bot.botAccuracy, difficulty, m.roundDeadline - m.roundStartedAt, m.settings.ai, this.rnd);
      this.schedule(m, decision.delayMs, () => {
        if (m.state !== 'question' || m.currentIndex !== index) return;
        const q = m.questions[index];
        let option = q.correctIndex;
        if (!decision.correct) {
          const wrong = [0, 1, 2, 3].filter((i) => i !== q.correctIndex && i < q.options.length);
          option = wrong[Math.floor(this.rnd() * wrong.length)];
        }
        try {
          this.applyAnswer(m, bot, index, option);
        } catch {
          /* bot answered after round end — ignore */
        }
      });
    }
  }

  private maybePrefetch(m: LiveMatch) {
    if (m.questionCount !== null || m.fetchingMore || m.fixedQuestionIds) return;
    if (m.questions.length - m.currentIndex > 4) return;
    m.fetchingMore = true;
    void this.d.questions
      .pick({
        categoryId: m.categoryId,
        count: 15,
        difficulties: m.difficulties,
        userIds: m.players.filter((p) => !p.isBot).map((p) => p.userId),
        excludeIds: m.questions.map((q) => q.id),
      })
      .then((more) => {
        const from = m.questions.length;
        m.questions.push(...more);
        if (more.length) this.persist(m, () => this.d.persistence.saveQuestions(m, from));
      })
      .catch((err) => this.logErr(err, m))
      .finally(() => {
        m.fetchingMore = false;
      });
  }

  /** Client intent: answer the current question. */
  submitAnswer(matchId: string, userId: number, questionIndex: number, optionIndex: number) {
    const m = this.mustGet(matchId);
    const p = this.mustPlayer(m, userId);
    if (p.isBot) throw new GameError('forbidden', 'Not allowed');
    return this.applyAnswer(m, p, questionIndex, optionIndex);
  }

  private applyAnswer(m: LiveMatch, p: LivePlayer, questionIndex: number, optionIndex: number) {
    if (m.state !== 'question') throw new GameError('round_closed', 'This question is closed');
    if (questionIndex !== m.currentIndex) throw new GameError('stale_question', 'This question is no longer active');
    if (p.forfeited) throw new GameError('forfeited', 'You left this match');
    if (p.answers.has(questionIndex)) throw new GameError('duplicate_answer', 'You already answered this question');
    const q = m.questions[questionIndex];
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= q.options.length) {
      throw new GameError('invalid_option', 'Invalid option');
    }
    const now = Date.now();
    if (now > p.roundDeadline + this.latencyGraceMs) throw new GameError('too_late', "Time's up!");
    const responseMs = Math.max(0, Math.min(now, p.roundDeadline) - m.roundStartedAt);
    const timeLimitMs = p.roundDeadline - m.roundStartedAt;
    const correct = optionIndex === q.correctIndex;
    const sc = calculateScore({ correct, responseMs, timeLimitMs, comboBefore: p.combo, doubleScore: p.doubleScore }, m.settings.scoring);
    const rec: AnswerRecord = {
      questionIndex,
      questionId: q.id,
      optionIndex,
      correct,
      points: sc.points,
      combo: sc.comboAfter,
      responseMs,
      powerUp: p.roundPowerUp,
    };
    p.answers.set(questionIndex, rec);
    p.missedInRow = 0;
    p.score = Math.max(0, p.score + sc.points);
    p.combo = sc.comboAfter;
    p.bestCombo = Math.max(p.bestCombo, p.combo);
    p.answeredCount++;
    p.totalResponseMs += responseMs;
    if (correct) {
      p.correct++;
      if (sc.fast) p.fastAnswers++;
      // Anti-cheat: correct answers faster than humanly plausible are counted and flagged.
      if (!p.isBot && responseMs < m.settings.match.minHumanResponseMs) {
        p.suspiciousFast++;
        if (p.suspiciousFast === 3) this.flag(m, `impossible_speed:${p.userId}`);
      }
    }
    this.persist(m, () => this.d.persistence.saveAnswer(m, p, rec));
    this.d.emitter.toMatch(m.id, 'match:answered', { matchId: m.id, userId: p.userId, questionIndex });

    const pending = m.players.filter((x) => !x.forfeited && !x.answers.has(questionIndex));
    if (pending.length === 0 || (m.mode.kind === 'solo' && m.mode.endOnWrong && !correct)) {
      this.endRound(m);
    }
    return { correct, points: sc.points, combo: sc.comboAfter };
  }

  private endRound(m: LiveMatch) {
    if (m.state !== 'question') return;
    m.state = 'reveal';
    if (m.roundTimer) {
      clearTimeout(m.roundTimer);
      m.timers.delete(m.roundTimer);
      m.roundTimer = null;
    }
    const idx = m.currentIndex;
    const q = m.questions[idx];
    let someoneWrong = false;
    const afk: LivePlayer[] = [];
    const afkLimit = m.type === 'pvp' && m.mode.kind === 'battle' ? m.settings.penalties.afkMissLimit : 0;
    for (const p of m.players) {
      if (p.forfeited) continue;
      if (!p.answers.has(idx)) {
        const rec: AnswerRecord = { questionIndex: idx, questionId: q.id, optionIndex: null, correct: false, points: 0, combo: 0, responseMs: null, powerUp: p.roundPowerUp };
        p.answers.set(idx, rec);
        p.combo = 0;
        this.persist(m, () => this.d.persistence.saveAnswer(m, p, rec));
        // Online but not playing: warn once, then remove the player so the others aren't held up.
        if (!p.isBot && p.connected && afkLimit > 0) {
          p.missedInRow++;
          if (p.missedInRow >= afkLimit) afk.push(p);
          else if (p.missedInRow === afkLimit - 1) this.d.emitter.toUser(p.userId, 'match:afk_warning', { matchId: m.id, missed: p.missedInRow, limit: afkLimit });
        }
      }
      if (!p.answers.get(idx)!.correct) someoneWrong = true;
    }
    const isLast = this.isLastRound(m, idx, someoneWrong);
    const revealMs = m.mode.key === 'speed' ? SPEED_REVEAL_MS : m.mode.kind === 'solo' ? SOLO_REVEAL_MS : m.settings.match.revealMs;
    const nextAt = isLast ? null : Date.now() + revealMs;
    const payload: RevealPayload = {
      matchId: m.id,
      questionIndex: idx,
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      results: m.players.map((p) => {
        const a = p.answers.get(idx);
        return {
          userId: p.userId,
          optionIndex: a?.optionIndex ?? null,
          correct: !!a?.correct,
          points: a?.points ?? 0,
          score: p.score,
          combo: p.combo,
          responseMs: a?.responseMs ?? null,
        };
      }),
      teamScores: this.teamScores(m),
      nextAt,
    };
    this.d.emitter.toMatch(m.id, 'match:reveal', payload);
    if (isLast) {
      const reason: MatchEndPayload['reason'] = m.mode.endOnWrong && someoneWrong ? 'wrong_answer' : m.endsAt && Date.now() >= m.endsAt ? 'time_up' : 'completed';
      this.schedule(m, Math.min(revealMs, 1500), () => void this.endMatch(m, reason));
    } else {
      this.schedule(m, revealMs, () => this.startRound(m, idx + 1));
    }
    if (afk.length) {
      const active = m.players.filter((p) => !p.isBot && !p.forfeited);
      // Nobody is playing any more: close the match without rewarding anyone.
      if (active.every((p) => afk.includes(p))) this.abort(m, 'aborted', 'all_afk');
      else for (const p of afk) this.forfeitPlayer(m, p, 'afk');
    }
  }

  private isLastRound(m: LiveMatch, idx: number, someoneWrong: boolean) {
    if (m.mode.endOnWrong && someoneWrong) return true;
    if (m.endsAt && Date.now() >= m.endsAt) return true;
    if (m.questionCount !== null && idx + 1 >= m.questionCount) return true;
    if (m.questionCount === null && idx + 1 >= m.questions.length && !m.fetchingMore) return true;
    return false;
  }

  teamScores(m: LiveMatch): number[] {
    const scores = new Array(m.mode.teams).fill(0);
    for (const p of m.players) scores[p.team] += p.score;
    return scores;
  }

  calculateWinner(m: LiveMatch): number | null {
    if (m.mode.teams < 2) return null;
    const alive = new Array(m.mode.teams).fill(false);
    for (const p of m.players) if (!p.forfeited) alive[p.team] = true;
    const aliveTeams = alive.map((a, i) => (a ? i : -1)).filter((i) => i >= 0);
    if (aliveTeams.length === 1) return aliveTeams[0];
    if (aliveTeams.length === 0) return null;
    const scores = this.teamScores(m);
    const best = Math.max(...aliveTeams.map((t) => scores[t]));
    const leaders = aliveTeams.filter((t) => scores[t] === best);
    if (leaders.length === 1) return leaders[0];
    // Tie-break: more correct answers, then faster average response.
    const stat = (t: number) => {
      const ps = m.players.filter((p) => p.team === t);
      const correct = ps.reduce((a, p) => a + p.correct, 0);
      const answered = ps.reduce((a, p) => a + p.answeredCount, 0);
      const ms = ps.reduce((a, p) => a + p.totalResponseMs, 0);
      return { correct, avg: answered ? ms / answered : Infinity };
    };
    const ranked = leaders.map((t) => ({ t, ...stat(t) })).sort((a, b) => b.correct - a.correct || a.avg - b.avg);
    if (ranked[0].correct === ranked[1].correct && ranked[0].avg === ranked[1].avg) return null;
    return ranked[0].t;
  }

  async endMatch(m: LiveMatch, reason: MatchEndPayload['reason']) {
    if (m.state === 'finished' || m.state === 'aborted') return;
    m.state = 'finished';
    m.finishedAt = Date.now();
    m.endReason = reason;
    this.clearTimers(m);
    m.winnerTeam = this.calculateWinner(m);
    let players: MatchEndPayload['players'] = [];
    try {
      players = await this.d.rewards.applyMatchResult(m);
    } catch (err) {
      this.logErr(err, m);
      players = m.players.map((p) => this.basicResult(p));
    }
    m.result = {
      matchId: m.id,
      mode: m.mode.key,
      type: m.type,
      ranked: m.ranked,
      winnerTeam: m.winnerTeam,
      reason,
      teamScores: this.teamScores(m),
      players,
    };
    this.persist(m, () => this.d.persistence.finish(m));
    this.d.emitter.toMatch(m.id, 'match:end', m.result);
    this.release(m);
  }

  basicResult(p: LivePlayer): MatchEndPayload['players'][number] {
    return {
      userId: p.userId,
      team: p.team,
      isBot: p.isBot,
      score: p.score,
      correct: p.correct,
      answered: p.answeredCount,
      bestCombo: p.bestCombo,
      avgResponseMs: p.answeredCount ? Math.round(p.totalResponseMs / p.answeredCount) : null,
      xpGained: 0,
      coinsGained: 0,
      ratingBefore: null,
      ratingAfter: null,
      levelBefore: p.level,
      levelAfter: p.level,
      leagueBefore: null,
      leagueAfter: null,
      achievements: [],
    };
  }

  abort(m: LiveMatch, _state: 'aborted', reason = 'aborted') {
    if (m.state === 'finished' || m.state === 'aborted') return;
    const wasStarted = m.state !== 'lobby';
    m.state = 'aborted';
    m.finishedAt = Date.now();
    m.endReason = 'aborted';
    this.clearTimers(m);
    m.result = {
      matchId: m.id,
      mode: m.mode.key,
      type: m.type,
      ranked: m.ranked,
      winnerTeam: null,
      reason: 'aborted',
      teamScores: this.teamScores(m),
      players: m.players.map((p) => this.basicResult(p)),
    };
    this.persist(m, () => this.d.persistence.saveEvent(m.id, 'aborted', null, { reason }));
    this.persist(m, () => this.d.persistence.finish(m));
    if (wasStarted || m.players.length) this.d.emitter.toMatch(m.id, 'match:end', m.result);
    this.release(m);
  }

  private release(m: LiveMatch) {
    for (const p of m.players) {
      if (p.isBot) continue;
      if (this.userMatch.get(p.userId) === m.id) this.userMatch.delete(p.userId);
      this.d.hooks?.onPlayerMatchState?.(p.userId, false);
    }
    this.d.hooks?.onMatchFinished?.(m);
    const t = setTimeout(() => {
      for (const p of m.players) if (!p.isBot) this.d.emitter.leaveMatch(p.userId, m.id);
      this.matches.delete(m.id);
    }, this.d.retainFinishedMs ?? 120_000);
    t.unref?.();
  }

  /* ------------------------------------------------------------------------ */
  /*                                 Power-ups                                */
  /* ------------------------------------------------------------------------ */

  async usePowerUp(matchId: string, userId: number, questionIndex: number, powerUp: PowerUp) {
    const m = this.mustGet(matchId);
    const p = this.mustPlayer(m, userId);
    const cfg = m.settings.powerUps;
    if (!POWER_UPS.includes(powerUp)) throw new GameError('invalid_power_up', 'Unknown power-up');
    const item = cfg.items[powerUp];
    if (!cfg.enabled || !item?.enabled) throw new GameError('power_up_disabled', 'This power-up is not available');
    if (m.ranked && !cfg.allowInRanked) throw new GameError('power_up_ranked', 'Power-ups are disabled in ranked battles');
    if (m.mode.key === 'daily') throw new GameError('power_up_daily', 'Power-ups are disabled in the Daily Challenge');
    if (m.state !== 'question' || questionIndex !== m.currentIndex) throw new GameError('round_closed', 'This question is closed');
    if (p.answers.has(questionIndex)) throw new GameError('already_answered', 'You already answered');
    if (p.roundPowerUp) throw new GameError('one_per_round', 'Only one power-up per question');
    const used = p.powerUpsUsed.get(powerUp) ?? 0;
    const totalUsed = [...p.powerUpsUsed.values()].reduce((a, b) => a + b, 0);
    if (used >= item.perMatch || totalUsed >= cfg.perMatchLimit) throw new GameError('power_up_limit', 'Power-up limit reached for this match');
    const last = p.powerUpLastRound.get(powerUp);
    if (last !== undefined && questionIndex - last <= item.cooldownRounds) throw new GameError('power_up_cooldown', 'Power-up is cooling down');
    const q = m.questions[questionIndex];
    if (powerUp === 'hint' && !q.hint) throw new GameError('no_hint', 'No hint for this question');

    // Reserve synchronously to stop double-use while the wallet call is in flight.
    p.roundPowerUp = powerUp;
    let ok = false;
    try {
      ok = await this.d.wallet.consume(userId, powerUp);
    } catch (err) {
      this.logErr(err, m);
    }
    if (!ok) {
      p.roundPowerUp = null;
      throw new GameError('no_power_up', "You don't have this power-up. Get more in the Shop.");
    }
    if (m.state !== 'question' || m.currentIndex !== questionIndex) {
      // Round ended while consuming — the item is spent but has no effect; refunding would allow abuse
      // timing games, so instead we simply don't count it towards the match limits.
      throw new GameError('round_closed', 'This question is closed');
    }
    p.powerUpsUsed.set(powerUp, used + 1);
    p.powerUpLastRound.set(powerUp, questionIndex);
    this.persist(m, () => this.d.persistence.saveEvent(m.id, 'power_up', userId, { powerUp, questionIndex }));

    switch (powerUp) {
      case 'fifty_fifty': {
        const wrong = [0, 1, 2, 3].filter((i) => i !== q.correctIndex && i < q.options.length);
        const shuffled = wrong.sort(() => this.rnd() - 0.5);
        p.removedOptions = shuffled.slice(0, 2).sort();
        return { removedOptions: p.removedOptions };
      }
      case 'time_boost': {
        p.roundDeadline += cfg.timeBoostSec * 1000;
        if (m.endsAt) p.roundDeadline = Math.min(p.roundDeadline, m.endsAt);
        this.scheduleRoundEnd(m);
        return { deadline: p.roundDeadline };
      }
      case 'double_score':
        p.doubleScore = true;
        return {};
      case 'hint':
        p.hint = q.hint;
        return { hint: q.hint ?? undefined };
    }
  }

  /* ------------------------------------------------------------------------ */
  /*                        Disconnect / reconnect / forfeit                  */
  /* ------------------------------------------------------------------------ */

  playerDisconnected(userId: number) {
    const m = this.activeMatchOf(userId);
    if (!m) return;
    const p = m.players.find((x) => x.userId === userId);
    if (!p || !p.connected) return;
    p.connected = false;
    p.disconnects++;
    const graceMs = m.settings.disconnect.graceSec * 1000;
    p.graceUntil = Date.now() + graceMs;
    this.persist(m, () => this.d.persistence.saveEvent(m.id, 'disconnect', userId));
    this.d.emitter.toMatch(m.id, 'match:player', { matchId: m.id, userId, connected: false, graceUntil: p.graceUntil });
    const disconnectCount = p.disconnects;
    this.schedule(m, graceMs, () => {
      if (p.connected || p.disconnects !== disconnectCount) return;
      if (m.state === 'lobby') void this.leaveLobby(m.id, userId).catch((err) => this.logErr(err, m));
      else this.forfeitPlayer(m, p, 'disconnect_timeout');
    });
  }

  /** Reconnect: re-attach the player and return the full snapshot so the client can resume. */
  resume(userId: number, matchId?: string): MatchSnapshot | null {
    const m = matchId ? this.matches.get(matchId) : this.activeMatchOf(userId);
    if (!m) return null;
    const p = m.players.find((x) => x.userId === userId);
    if (!p) return null;
    this.d.emitter.joinMatch(userId, m.id);
    if (!p.connected && !p.forfeited && m.state !== 'finished' && m.state !== 'aborted') {
      p.connected = true;
      p.graceUntil = null;
      this.persist(m, () => this.d.persistence.saveEvent(m.id, 'reconnect', userId));
      this.d.emitter.toMatch(m.id, 'match:player', { matchId: m.id, userId, connected: true, graceUntil: null });
    }
    return this.snapshot(m, userId);
  }

  forfeit(matchId: string, userId: number): void | Promise<void> {
    const m = this.mustGet(matchId);
    const p = this.mustPlayer(m, userId);
    if (m.state === 'lobby') return this.leaveLobby(matchId, userId);
    this.forfeitPlayer(m, p, 'forfeit');
  }

  private forfeitPlayer(m: LiveMatch, p: LivePlayer, why: string) {
    if (p.forfeited || m.state === 'finished' || m.state === 'aborted') return;
    p.forfeited = true;
    p.connected = false;
    this.persist(m, () => this.d.persistence.saveEvent(m.id, 'forfeit', p.userId, { why }));
    this.d.emitter.toMatch(m.id, 'match:player', { matchId: m.id, userId: p.userId, connected: false, graceUntil: null });
    if (this.userMatch.get(p.userId) === m.id) this.userMatch.delete(p.userId);
    this.d.hooks?.onPlayerMatchState?.(p.userId, false);

    const humansLeft = m.players.filter((x) => !x.isBot && !x.forfeited);
    if (humansLeft.length === 0) {
      // Everybody left (solo run or both sides gone): end without anyone farming rewards.
      if (m.mode.kind === 'solo') void this.endMatch(m, 'forfeit');
      else this.abort(m, 'aborted', 'all_left');
      return;
    }
    const teamsAlive = new Set(m.players.filter((x) => !x.forfeited).map((x) => x.team));
    if (teamsAlive.size <= 1 && m.mode.teams > 1 && (why === 'forfeit' || m.settings.disconnect.forfeitOnTimeout)) {
      void this.endMatch(m, 'forfeit');
      return;
    }
    // If the round was only waiting on this player, close it now.
    if (m.state === 'question' && m.players.filter((x) => !x.forfeited && !x.answers.has(m.currentIndex)).length === 0) this.endRound(m);
  }

  /**
   * Quick emoji reaction. Only players of a live match; at most one every 1.5 s and 40 per
   * match per player so it can't be used to spam.
   */
  react(matchId: string, userId: number, reaction: string) {
    const m = this.mustGet(matchId);
    const p = this.mustPlayer(m, userId);
    if (p.isBot || p.forfeited || m.state === 'finished' || m.state === 'aborted') throw new GameError('forbidden', 'Not allowed');
    const now = Date.now();
    if (now - p.lastReactionAt < 1500 || p.reactions >= 40) throw new GameError('rate_limited', 'Slow down');
    p.lastReactionAt = now;
    p.reactions++;
    this.d.emitter.toMatch(m.id, 'match:reaction', { matchId: m.id, userId, team: p.team, reaction });
    // AI opponents sometimes answer back, so reactions feel alive in AI battles too.
    const bots = m.players.filter((b) => b.isBot && b.team !== p.team);
    if (bots.length && this.rnd() < 0.4) {
      const bot = bots[Math.floor(this.rnd() * bots.length)];
      const replies = ['😎', '😂', '🤔', '😤', '👍', '🔥', '😅'];
      this.schedule(m, 700 + this.rnd() * 900, () => {
        if (m.state === 'finished' || m.state === 'aborted') return;
        this.d.emitter.toMatch(m.id, 'match:reaction', { matchId: m.id, userId: bot.userId, team: bot.team, reaction: replies[Math.floor(this.rnd() * replies.length)] });
      });
    }
  }

  /** Admin action. */
  adminAbort(matchId: string) {
    const m = this.mustGet(matchId);
    this.abort(m, 'aborted', 'admin');
  }

  /* ------------------------------------------------------------------------ */
  /*                                  Views                                   */
  /* ------------------------------------------------------------------------ */

  publicQuestion(m: LiveMatch, index: number): QuestionPublic {
    const q = m.questions[index];
    return {
      index,
      total: m.questionCount,
      text: q.text,
      options: q.options,
      imageUrl: q.imageUrl,
      category: q.category,
      difficulty: q.difficulty,
      startedAt: m.roundStartedAt,
      deadline: m.roundDeadline,
    };
  }

  snapshot(m: LiveMatch, viewerId: number | null): MatchSnapshot {
    const me = viewerId != null ? m.players.find((p) => p.userId === viewerId) : undefined;
    const players: MatchPlayerView[] = m.players.map((p) => ({
      userId: p.userId,
      username: p.username,
      uid: p.uid,
      avatarUrl: p.avatarUrl,
      level: p.level,
      rating: p.rating,
      team: p.team,
      isBot: p.isBot,
      botLevel: p.botLevel,
      ready: p.ready,
      connected: p.connected,
        graceUntil: p.connected ? null : p.graceUntil,
      score: p.score,
      combo: p.combo,
      correct: p.correct,
      answered: m.currentIndex >= 0 && p.answers.has(m.currentIndex),
    }));
    const cfg = m.settings.powerUps;
    const powerUpsLeft: Partial<Record<PowerUp, number>> = {};
    if (me && cfg.enabled && (!m.ranked || cfg.allowInRanked) && m.mode.key !== 'daily') {
      const totalUsed = [...me.powerUpsUsed.values()].reduce((a, b) => a + b, 0);
      for (const pu of POWER_UPS) {
        const item = cfg.items[pu];
        if (!item?.enabled) continue;
        powerUpsLeft[pu] = Math.max(0, Math.min(item.perMatch - (me.powerUpsUsed.get(pu) ?? 0), cfg.perMatchLimit - totalUsed));
      }
    }
    const inQuestion = m.state === 'question' && m.currentIndex >= 0;
    return {
      matchId: m.id,
      mode: m.mode.key,
      type: m.type,
      ranked: m.ranked,
      state: m.state,
      hostUserId: m.hostUserId,
      category: m.category,
      questionCount: m.questionCount,
      questionTimeSec: m.questionTimeMs / 1000,
      difficulty: m.difficulties?.length === 1 ? m.difficulties[0] : null,
      players,
      teamScores: this.teamScores(m),
      currentQuestion: inQuestion ? { ...this.publicQuestion(m, m.currentIndex), deadline: me?.roundDeadline ?? m.roundDeadline } : null,
      you: me
        ? {
            userId: me.userId,
            answeredIndex: inQuestion ? (me.answers.get(m.currentIndex)?.optionIndex ?? null) : null,
            powerUpsLeft,
            removedOptions: inQuestion ? me.removedOptions : [],
            hint: inQuestion ? me.hint : null,
          }
        : null,
      startsAt: m.startsAt,
      endsAt: m.endsAt,
      serverTime: Date.now(),
    };
  }

  broadcastState(m: LiveMatch) {
    for (const p of m.players) if (!p.isBot) this.d.emitter.toUser(p.userId, 'room:state', this.snapshot(m, p.userId));
  }

  /* ------------------------------------------------------------------------ */
  /*                                 Helpers                                  */
  /* ------------------------------------------------------------------------ */

  private flag(m: LiveMatch, reason: string) {
    if (!m.flags.includes(reason)) m.flags.push(reason);
    this.persist(m, () => this.d.persistence.saveEvent(m.id, 'flag', null, { reason }));
    this.d.log?.warn({ matchId: m.id, reason }, 'match flagged');
  }

  private mustGet(matchId: string): LiveMatch {
    const m = this.matches.get(matchId);
    if (!m) throw new GameError('match_not_found', 'This match has expired');
    return m;
  }

  private mustPlayer(m: LiveMatch, userId: number): LivePlayer {
    const p = m.players.find((x) => x.userId === userId);
    if (!p) throw new GameError('not_in_match', 'You are not part of this match');
    return p;
  }

  private schedule(m: LiveMatch, ms: number, fn: () => void) {
    const t = setTimeout(() => {
      m.timers.delete(t);
      try {
        fn();
      } catch (err) {
        this.logErr(err, m);
      }
    }, ms);
    m.timers.add(t);
    return t;
  }

  private clearTimers(m: LiveMatch) {
    for (const t of m.timers) clearTimeout(t);
    m.timers.clear();
    m.roundTimer = null;
  }

  private persist(m: LiveMatch, fn: () => Promise<unknown>) {
    m.persistChain = m.persistChain.then(fn).catch((err) => this.logErr(err, m));
  }

  /** Wait for all queued writes of a match (tests / graceful shutdown). */
  async flush(matchId: string) {
    const m = this.matches.get(matchId);
    if (m) await m.persistChain;
  }

  private logErr(err: unknown, m: LiveMatch) {
    this.d.log?.error({ err, matchId: m.id }, 'game engine error');
  }

  /** Graceful shutdown: abort live matches so nobody gets stuck. */
  shutdown() {
    for (const m of this.liveMatches()) this.abort(m, 'aborted', 'server_shutdown');
  }
}
