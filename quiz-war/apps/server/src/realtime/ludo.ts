import { randomInt } from 'node:crypto';
import {
  applyMove,
  applyRoll,
  chooseAiMove,
  ludoColorsFor,
  MATCH_REACTIONS,
  moverOf,
  newLudoGame,
  nextTurn,
  type LudoSeat,
  type LudoSnapshot,
  type PublicUser,
  type ServerToClientEvents,
} from '@quizwar/shared';
import { ulid } from '../lib/crypto';
import { AppError } from '../lib/errors';

interface Game extends LudoSnapshot {
  timer?: NodeJS.Timeout;
  /** Missed turns in a row per seat (auto-played). */
  missed: number[];
  /** Fair dice: each seat draws from its own shuffled bag (never sent to players). */
  bags?: number[][];
  /** Counts game actions (roll / move / pass): the app animates each one exactly once. */
  actNo?: number;
  updatedAt: number;
}

interface Deps {
  emit<E extends keyof ServerToClientEvents>(userId: number, event: E, payload: Parameters<ServerToClientEvents[E]>[0]): void;
  publicUser(id: number): Promise<PublicUser | null>;
  /** The player's Ludo token design from the shop. */
  tokenStyle?(id: number): Promise<string | null>;
  settings(): { enabled: boolean; turnSeconds: number; winCoins: number };
  /** Save results (stats, boards, coins). */
  record(game: LudoSnapshot): Promise<void>;
  invitePush(to: number, from: PublicUser, code: string): Promise<void>;
  /** Is the player connected right now (any device)? */
  isOnline(userId: number): boolean;
  log: { warn: (o: object, m: string) => void };
}

const BOT_NAMES = ['রবি', 'মিতু', 'টুকু'];
const CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
/** Time for the app to show a move before the next player acts. */
const moveShowMs = (steps: number) => Math.min(4000, 350 + steps * 180);

/**
 * Online Ludo. The server rolls the dice and checks every move (no cheating); the apps only
 * draw. Seats that left or time out are played by the computer, so a game never gets stuck.
 */
export class LudoService {
  private games = new Map<string, Game>();
  private byUser = new Map<number, string>();
  private codes = new Map<string, string>();
  private queues: Record<'1v1' | '2v2', number[]> = { '1v1': [], '2v2': [] };

  constructor(private readonly d: Deps) {
    setInterval(() => this.sweep(), 60_000).unref();
  }

  /** Is this user a player of this game? (voice chat) */
  isMember(gameId: string, userId: number) {
    return !!this.games.get(gameId)?.seats.some((s) => s.userId === userId && !s.bot);
  }

  private snap(g: Game): LudoSnapshot {
    const { timer: _t, missed: _m, updatedAt: _u, bags: _b, actNo: _n, ...rest } = g;
    return rest;
  }

  private send(g: Game) {
    for (const seat of g.seats) if (!seat.bot) seat.connected = !seat.left && this.d.isOnline(seat.userId);
    g.seq++;
    g.updatedAt = Date.now();
    const s = this.snap(g);
    for (const seat of g.seats) if (!seat.bot) this.d.emit(seat.userId, 'ludo:snap', s);
  }

  private get(gameId: string) {
    const g = this.games.get(gameId);
    if (!g) throw new AppError(404, 'not_found', 'This game is over');
    return g;
  }

  private assertOn() {
    if (!this.d.settings().enabled) throw new AppError(403, 'ludo_off', 'Ludo is turned off right now');
  }

  /** Starting something new: leave a waiting room automatically; a running game must be finished first. */
  private assertFree(userId: number) {
    const id = this.byUser.get(userId);
    const g = id ? this.games.get(id) : null;
    if (!g || g.status === 'finished') return;
    const seat = g.seats.find((s) => s.userId === userId);
    if (!seat || seat.left) return;
    if (g.status === 'lobby') return this.leave(userId, g.id);
    throw new AppError(409, 'in_ludo', g.id);
  }

  private newGame(kind: 'quick' | 'room', hostId: number, size: 2 | 3 | 4, teams: boolean): Game {
    if (this.games.size > 3000) throw new AppError(503, 'busy', 'Too many games right now, try again soon');
    let code: string | null = null;
    if (kind === 'room') {
      do code = Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
      while (this.codes.has(code));
    }
    const g: Game = {
      id: ulid(),
      code,
      kind,
      status: 'lobby',
      hostId,
      size,
      teams: size === 4 && teams,
      seats: [],
      state: null,
      last: null,
      seq: 0,
      deadline: null,
      turnSeconds: this.d.settings().turnSeconds,
      missed: [],
      updatedAt: Date.now(),
    };
    this.games.set(g.id, g);
    if (code) this.codes.set(code, g.id);
    return g;
  }

  private seatFor(g: Game, u: { id: number; name: string; avatar: string | null; uid?: string }, bot = false): LudoSeat {
    const colors = ludoColorsFor(g.size);
    const i = g.seats.length;
    return { userId: u.id, ...(u.uid ? { uid: u.uid } : {}), name: u.name, avatar: u.avatar, color: colors[i]!, team: g.teams ? i % 2 : null, bot, connected: !bot, left: false };
  }

  private async addUser(g: Game, userId: number) {
    const u = await this.d.publicUser(userId);
    if (!u) throw new AppError(404, 'not_found', 'Player not found');
    if (g.seats.length >= g.size) throw new AppError(409, 'full', 'This room is full');
    const seat = this.seatFor(g, { id: u.id, name: u.username, avatar: u.avatarThumbUrl ?? null, uid: u.uid });
    const token = await this.d.tokenStyle?.(userId).catch(() => null);
    if (token) seat.token = token;
    g.seats.push(seat);
    this.byUser.set(userId, g.id);
  }

  /* ------------------------------ Matchmaking ------------------------------ */

  async queue(userId: number, mode: '1v1' | '2v2') {
    this.assertOn();
    this.assertFree(userId);
    this.unqueue(userId);
    const q = this.queues[mode];
    q.push(userId);
    const need = mode === '1v1' ? 2 : 4;
    if (q.length < need) return {};
    const picked = q.splice(0, need);
    const g = this.newGame('quick', picked[0]!, need as 2 | 4, mode === '2v2');
    for (const uid of picked) await this.addUser(g, uid);
    this.begin(g);
    for (const uid of picked) this.d.emit(uid, 'ludo:matched', { gameId: g.id });
    return { gameId: g.id };
  }

  unqueue(userId: number) {
    for (const q of Object.values(this.queues)) {
      const i = q.indexOf(userId);
      if (i >= 0) q.splice(i, 1);
    }
  }

  /* --------------------------------- Rooms --------------------------------- */

  async create(userId: number, size: 2 | 3 | 4, teams: boolean) {
    this.assertOn();
    this.assertFree(userId);
    this.unqueue(userId);
    const g = this.newGame('room', userId, size, teams);
    await this.addUser(g, userId);
    this.send(g);
    return { snapshot: this.snap(g) };
  }

  async join(userId: number, code: string) {
    this.assertOn();
    const id = this.codes.get(code.trim().toUpperCase());
    const g = id ? this.games.get(id) : null;
    if (!g) throw new AppError(404, 'not_found', 'No room with this code');
    if (!g.seats.some((s) => s.userId === userId)) {
      if (g.status !== 'lobby') throw new AppError(409, 'started', 'This game has already started');
      this.assertFree(userId);
      this.unqueue(userId);
      await this.addUser(g, userId);
      this.arrange(g);
      this.send(g);
    }
    return { snapshot: this.snap(g) };
  }

  /**
   * Seat order decides colours and teams (seats 0+2 vs 1+3). If the host picked a teammate,
   * the host sits first and the teammate opposite; everyone else keeps their join order.
   */
  private arrange(g: Game) {
    const partner = g.teams && g.partnerId ? g.seats.find((s) => s.userId === g.partnerId) : undefined;
    if (g.partnerId && !partner) g.partnerId = null;
    if (partner) {
      const host = g.seats.find((s) => s.userId === g.hostId);
      const others = g.seats.filter((s) => s !== host && s !== partner);
      g.seats = [host, others[0], partner, others[1]].filter((s): s is LudoSeat => !!s);
    }
    const colors = ludoColorsFor(g.size);
    if (!g.teams) {
      // Everyone keeps the corner they picked; newcomers get a free one.
      const taken = new Set<number>();
      for (const s of g.seats) {
        if (colors.includes(s.color) && !taken.has(s.color)) taken.add(s.color);
        else s.color = -1 as never;
      }
      for (const s of g.seats) {
        if ((s.color as number) !== -1) continue;
        s.color = colors.find((c) => !taken.has(c))!;
        taken.add(s.color);
      }
      for (const s of g.seats) s.team = null;
      return;
    }
    g.seats.forEach((s, k) => {
      s.color = colors[k]!;
      s.team = partner ? (s === partner || s.userId === g.hostId ? 0 : 1) : k % 2;
    });
  }

  /** Room lobby: sit in another free corner (not in 2 vs 2, where seats decide the teams). */
  seat(userId: number, gameId: string, color: number) {
    const g = this.get(gameId);
    if (g.status !== 'lobby' || g.teams) return;
    const me = g.seats.find((s) => s.userId === userId);
    if (!me || !ludoColorsFor(g.size).includes(color as never) || g.seats.some((s) => s.color === color)) return;
    me.color = color as never;
    this.send(g);
  }

  /** 2 vs 2 room: the host chooses a teammate (tap again to undo). */
  partner(userId: number, gameId: string, partnerId: number) {
    const g = this.get(gameId);
    if (g.hostId !== userId) throw new AppError(403, 'not_host', 'Only the host can pick teams');
    if (g.status !== 'lobby' || !g.teams) return;
    if (partnerId === userId || !g.seats.some((s) => s.userId === partnerId)) return;
    g.partnerId = g.partnerId === partnerId ? null : partnerId;
    this.arrange(g);
    this.send(g);
  }

  /** Host starts — only when the room is full (every seat a real player). */
  start(userId: number, gameId: string) {
    const g = this.get(gameId);
    if (g.hostId !== userId) throw new AppError(403, 'not_host', 'Only the host can start');
    if (g.status !== 'lobby') return;
    if (g.seats.length < g.size) throw new AppError(409, 'not_full', 'Wait until the room is full');
    this.begin(g);
  }

  private begin(g: Game) {
    g.status = 'playing';
    // Turns go clockwise around the board (blue → red → green → yellow).
    if (!g.teams) {
      const order = [3, 0, 1, 2];
      g.seats.sort((a, b) => order.indexOf(a.color) - order.indexOf(b.color));
    }
    g.state = newLudoGame(
      g.seats.map((s) => s.color),
      g.teams ? g.seats.map((s) => s.team ?? 0) : undefined,
    );
    g.missed = g.seats.map(() => 0);
    g.bags = [];
    g.actNo = 0;
    g.last = null;
    this.armTurn(g, 900);
    this.send(g);
  }

  async invite(userId: number, gameId: string, to: number) {
    const g = this.get(gameId);
    if (!g.code || g.status !== 'lobby' || !g.seats.some((s) => s.userId === userId)) throw new AppError(409, 'cannot_invite', 'You can invite from a room lobby');
    const from = await this.d.publicUser(userId);
    if (!from) return;
    this.d.emit(to, 'ludo:invited', { gameId: g.id, code: g.code, from });
    void this.d.invitePush(to, from, g.code).catch(() => undefined);
  }

  private lastReact = new Map<number, number>();
  /** Emoji to everyone at the table (rate-limited, fixed set). */
  react(userId: number, gameId: string, reaction: string) {
    const g = this.get(gameId);
    const seat = g.seats.findIndex((s) => s.userId === userId);
    if (seat < 0 || !(MATCH_REACTIONS as readonly string[]).includes(reaction)) throw new AppError(400, 'bad_reaction', 'Unknown reaction');
    const now = Date.now();
    if (now - (this.lastReact.get(userId) ?? 0) < 1200) return;
    this.lastReact.set(userId, now);
    if (this.lastReact.size > 20_000) this.lastReact.clear();
    for (const s of g.seats) if (!s.bot) this.d.emit(s.userId, 'ludo:reaction', { gameId, seat, reaction });
  }

  /* ---------------------------------- Play --------------------------------- */

  /** Who acts for the seat whose turn it is: the player, their partner (2 vs 2), or nobody (computer). */
  private controller(g: Game): number | null {
    const st = g.state!;
    const seat = g.seats[st.turn]!;
    if (!seat.bot && !seat.left) return seat.userId;
    if (g.teams) {
      const partner = g.seats.find((s, i) => i !== st.turn && s.team === seat.team && !s.bot && !s.left);
      if (partner) return partner.userId;
    }
    return null;
  }

  /** Start the clock for the current turn; the computer acts for empty seats. */
  private armTurn(g: Game, delay = 0) {
    clearTimeout(g.timer);
    if (g.status !== 'playing') return;
    const who = this.controller(g);
    if (who === null) {
      g.deadline = null;
      g.timer = setTimeout(() => this.auto(g.id), delay + 800);
      return;
    }
    g.deadline = Date.now() + delay + g.turnSeconds * 1000;
    g.timer = setTimeout(() => this.timeout(g.id), delay + g.turnSeconds * 1000);
  }

  private timeout(gameId: string) {
    const g = this.games.get(gameId);
    if (!g || g.status !== 'playing') return;
    const t = g.state!.turn;
    g.missed[t] = (g.missed[t] ?? 0) + 1;
    this.auto(gameId);
  }

  /** The computer rolls / moves for this turn. */
  private auto(gameId: string) {
    const g = this.games.get(gameId);
    if (!g || g.status !== 'playing') return;
    if (!g.state!.dice) return this.doRoll(g, true);
    const moves = g.last?.type === 'roll' ? g.last.moves : [];
    if (!moves.length) return this.pass(g);
    this.doMove(g, chooseAiMove(g.state!, moves, 1));
  }

  roll(userId: number, gameId: string) {
    const g = this.get(gameId);
    if (g.status !== 'playing') throw new AppError(409, 'not_playing', 'The game is not running');
    if (this.controller(g) !== userId) throw new AppError(403, 'not_your_turn', 'Not your turn');
    if (g.state!.dice) throw new AppError(409, 'rolled', 'Already rolled');
    g.missed[g.state!.turn] = 0;
    this.doRoll(g);
  }

  private nextAct(g: Game) {
    g.actNo = (g.actNo ?? 0) + 1;
    return g.actNo;
  }

  /** Seconds a player gets to pick a token after rolling (then the computer picks). */
  private static PICK_SECONDS = 10;

  /**
   * Fair dice. Pure random lets one player get six after six while another waits 20 rolls.
   * Each seat draws from its own shuffled bag holding 1–6 once each (refilled when empty),
   * so everyone gets every number — sixes included — at the same rate, in an unpredictable
   * order. One roll in five is fully random so the pattern can't be counted.
   */
  private fairDice(g: Game, seat: number) {
    if (randomInt(5) === 0) return randomInt(1, 7);
    g.bags ??= [];
    let bag = g.bags[seat];
    if (!bag || !bag.length) {
      bag = [1, 2, 3, 4, 5, 6];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [bag[i], bag[j]] = [bag[j]!, bag[i]!];
      }
      g.bags[seat] = bag;
    }
    return bag.pop()!;
  }

  private doRoll(g: Game, auto = false) {
    const dice = this.fairDice(g, g.state!.turn);
    const by = g.state!.turn;
    const r = applyRoll(g.state!, dice);
    g.state = r.state;
    g.last = { n: this.nextAct(g), type: 'roll', by, dice, moves: r.moves, ...(r.lost ? { lost: true } : {}), ...(r.again ? { again: true } : {}) };
    clearTimeout(g.timer);
    if (r.lost) {
      // applyRoll already passed the turn.
      g.deadline = null;
      this.send(g);
      this.armTurn(g, 900);
      return;
    }
    if (r.again) {
      // No token out yet and no six: the same player rolls again (up to 3 tries).
      g.deadline = null;
      this.send(g);
      this.armTurn(g, 700);
      return;
    }
    if (!r.moves.length) {
      g.deadline = null;
      this.send(g);
      g.timer = setTimeout(() => this.pass(g), 900);
      return;
    }
    const mover = r.state.players[moverOf(r.state)]!;
    const allSame = r.moves.every((m) => mover.tokens[m] === mover.tokens[r.moves[0]!]);
    this.send(g);
    if (r.moves.length === 1 || allSame || this.controller(g) === null) {
      g.deadline = null;
      const pick = r.moves.length === 1 || allSame ? r.moves[0]! : chooseAiMove(g.state!, r.moves, 1);
      g.timer = setTimeout(() => this.doMove(g, pick), this.controller(g) === null ? 700 : 450);
      return;
    }
    // The player didn't roll (computer rolled for them): move quickly too. Otherwise 10 s to pick.
    const pick = auto ? 1.5 : Math.min(LudoService.PICK_SECONDS, g.turnSeconds);
    g.deadline = Date.now() + pick * 1000;
    g.timer = setTimeout(() => this.timeout(g.id), pick * 1000);
  }

  private pass(g: Game) {
    if (g.status !== 'playing') return;
    const by = g.state!.turn;
    const s = { ...g.state!, players: g.state!.players.map((p) => ({ ...p, tokens: [...p.tokens] })) };
    nextTurn(s);
    g.state = s;
    g.last = { n: this.nextAct(g), type: 'pass', by };
    this.armTurn(g);
    this.send(g);
  }

  move(userId: number, gameId: string, token: number) {
    const g = this.get(gameId);
    if (g.status !== 'playing') throw new AppError(409, 'not_playing', 'The game is not running');
    if (this.controller(g) !== userId) throw new AppError(403, 'not_your_turn', 'Not your turn');
    if (!g.state!.dice) throw new AppError(409, 'roll_first', 'Roll first');
    const last = g.last;
    if (last?.type !== 'roll' || !last.moves.includes(token)) throw new AppError(400, 'bad_move', 'That token cannot move');
    g.missed[g.state!.turn] = 0;
    this.doMove(g, token);
  }

  private doMove(g: Game, token: number) {
    if (g.status !== 'playing' || !g.state!.dice) return;
    clearTimeout(g.timer);
    const by = g.state!.turn;
    const mover = moverOf(g.state!);
    const r = applyMove(g.state!, token);
    g.state = r.state;
    g.last = { n: this.nextAct(g), type: 'move', by, mover, token, path: r.path, captured: r.captured, home: r.reachedHome, extra: r.extraTurn };
    if (r.state.finished) return this.finish(g);
    this.armTurn(g, moveShowMs(r.path.length));
    this.send(g);
  }

  private finish(g: Game) {
    clearTimeout(g.timer);
    g.status = 'finished';
    g.deadline = null;
    for (const s of g.seats) if (!s.bot && this.byUser.get(s.userId) === g.id) this.byUser.delete(s.userId);
    this.send(g);
    void this.d.record(this.snap(g)).catch((err) => this.d.log.warn({ err }, 'ludo record failed'));
  }

  /** Leave: lobby → out of the room; 1 vs 1 → you lose; otherwise the computer / partner plays on. */
  leave(userId: number, gameId: string) {
    const g = this.games.get(gameId);
    if (!g) return;
    const i = g.seats.findIndex((s) => s.userId === userId);
    if (i < 0) return;
    if (this.byUser.get(userId) === gameId) this.byUser.delete(userId);
    if (g.status === 'lobby') {
      if (userId === g.hostId) return this.close(g);
      g.seats.splice(i, 1);
      this.arrange(g);
      this.send(g);
      return;
    }
    if (g.status !== 'playing') return;
    g.seats[i]!.left = true;
    g.seats[i]!.connected = false;
    const humans = g.seats.filter((s) => !s.bot && !s.left);
    if (!humans.length) return this.close(g);
    if (g.size === 2 && !g.teams) {
      // 1 vs 1: whoever leaves loses.
      g.state!.players.forEach((p, k) => (p.place = k === i ? 2 : 1));
      g.state!.finished = true;
      return this.finish(g);
    }
    if (g.state!.turn === i) this.armTurn(g);
    this.send(g);
  }

  private close(g: Game) {
    clearTimeout(g.timer);
    for (const s of g.seats) {
      if (this.byUser.get(s.userId) === g.id) this.byUser.delete(s.userId);
      if (!s.bot) this.d.emit(s.userId, 'ludo:snap', { ...this.snap(g), status: 'finished', state: null, seq: g.seq + 1 });
    }
    this.games.delete(g.id);
    if (g.code) this.codes.delete(g.code);
  }

  /** Same players again (host of a room). If someone left, the room opens again for a new player. */
  rematch(userId: number, gameId: string) {
    const g = this.get(gameId);
    if (g.status !== 'finished' || g.kind !== 'room') throw new AppError(409, 'cannot_rematch', 'Start a new game from the menu');
    if (g.hostId !== userId) throw new AppError(403, 'not_host', 'Only the host can start again');
    g.seats = g.seats.filter((s) => !s.bot && !s.left);
    for (const s of g.seats) this.byUser.set(s.userId, g.id);
    this.arrange(g);
    if (g.seats.length < g.size) {
      g.status = 'lobby';
      g.state = null;
      g.last = null;
      g.deadline = null;
      this.send(g);
      return;
    }
    this.begin(g);
  }

  resume(userId: number, gameId: string) {
    const g = this.get(gameId);
    const seat = g.seats.find((s) => s.userId === userId);
    if (!seat) throw new AppError(403, 'not_in_game', 'You are not in this game');
    // Came back after leaving: take the seat back from the computer (not in a finished game,
    // and not if another game was started in between).
    const elsewhere = this.byUser.get(userId);
    if (seat.left && g.status === 'playing' && (!elsewhere || elsewhere === g.id || this.games.get(elsewhere)?.status === 'finished')) {
      seat.left = false;
      seat.connected = true;
      this.byUser.set(userId, g.id);
      const i = g.seats.indexOf(seat);
      g.missed[i] = 0;
      if (g.state!.turn === i) this.armTurn(g);
      this.send(g);
    } else if (!seat.connected) {
      seat.connected = true;
      this.send(g);
    }
    return { snapshot: this.snap(g) };
  }

  /** Phone came online: tell it about its running game. */
  onConnect(userId: number) {
    const id = this.byUser.get(userId);
    const g = id ? this.games.get(id) : null;
    if (!g || g.status === 'finished') return;
    const seat = g.seats.find((s) => s.userId === userId);
    if (seat && !seat.left) this.send(g);
  }

  onDisconnect(userId: number) {
    this.unqueue(userId);
    const id = this.byUser.get(userId);
    const g = id ? this.games.get(id) : null;
    if (g && g.status !== 'finished') this.send(g);
  }

  /** Drop old finished / idle games. */
  private sweep() {
    const now = Date.now();
    for (const g of this.games.values()) {
      const idle = now - g.updatedAt;
      if ((g.status === 'finished' && idle > 10 * 60_000) || (g.status === 'lobby' && idle > 60 * 60_000) || idle > 3 * 60 * 60_000) this.close(g);
    }
  }
}
