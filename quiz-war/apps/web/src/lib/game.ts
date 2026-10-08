import type { MatchEndPayload, MatchSnapshot, QuestionPublic, RevealPayload } from '@quizwar/shared';
import { create } from 'zustand';

/** Client mirror of the server's match state. The server is the only source of truth. */
interface GameState {
  matchId: string | null;
  snapshot: MatchSnapshot | null;
  question: QuestionPublic | null;
  reveal: RevealPayload | null;
  myPick: number | null;
  myResult: { correct: boolean; points: number; combo: number } | null;
  answered: number[];
  removed: number[];
  hint: string | null;
  deadline: number | null;
  countdownAt: number | null;
  end: MatchEndPayload | null;
  set: (p: Partial<GameState>) => void;
  reset: (matchId?: string | null) => void;
  applySnapshot: (s: MatchSnapshot) => void;
}

const initial = {
  matchId: null,
  snapshot: null,
  question: null,
  reveal: null,
  myPick: null,
  myResult: null,
  answered: [],
  removed: [],
  hint: null,
  deadline: null,
  countdownAt: null,
  end: null,
};

export const useGame = create<GameState>((set, get) => ({
  ...initial,
  set: (p) => set(p),
  reset: (matchId = null) => set({ ...initial, matchId }),
  applySnapshot: (s) => {
    const sameQuestion = get().question?.index === s.currentQuestion?.index && get().matchId === s.matchId;
    set({
      matchId: s.matchId,
      snapshot: s,
      question: s.currentQuestion,
      deadline: s.currentQuestion?.deadline ?? null,
      countdownAt: s.state === 'countdown' ? s.startsAt : null,
      myPick: s.you?.answeredIndex ?? (sameQuestion ? get().myPick : null),
      removed: s.you?.removedOptions ?? [],
      hint: s.you?.hint ?? null,
      answered: s.players.filter((p) => p.answered).map((p) => p.userId),
      ...(s.state === 'question' && !sameQuestion ? { reveal: null, myResult: null } : {}),
    });
  },
}));

/** Server clock offset (serverTime - clientTime), measured with time:sync. */
let clockOffset = 0;
export const setClockOffset = (o: number) => (clockOffset = o);
export const serverNow = () => Date.now() + clockOffset;
