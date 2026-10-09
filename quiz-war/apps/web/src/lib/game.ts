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
  /** Floating in-match reactions (kept for a few seconds). */
  reactions: { id: number; userId: number; team: number; reaction: string }[];
  addReaction: (r: { userId: number; team: number; reaction: string }) => void;
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
  reactions: [] as GameState['reactions'],
};
let reactionSeq = 0;

export const useGame = create<GameState>((set, get) => ({
  ...initial,
  set: (p) => set(p),
  reset: (matchId = null) => set({ ...initial, matchId }),
  addReaction: (r) => {
    const id = ++reactionSeq;
    set({ reactions: [...get().reactions.slice(-6), { ...r, id }] });
    setTimeout(() => set({ reactions: get().reactions.filter((x) => x.id !== id) }), 2600);
  },
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
