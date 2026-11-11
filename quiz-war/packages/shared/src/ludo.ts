/**
 * Ludo rules (shared by the app and, later, the server for online games).
 *
 * Board: 15 × 15 grid. 52 track cells go clockwise; each colour has 5 home-column cells.
 * A token's progress is relative to its colour: -1 = in the yard, 0…50 = on the track,
 * 51…55 = home column, 56 = finished. Exact rolls are needed to finish.
 */

export type LudoColor = 0 | 1 | 2 | 3; // 0 red (top-left), 1 green (top-right), 2 yellow (bottom-right), 3 blue (bottom-left)
export const LUDO_COLORS = ['#e53935', '#43a047', '#fbc02d', '#1e88e5'] as const;
export const LUDO_COLOR_NAMES = [
  ['Red', 'লাল'],
  ['Green', 'সবুজ'],
  ['Yellow', 'হলুদ'],
  ['Blue', 'নীল'],
] as const;

export const LUDO_FINISH = 56;
const HOME_START = 51;

/** The 52 track cells (col, row), clockwise, starting at red's start square. */
export const LUDO_TRACK: [number, number][] = (() => {
  const t: [number, number][] = [];
  for (let c = 1; c <= 5; c++) t.push([c, 6]);
  for (let r = 5; r >= 0; r--) t.push([6, r]);
  t.push([7, 0], [8, 0]);
  for (let r = 1; r <= 5; r++) t.push([8, r]);
  for (let c = 9; c <= 14; c++) t.push([c, 6]);
  t.push([14, 7], [14, 8]);
  for (let c = 13; c >= 9; c--) t.push([c, 8]);
  for (let r = 9; r <= 14; r++) t.push([8, r]);
  t.push([7, 14], [6, 14]);
  for (let r = 13; r >= 9; r--) t.push([6, r]);
  for (let c = 5; c >= 0; c--) t.push([c, 8]);
  t.push([0, 7], [0, 6]);
  return t;
})();

/** Home column cells for each colour (5 each, outside → centre). */
export const LUDO_HOME: [number, number][][] = [
  [1, 2, 3, 4, 5].map((c) => [c, 7] as [number, number]),
  [1, 2, 3, 4, 5].map((r) => [7, r] as [number, number]),
  [13, 12, 11, 10, 9].map((c) => [c, 7] as [number, number]),
  [13, 12, 11, 10, 9].map((r) => [7, r] as [number, number]),
];

/** Where each colour's 4 tokens wait in the yard. */
export const LUDO_YARD: [number, number][][] = [
  [[1.5, 1.5], [3.5, 1.5], [1.5, 3.5], [3.5, 3.5]],
  [[10.5, 1.5], [12.5, 1.5], [10.5, 3.5], [12.5, 3.5]],
  [[10.5, 10.5], [12.5, 10.5], [10.5, 12.5], [12.5, 12.5]],
  [[1.5, 10.5], [3.5, 10.5], [1.5, 12.5], [3.5, 12.5]],
];

export const startIndex = (color: LudoColor) => color * 13;
/** Safe squares: every start square and the star 8 steps after it. */
export const LUDO_SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

/** Track index (0…51) of a token, or null when not on the shared track. */
export function trackIndex(color: LudoColor, progress: number): number | null {
  if (progress < 0 || progress >= HOME_START) return null;
  return (startIndex(color) + progress) % 52;
}

/** Board cell (col, row) of a token — centre of the square, or the finish centre. */
export function cellOf(color: LudoColor, progress: number, token: number): [number, number] {
  if (progress < 0) return LUDO_YARD[color][token]!;
  if (progress >= LUDO_FINISH) {
    const c: [number, number][] = [[6.6, 7.5], [7.5, 6.6], [8.4, 7.5], [7.5, 8.4]];
    return c[color]!;
  }
  if (progress >= HOME_START) {
    const [c, r] = LUDO_HOME[color][progress - HOME_START]!;
    return [c + 0.5, r + 0.5];
  }
  const [c, r] = LUDO_TRACK[trackIndex(color, progress)!]!;
  return [c + 0.5, r + 0.5];
}

export interface LudoPlayer {
  color: LudoColor;
  /** Progress of the 4 tokens. */
  tokens: number[];
  /** Finished place (1st, 2nd…), 0 while still playing. */
  place: number;
}

export interface LudoState {
  players: LudoPlayer[];
  /** Index into players whose turn it is. */
  turn: number;
  /** Last dice (0 = not rolled yet this turn). */
  dice: number;
  /** Sixes rolled in a row this turn (3 = turn lost). */
  sixes: number;
  finished: boolean;
  /** 2 vs 2: team of each player (partners sit opposite). Absent = everyone for themselves. */
  teams?: number[];
}

export function newLudoGame(colors: LudoColor[], teams?: number[]): LudoState {
  return { players: colors.map((color) => ({ color, tokens: [-1, -1, -1, -1], place: 0 })), turn: 0, dice: 0, sixes: 0, finished: false, ...(teams ? { teams } : {}) };
}

const allHome = (p: LudoPlayer) => p.tokens.every((x) => x >= LUDO_FINISH);
const sameTeam = (s: LudoState, a: number, b: number) => a === b || (!!s.teams && s.teams[a] === s.teams[b]);

/**
 * Whose tokens move this turn: normally the player's own; in 2 vs 2, once a player has all
 * four home, they keep rolling and move their partner's tokens.
 */
export function moverOf(s: LudoState): number {
  const me = s.turn;
  if (!s.teams || !allHome(s.players[me]!)) return me;
  const partner = s.players.findIndex((_, i) => i !== me && s.teams![i] === s.teams![me]);
  return partner >= 0 && !allHome(s.players[partner]!) ? partner : me;
}

/** Which tokens can move with this dice. */
export function legalMoves(s: LudoState, dice: number): number[] {
  const p = s.players[moverOf(s)]!;
  const out: number[] = [];
  p.tokens.forEach((pr, i) => {
    if (pr >= LUDO_FINISH) return;
    if (pr < 0) {
      if (dice === 6) out.push(i);
      return;
    }
    if (pr + dice <= LUDO_FINISH) out.push(i);
  });
  return out;
}

/** Tokens of other players standing on a track index. */
function othersOn(s: LudoState, idx: number, me: number) {
  const hits: { player: number; token: number }[] = [];
  s.players.forEach((p, pi) => {
    if (sameTeam(s, pi, me)) return; // partners never capture each other
    p.tokens.forEach((pr, ti) => {
      if (trackIndex(p.color, pr) === idx) hits.push({ player: pi, token: ti });
    });
  });
  return hits;
}

export interface LudoMoveResult {
  state: LudoState;
  /** Step-by-step progress values (for the hop animation). */
  path: number[];
  captured: { player: number; token: number }[];
  reachedHome: boolean;
  extraTurn: boolean;
  /** The mover just finished all 4 tokens. */
  playerDone: boolean;
}

/** Move one token (must be legal). Returns the new state; the turn passes unless there is a bonus. */
export function applyMove(s0: LudoState, token: number): LudoMoveResult {
  const s: LudoState = { ...s0, players: s0.players.map((p) => ({ ...p, tokens: [...p.tokens] })) };
  const me = moverOf(s);
  const p = s.players[me]!;
  const from = p.tokens[token]!;
  const dice = s.dice;
  const to = from < 0 ? 0 : from + dice;
  const path: number[] = [];
  if (from < 0) path.push(0);
  else for (let x = from + 1; x <= to; x++) path.push(x);
  p.tokens[token] = to;

  const captured: { player: number; token: number }[] = [];
  const idx = trackIndex(p.color, to);
  if (idx !== null && !LUDO_SAFE.has(idx)) {
    const hits = othersOn(s, idx, me);
    // Two or more tokens of one side on a square make a "joda" (block): it can't be captured.
    // In 2 vs 2 that includes partners standing together (e.g. one red + one yellow). Once one
    // of them moves away, the one left behind can be captured again.
    const side = (pi: number) => (s.teams ? s.teams[pi]! : pi);
    const bySide = new Map<number, number>();
    for (const h of hits) bySide.set(side(h.player), (bySide.get(side(h.player)) ?? 0) + 1);
    for (const h of hits) {
      if ((bySide.get(side(h.player)) ?? 0) >= 2) continue;
      s.players[h.player]!.tokens[h.token] = -1;
      captured.push(h);
    }
  }
  const reachedHome = to === LUDO_FINISH;
  const playerDone = allHome(p);
  if (s.teams) {
    // A team wins when both partners have all their tokens home.
    const team = s.teams[me]!;
    const teamDone = s.players.every((x, i) => s.teams![i] !== team || allHome(x));
    if (teamDone) {
      s.players.forEach((x, i) => (x.place = s.teams![i] === team ? 1 : 2));
      s.finished = true;
    }
  } else {
    if (playerDone && !p.place) p.place = s.players.filter((x) => x.place).length + 1;
    const active = s.players.filter((x) => !x.place);
    if (active.length <= 1) {
      for (const x of active) x.place = s.players.length;
      s.finished = true;
    }
  }
  // Team games: finishing your own four doesn't end your turns (you help your partner).
  const turnOver = s.teams ? false : playerDone;
  const extraTurn = !s.finished && !turnOver && (dice === 6 || captured.length > 0 || reachedHome);
  if (!extraTurn) nextTurn(s);
  else s.dice = 0;
  return { state: s, path, captured, reachedHome, extraTurn, playerDone };
}

/** Roll for the current player. With no legal move (or a third six) the turn passes. */
export function applyRoll(s0: LudoState, dice: number): { state: LudoState; moves: number[]; lost: boolean } {
  const s: LudoState = { ...s0, players: s0.players.map((p) => ({ ...p, tokens: [...p.tokens] })) };
  s.dice = dice;
  s.sixes = dice === 6 ? s.sixes + 1 : 0;
  if (s.sixes >= 3) {
    nextTurn(s);
    return { state: s, moves: [], lost: true };
  }
  const moves = legalMoves(s, dice);
  return { state: s, moves, lost: false };
}

/** Pass the turn to the next player who is still playing. */
export function nextTurn(s: LudoState) {
  s.dice = 0;
  s.sixes = 0;
  if (s.finished) return;
  for (let i = 1; i <= s.players.length; i++) {
    const n = (s.turn + i) % s.players.length;
    if (!s.players[n]!.place) {
      s.turn = n;
      return;
    }
  }
}

/** Is a track index within reach (1–6 steps) of any opponent token behind it? */
function inDanger(s: LudoState, me: number, idx: number) {
  if (LUDO_SAFE.has(idx)) return false;
  return s.players.some((p, pi) => {
    if (sameTeam(s, pi, me)) return false;
    return p.tokens.some((pr) => {
      const at = trackIndex(p.color, pr);
      if (at === null) return pr < 0 && idx === startIndex(p.color); // a token can come out onto its start
      const d = (idx - at + 52) % 52;
      return d >= 1 && d <= 6;
    });
  });
}

/** Computer player: picks a token to move. level 0 easy, 1 normal, 2 hard. */
export function chooseAiMove(s: LudoState, moves: number[], level: 0 | 1 | 2, rnd: () => number = Math.random): number {
  if (moves.length === 1) return moves[0]!;
  if (level === 0 && rnd() < 0.5) return moves[Math.floor(rnd() * moves.length)]!;
  const me = moverOf(s);
  const p = s.players[me]!;
  let best = moves[0]!;
  let bestScore = -Infinity;
  for (const t of moves) {
    const from = p.tokens[t]!;
    const r = applyMove({ ...s, dice: s.dice }, t);
    const to = r.state.players[me]!.tokens[t]!;
    let score = 0;
    if (r.captured.length) score += 100;
    if (to === LUDO_FINISH) score += 80;
    if (from < 0) score += 60;
    if (to >= HOME_START && from < HOME_START) score += 45;
    const idxTo = trackIndex(p.color, to);
    const idxFrom = trackIndex(p.color, from);
    if (idxTo !== null && LUDO_SAFE.has(idxTo)) score += 25;
    if (level === 2) {
      if (idxFrom !== null && inDanger(s, me, idxFrom)) score += 35; // run away
      if (idxTo !== null && inDanger(r.state, me, idxTo)) score -= 50;
    } else if (idxTo !== null && inDanger(r.state, me, idxTo)) score -= 20;
    score += to * 0.6 + rnd() * 4;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

/* ------------------------------ Online games ------------------------------ */

export interface LudoSeat {
  userId: number;
  /** Public UID (for profile / chat links); missing for computer players. */
  uid?: string;
  name: string;
  avatar: string | null;
  color: LudoColor;
  /** 2 vs 2 team (0 or 1), null when everyone plays for themselves. */
  team: number | null;
  bot: boolean;
  connected: boolean;
  /** Left the game: the computer (or the partner in 2 vs 2) plays for them. */
  left: boolean;
  /** Token design bought in the shop (ball, star, gem, crown); missing = standard pin. */
  token?: string;
}

export type LudoLast =
  | { type: 'roll'; by: number; dice: number; moves: number[]; lost?: boolean }
  | { type: 'move'; by: number; mover: number; token: number; path: number[]; captured: { player: number; token: number }[]; home: boolean; extra: boolean }
  | { type: 'pass'; by: number };

export interface LudoSnapshot {
  id: string;
  /** Room code (rooms only). */
  code: string | null;
  kind: 'quick' | 'room';
  status: 'lobby' | 'playing' | 'finished';
  hostId: number;
  size: 2 | 4;
  teams: boolean;
  seats: LudoSeat[];
  state: LudoState | null;
  last: LudoLast | null;
  /** Grows with every change (the app animates moves in order). */
  seq: number;
  /** When the current turn times out (ms since epoch). */
  deadline: number | null;
  turnSeconds: number;
  /** 2 vs 2 room: the player the host picked as teammate. */
  partnerId?: number | null;
}

/** Seat colours: 2 players sit opposite (blue vs green); 4 go clockwise from blue. */
export const ludoColorsFor = (size: 2 | 4): LudoColor[] => (size === 2 ? [3, 1] : [3, 0, 1, 2]);
