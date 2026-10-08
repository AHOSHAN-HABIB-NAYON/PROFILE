import { DEFAULT_GAME_SETTINGS, type GameSettings } from '@quizwar/shared';
import { GameEngine } from '../src/game/engine';
import type { EngineQuestion, Emitter, MatchPersistence, PlayerIdentity } from '../src/game/types';

export function makeQuestions(n: number): EngineQuestion[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    text: `Question ${i + 1}?`,
    options: ['A', 'B', 'C', 'D'],
    correctIndex: i % 4,
    explanation: `Because ${i % 4}`,
    hint: i % 2 === 0 ? 'A hint' : null,
    imageUrl: null,
    category: 'Test',
    difficulty: 'medium' as const,
  }));
}

export function fakeEmitter() {
  const events: { to: string; event: string; payload: any }[] = [];
  const emitter: Emitter = {
    toUser: (userId, event, payload) => void events.push({ to: `user:${userId}`, event, payload }),
    toMatch: (matchId, event, payload) => void events.push({ to: `match:${matchId}`, event, payload }),
    joinMatch: () => undefined,
    leaveMatch: () => undefined,
  };
  return { emitter, events, last: (event: string) => [...events].reverse().find((e) => e.event === event)?.payload };
}

export function noopPersistence(): MatchPersistence & { answers: any[] } {
  const answers: any[] = [];
  return {
    answers,
    createMatch: async (m) => {
      m.players.forEach((p, i) => (p.matchPlayerId = i + 1));
    },
    addPlayer: async () => undefined,
    removePlayer: async () => undefined,
    markStarted: async () => undefined,
    saveQuestions: async () => undefined,
    saveAnswer: async (_m, p, a) => void answers.push({ userId: p.userId, ...a }),
    saveEvent: async () => undefined,
    finish: async () => undefined,
  };
}

export function player(id: number, team = 0): PlayerIdentity & { team: number } {
  return { userId: id, username: `P${id}`, uid: `QW-AAAAA${id}`, avatarUrl: null, level: 1, rating: 1000, team };
}

export function makeEngine(opts: { questions?: EngineQuestion[]; settings?: Partial<GameSettings>; walletOk?: boolean } = {}) {
  const settings: GameSettings = { ...structuredClone(DEFAULT_GAME_SETTINGS), ...(opts.settings ?? {}) };
  const qs = opts.questions ?? makeQuestions(40);
  const em = fakeEmitter();
  const persistence = noopPersistence();
  const rewardsCalls: string[] = [];
  let engine!: GameEngine;
  engine = new GameEngine({
    settings: () => settings,
    questions: {
      pick: async ({ count, excludeIds }) => qs.filter((q) => !excludeIds?.includes(q.id)).slice(0, count),
      byIds: async (ids) => qs.filter((q) => ids.includes(q.id)),
    },
    persistence,
    rewards: {
      applyMatchResult: async (m) => {
        rewardsCalls.push(m.id);
        return m.players.map((p) => engine.basicResult(p));
      },
    },
    wallet: { consume: async () => opts.walletOk ?? true },
    emitter: em.emitter,
    random: () => 0.42,
    retainFinishedMs: 1000,
  });
  return { engine, settings, qs, ...em, persistence, rewardsCalls };
}
