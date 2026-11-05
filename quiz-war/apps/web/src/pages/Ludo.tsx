import {
  applyMove,
  applyRoll,
  cellOf,
  chooseAiMove,
  LUDO_COLORS,
  LUDO_FINISH,
  LUDO_HOME,
  LUDO_SAFE,
  LUDO_TRACK,
  newLudoGame,
  nextTurn,
  trackIndex,
  type LudoColor,
  type LudoState,
} from '@quizwar/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Sheet';
import { useAuth } from '../lib/auth';
import { num, useLang, useT } from '../lib/i18n';
import { ludoSfx } from '../lib/ludoSound';
import { haptic } from '../lib/platform';
import { useSettings } from '../lib/settings';

/* ------------------------------------------------------------------ */
/*  Menu                                                              */
/* ------------------------------------------------------------------ */

const LEVELS = [
  ['Easy', 'সহজ'],
  ['Normal', 'মাঝারি'],
  ['Hard', 'কঠিন'],
] as const;

export default function LudoMenu() {
  const t = useT();
  const nav = useNavigate();
  const [players, setPlayers] = useState<2 | 4>(4);
  const [level, setLevel] = useState<0 | 1 | 2>(1);
  const [localN, setLocalN] = useState<2 | 3 | 4>(2);
  return (
    <div className="ludo-stage">
      <header className="ludo-top">
        <button className="ludo-round" aria-label={t('Back', 'ফিরে যান')} onClick={() => nav(-1)}><Icon name="back" size={22} /></button>
        <b>{t('Ludo', 'লুডু')}</b>
        <span className="ludo-round ghost" />
      </header>

      <div className="ludo-hero" aria-hidden>
        <MiniBoard />
        <h1>{t('Ludo', 'লুডু')}</h1>
        <p>{t('Roll, race and capture — first home wins!', 'ছক্কা চালুন, গুটি কাটুন — আগে ঘরে তুললেই জয়!')}</p>
      </div>

      <section className="ludo-card">
        <div className="lc-head"><span className="lc-ic c-purple"><Icon name="bot" size={22} /></span><span><b>{t('Play with computer', 'কম্পিউটারের সাথে')}</b><small>{t('Practise any time, no internet needed', 'যেকোনো সময়, নেট ছাড়াই')}</small></span></div>
        <div className="lc-row">
          <span className="lc-label">{t('Players', 'প্লেয়ার')}</span>
          <div className="seg">
            {([2, 4] as const).map((n) => <button key={n} aria-pressed={players === n} onClick={() => setPlayers(n)}>{n === 2 ? t('1 vs 1', '১ বনাম ১') : t('4 players', '৪ জন')}</button>)}
          </div>
        </div>
        <div className="lc-row">
          <span className="lc-label">{t('Level', 'লেভেল')}</span>
          <div className="seg">
            {LEVELS.map(([en, bn], i) => <button key={en} aria-pressed={level === i} onClick={() => setLevel(i as 0 | 1 | 2)}>{t(en, bn)}</button>)}
          </div>
        </div>
        <button className="btn primary block" onClick={() => (haptic('tap'), nav(`/ludo/play?mode=ai&n=${players}&lv=${level}`))}><Icon name="play" /> {t('Play now', 'খেলা শুরু')}</button>
      </section>

      <section className="ludo-card">
        <div className="lc-head"><span className="lc-ic c-green"><Icon name="users" size={22} /></span><span><b>{t('Friends on one phone', 'এক ফোনে বন্ধুদের সাথে')}</b><small>{t('Pass the phone on each turn', 'চাল শেষে ফোন হাতবদল করুন')}</small></span></div>
        <div className="lc-row">
          <span className="lc-label">{t('Players', 'প্লেয়ার')}</span>
          <div className="seg">
            {([2, 3, 4] as const).map((n) => <button key={n} aria-pressed={localN === n} onClick={() => setLocalN(n)}>{num(n, 'bn')}</button>)}
          </div>
        </div>
        <button className="btn soft block" onClick={() => (haptic('tap'), nav(`/ludo/play?mode=local&n=${localN}`))}><Icon name="play" /> {t('Start', 'শুরু করুন')}</button>
      </section>

      <section className="ludo-card soon">
        <div className="lc-head"><span className="lc-ic c-blue"><Icon name="globe" size={22} /></span><span><b>{t('Online: auto match, rooms, 2 vs 2', 'অনলাইন: অটো ম্যাচ, রুম, ২ বনাম ২')}</b><small>{t('With live voice — coming in the next update', 'লাইভ ভয়েসসহ — পরের আপডেটে আসছে')}</small></span><em>{t('Soon', 'শীঘ্রই')}</em></div>
      </section>
    </div>
  );
}

/** Small decorative board for the menu. */
function MiniBoard() {
  return (
    <svg className="ludo-mini" viewBox="0 0 15 15">
      <BoardArt />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Board art (SVG, 15 × 15 units)                                    */
/* ------------------------------------------------------------------ */

const YARD_ORIGIN: [number, number][] = [[0, 0], [9, 0], [9, 9], [0, 9]];

function Star({ x, y, color = '#94a3b8' }: { x: number; y: number; color?: string }) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? 0.17 : 0.38;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    return `${x + 0.5 + r * Math.cos(a)},${y + 0.5 + r * Math.sin(a)}`;
  }).join(' ');
  return <polygon points={pts} fill={color} />;
}

function BoardArt() {
  return (
    <>
      <rect x="0" y="0" width="15" height="15" rx="0.35" fill="#fff" />
      {/* Track squares */}
      {LUDO_TRACK.map(([c, r], i) => {
        const owner = [0, 13, 26, 39].indexOf(i);
        return <rect key={i} x={c} y={r} width="1" height="1" fill={owner >= 0 ? LUDO_COLORS[owner] : '#fff'} stroke="#cbd5e1" strokeWidth="0.03" />;
      })}
      {/* Home columns */}
      {LUDO_HOME.map((cells, ci) => cells.map(([c, r], k) => <rect key={`${ci}-${k}`} x={c} y={r} width="1" height="1" fill={LUDO_COLORS[ci]} stroke="rgba(0,0,0,.12)" strokeWidth="0.03" />))}
      {/* Safe stars */}
      {[8, 21, 34, 47].map((i) => <Star key={i} x={LUDO_TRACK[i]![0]} y={LUDO_TRACK[i]![1]} />)}
      {[0, 13, 26, 39].map((i) => <Star key={`s${i}`} x={LUDO_TRACK[i]![0]} y={LUDO_TRACK[i]![1]} color="rgba(255,255,255,.85)" />)}
      {/* Yards */}
      {YARD_ORIGIN.map(([x, y], ci) => (
        <g key={ci}>
          <rect x={x} y={y} width="6" height="6" fill={LUDO_COLORS[ci]} />
          <rect x={x + 0.7} y={y + 0.7} width="4.6" height="4.6" rx="0.5" fill="#fff" />
          {[[1.5, 1.5], [3.5, 1.5], [1.5, 3.5], [3.5, 3.5]].map(([dx, dy], k) => (
            <circle key={k} cx={x + dx!} cy={y + dy!} r="0.62" fill={LUDO_COLORS[ci]} opacity="0.9" stroke="rgba(0,0,0,.15)" strokeWidth="0.05" />
          ))}
        </g>
      ))}
      {/* Centre */}
      <polygon points="6,6 6,9 7.5,7.5" fill={LUDO_COLORS[0]} />
      <polygon points="6,6 9,6 7.5,7.5" fill={LUDO_COLORS[1]} />
      <polygon points="9,6 9,9 7.5,7.5" fill={LUDO_COLORS[2]} />
      <polygon points="6,9 9,9 7.5,7.5" fill={LUDO_COLORS[3]} />
      <rect x="0" y="0" width="15" height="15" rx="0.35" fill="none" stroke="#0f172a" strokeOpacity=".25" strokeWidth="0.08" />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Dice                                                              */
/* ------------------------------------------------------------------ */

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[26, 26], [50, 50], [74, 74]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]],
  6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]],
};

function Dice({ value, rolling, canRoll, onRoll }: { value: number; rolling: boolean; canRoll: boolean; onRoll: () => void }) {
  const t = useT();
  return (
    <button type="button" className={`ludo-dice${rolling ? ' rolling' : ''}${canRoll ? ' ready' : ''}`} onClick={onRoll} disabled={!canRoll} aria-label={canRoll ? t('Roll the dice', 'ছক্কা চালুন') : t(`Dice ${value}`, `ছক্কা ${value}`)}>
      <svg viewBox="0 0 100 100">
        <rect x="4" y="4" width="92" height="92" rx="22" fill="#fff" />
        {(PIPS[value || 6] ?? []).map(([x, y], i) => <circle key={i} cx={x} cy={y} r="9.5" fill={value === 1 ? '#e53935' : '#1e293b'} />)}
      </svg>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Game                                                              */
/* ------------------------------------------------------------------ */

interface Seat {
  name: string;
  avatar?: string | null;
  bot: boolean;
}

/** Turn order goes clockwise from the bottom-left (blue = you). */
const ORDER_4: LudoColor[] = [3, 0, 1, 2];
const ORDER_2: LudoColor[] = [3, 1];
const ORDER_3: LudoColor[] = [3, 0, 1];
const BOT_NAMES = [['Robi', 'রবি'], ['Mitu', 'মিতু'], ['Tuku', 'টুকু']] as const;
/** Panel corner for each colour. */
const CORNER = ['tl', 'tr', 'br', 'bl'] as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function LudoGame() {
  const t = useT();
  const lang = useLang();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const me = useAuth((s) => s.user);
  const sound = useSettings((s) => s.sound);
  const setSettings = useSettings((s) => s.set);
  const mode = params.get('mode') === 'local' ? 'local' : 'ai';
  const n = Math.min(4, Math.max(2, Number(params.get('n') ?? 4))) as 2 | 3 | 4;
  const level = Math.min(2, Math.max(0, Number(params.get('lv') ?? 1))) as 0 | 1 | 2;
  const colors = n === 2 ? ORDER_2 : n === 3 ? ORDER_3 : ORDER_4;

  const seats: Seat[] = useMemo(
    () =>
      colors.map((c, i) =>
        i === 0
          ? { name: mode === 'local' ? t('Player 1', 'প্লেয়ার ১') : (me?.username ?? t('You', 'আপনি')), avatar: mode === 'local' ? null : me?.avatarThumbUrl, bot: false }
          : mode === 'local'
            ? { name: t(`Player ${i + 1}`, `প্লেয়ার ${num(i + 1, 'bn')}`), bot: false }
            : { name: t(BOT_NAMES[i - 1]![0], BOT_NAMES[i - 1]![1]), bot: true },
      ),
    [colors, mode, me, t],
  );

  const [game, setGame] = useState<LudoState>(() => newLudoGame(colors));
  const [phase, setPhase] = useState<'roll' | 'rolling' | 'pick' | 'moving' | 'over'>('roll');
  const [faces, setFaces] = useState(6);
  const [movable, setMovable] = useState<number[]>([]);
  /** Token being animated: shows this progress instead of the real one. */
  const [anim, setAnim] = useState<{ p: number; tk: number; pr: number } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const gameRef = useRef(game);
  gameRef.current = game;
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  const cur = game.turn;
  const curSeat = seats[cur]!;
  const isBot = curSeat.bot;

  const flash = (msg: string) => {
    setBanner(msg);
    window.setTimeout(() => alive.current && setBanner(null), 1200);
  };

  const move = async (tk: number) => {
    const g = gameRef.current;
    if (!movable.includes(tk) && phase === 'pick') return;
    setPhase('moving');
    setMovable([]);
    haptic('tap');
    const r = applyMove(g, tk);
    const from = g.players[g.turn]!.tokens[tk]!;
    if (from < 0) ludoSfx('out');
    for (let i = 0; i < r.path.length; i++) {
      if (!alive.current) return;
      setAnim({ p: g.turn, tk, pr: r.path[i]! });
      if (from >= 0) ludoSfx('step', i);
      await sleep(from < 0 ? 260 : 175);
    }
    setAnim(null);
    setGame(r.state);
    const to = r.path[r.path.length - 1]!;
    if (r.captured.length) {
      ludoSfx('capture');
      haptic('heavy');
      flash(t('Captured! Roll again', 'গুটি কেটেছেন! আবার চাল'));
    } else if (r.reachedHome) {
      ludoSfx('home');
      flash(t('Home! Roll again', 'ঘরে উঠেছে! আবার চাল'));
    } else {
      const idx = trackIndex(g.players[g.turn]!.color, to);
      if (idx !== null && LUDO_SAFE.has(idx) && from >= 0) ludoSfx('safe');
      if (r.extraTurn) flash(t('Six! Roll again', 'ছক্কা! আবার চাল'));
    }
    await sleep(r.captured.length ? 550 : 250);
    if (!alive.current) return;
    if (r.state.finished) {
      ludoSfx('win');
      setPhase('over');
      return;
    }
    if (!r.extraTurn) ludoSfx('turn');
    setPhase('roll');
  };

  const roll = async () => {
    if (phase !== 'roll') return;
    setPhase('rolling');
    ludoSfx('roll');
    haptic('tap');
    for (let i = 0; i < 8; i++) {
      setFaces(1 + Math.floor(Math.random() * 6));
      await sleep(55);
    }
    const buf = new Uint8Array(1);
    let dice = 0;
    while (!dice) {
      crypto.getRandomValues(buf);
      if (buf[0]! < 252) dice = (buf[0]! % 6) + 1; // fair 1–6
    }
    setFaces(dice);
    if (!alive.current) return;
    const r = applyRoll(gameRef.current, dice);
    setGame(r.state);
    if (dice === 6) ludoSfx('six');
    if (r.lost) {
      flash(t('Three sixes — turn lost', 'তিনবার ছক্কা — চাল বাতিল'));
      await sleep(900);
      setPhase('roll');
      return;
    }
    if (!r.moves.length) {
      await sleep(750);
      const s = { ...r.state, players: r.state.players.map((p) => ({ ...p, tokens: [...p.tokens] })) };
      nextTurn(s);
      setGame(s);
      ludoSfx('turn');
      setPhase('roll');
      return;
    }
    setMovable(r.moves);
    setPhase('pick');
    // Only one choice: it moves by itself (like Ludo King).
    const allSame = r.moves.every((m) => r.state.players[r.state.turn]!.tokens[m] === r.state.players[r.state.turn]!.tokens[r.moves[0]!]);
    if (r.moves.length === 1 || allSame) {
      await sleep(350);
      gameRef.current = r.state;
      void moveRef.current(r.moves[0]!);
    }
  };
  const moveRef = useRef(move);
  moveRef.current = move;
  const rollRef = useRef(roll);
  rollRef.current = roll;

  // Computer players roll and pick by themselves.
  useEffect(() => {
    if (!isBot) return;
    if (phase === 'roll') {
      const id = window.setTimeout(() => void rollRef.current(), 650);
      return () => window.clearTimeout(id);
    }
    if (phase === 'pick' && movable.length > 1) {
      const id = window.setTimeout(() => void moveRef.current(chooseAiMove(gameRef.current, movable, level)), 550);
      return () => window.clearTimeout(id);
    }
  }, [phase, isBot, movable, level, cur]);

  const restart = () => {
    setGame(newLudoGame(colors));
    setPhase('roll');
    setMovable([]);
    setFaces(6);
  };

  // Token positions (with small offsets when several share a square).
  const tokens = useMemo(() => {
    const list = game.players.flatMap((p, pi) =>
      p.tokens.map((pr0, tk) => {
        const pr = anim && anim.p === pi && anim.tk === tk ? anim.pr : pr0;
        const [x, y] = cellOf(p.color, pr, tk);
        return { pi, tk, color: p.color, pr, x, y, key: `${x.toFixed(2)},${y.toFixed(2)}` };
      }),
    );
    const groups = new Map<string, number>();
    const seen = new Map<string, number>();
    for (const tkn of list) if (tkn.pr >= 0) groups.set(tkn.key, (groups.get(tkn.key) ?? 0) + 1);
    return list.map((tkn) => {
      const count = tkn.pr >= 0 ? (groups.get(tkn.key) ?? 1) : 1;
      const i = seen.get(tkn.key) ?? 0;
      seen.set(tkn.key, i + 1);
      const off = count > 1 ? [[-0.2, -0.12], [0.2, -0.12], [-0.2, 0.18], [0.2, 0.18]][i % 4]! : [0, 0];
      return { ...tkn, x: tkn.x + off[0]!, y: tkn.y + off[1]!, small: count > 1 };
    });
  }, [game, anim]);

  const canRoll = phase === 'roll' && !isBot;
  const places = [...game.players.map((p, i) => ({ ...p, seat: seats[i]! }))].sort((a, b) => a.place - b.place);

  return (
    <div className="ludo-stage play">
      <header className="ludo-top">
        <button className="ludo-round" aria-label={t('Leave game', 'খেলা ছাড়ুন')} onClick={() => (phase === 'over' ? nav('/ludo') : setLeaving(true))}><Icon name="back" size={22} /></button>
        <b>{mode === 'ai' ? t(`Ludo · ${LEVELS[level][0]}`, `লুডু · ${LEVELS[level][1]}`) : t('Ludo · one phone', 'লুডু · এক ফোনে')}</b>
        <button className="ludo-round" aria-label={sound ? t('Sound off', 'সাউন্ড বন্ধ') : t('Sound on', 'সাউন্ড চালু')} onClick={() => setSettings({ sound: !sound })}><Icon name={sound ? 'volume' : 'mute'} size={20} /></button>
      </header>

      <div className="ludo-table">
        <div className="ludo-panels top">
          {(['tl', 'tr'] as const).map((corner) => panel(corner))}
        </div>
        <div className="ludo-board-wrap">
          <div className="ludo-board">
            <svg viewBox="0 0 15 15" className="ludo-svg"><BoardArt /></svg>
            {tokens.map((tk) => {
              const can = tk.pi === cur && phase === 'pick' && movable.includes(tk.tk) && !isBot;
              return (
                <button
                  key={`${tk.pi}-${tk.tk}`}
                  type="button"
                  className={`ludo-token${can ? ' can' : ''}${tk.small ? ' small' : ''}${tk.pr >= LUDO_FINISH ? ' done' : ''}${anim && anim.p === tk.pi && anim.tk === tk.tk ? ' hop' : ''}`}
                  style={{ left: `${(tk.x / 15) * 100}%`, top: `${(tk.y / 15) * 100}%`, ['--tc' as any]: LUDO_COLORS[tk.color], zIndex: can ? 30 : Math.round(tk.y * 2) }}
                  onClick={() => can && void move(tk.tk)}
                  disabled={!can}
                  aria-label={t('Move this token', 'এই গুটি চালুন')}
                >
                  <Pin />
                </button>
              );
            })}
            {banner && <div className="ludo-banner">{banner}</div>}
          </div>
        </div>
        <div className="ludo-panels bottom">
          {(['bl', 'br'] as const).map((corner) => panel(corner))}
        </div>
      </div>

      <p className="ludo-hint">
        {phase === 'over'
          ? ''
          : isBot
            ? t(`${curSeat.name} is playing…`, `${curSeat.name} খেলছে…`)
            : phase === 'roll'
              ? mode === 'local' ? t(`${curSeat.name}: tap your dice`, `${curSeat.name}: আপনার ছক্কায় চাপুন`) : t('Your turn — tap the dice', 'আপনার চাল — ছক্কায় চাপুন')
              : phase === 'pick'
                ? t('Tap a glowing token to move', 'যে গুটি জ্বলছে সেটায় চাপুন')
                : ' '}
      </p>

      <Modal open={leaving} onClose={() => setLeaving(false)} label={t('Leave game?', 'খেলা ছাড়বেন?')}>
        <h2>{t('Leave this game?', 'খেলা ছেড়ে যাবেন?')}</h2>
        <p>{t('The game will end.', 'খেলাটি শেষ হয়ে যাবে।')}</p>
        <div className="modal-actions">
          <button className="btn outline" onClick={() => setLeaving(false)}>{t('Keep playing', 'খেলতে থাকুন')}</button>
          <button className="btn danger" onClick={() => nav('/ludo')}>{t('Leave', 'ছেড়ে যান')}</button>
        </div>
      </Modal>

      {phase === 'over' && (
        <div className="ludo-over" role="dialog" aria-label={t('Game over', 'খেলা শেষ')}>
          <div className="lo-card">
            <span className="lo-trophy"><Icon name="trophy" size={46} /></span>
            <h2>{places[0]!.seat.bot ? t(`${places[0]!.seat.name} won`, `${places[0]!.seat.name} জিতেছে`) : mode === 'ai' ? t('You won!', 'আপনি জিতেছেন!') : t(`${places[0]!.seat.name} won!`, `${places[0]!.seat.name} জিতেছে!`)}</h2>
            <ol className="lo-list">
              {places.map((p) => (
                <li key={p.color}>
                  <span className="lo-place">{num(p.place, lang)}</span>
                  <i style={{ background: LUDO_COLORS[p.color] }} />
                  <b className="grow">{p.seat.name}</b>
                  {p.place === 1 && <Icon name="crown" size={18} />}
                </li>
              ))}
            </ol>
            <div className="lo-actions">
              <button className="btn primary" onClick={restart}><Icon name="refresh" /> {t('Play again', 'আবার খেলুন')}</button>
              <button className="btn outline" onClick={() => nav('/ludo')}>{t('Menu', 'মেনু')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  /** A player's panel (plain function, not a component, so it doesn't remount every render). */
  function panel(corner: (typeof CORNER)[number]) {
    const color = CORNER.indexOf(corner) as LudoColor;
    const pi = game.players.findIndex((p) => p.color === color);
    if (pi < 0) return <div key={corner} className="ludo-panel empty" />;
    const seat = seats[pi]!;
    const active = pi === cur && phase !== 'over';
    const home = game.players[pi]!.tokens.filter((x) => x >= LUDO_FINISH).length;
    return (
      <div key={corner} className={`ludo-panel ${corner}${active ? ' active' : ''}`} style={{ ['--pc' as any]: LUDO_COLORS[color] }}>
        <span className="lp-av">
          <Avatar name={seat.name} src={seat.avatar ?? null} size={40} bot={seat.bot} />
        </span>
        <span className="lp-info">
          <b className="ellipsis">{seat.name}</b>
          <small>{game.players[pi]!.place ? t(`#${game.players[pi]!.place}`, `${num(game.players[pi]!.place, lang)} নম্বর`) : t(`${home}/4 home`, `${num(home, lang)}/৪ ঘরে`)}</small>
        </span>
        <span className="lp-dice">
          {active ? <Dice value={faces} rolling={phase === 'rolling'} canRoll={canRoll} onRoll={() => void roll()} /> : <span className="lp-dice-off" />}
        </span>
      </div>
    );
  }
}

/** Glossy pin token. */
function Pin() {
  return (
    <svg viewBox="0 0 40 52" className="pin" aria-hidden>
      <ellipse cx="20" cy="47" rx="12" ry="4" fill="rgba(0,0,0,.28)" />
      <path d="M8 40 Q20 30 32 40 L30 45 Q20 49 10 45 Z" fill="#e2e8f0" stroke="#64748b" strokeWidth="1.2" />
      <path d="M14 38 L20 22 L26 38 Z" fill="#cbd5e1" stroke="#64748b" strokeWidth="1" />
      <circle cx="20" cy="17" r="13" fill="var(--tc)" stroke="rgba(0,0,0,.35)" strokeWidth="1.6" />
      <circle cx="15.5" cy="12.5" r="4.5" fill="rgba(255,255,255,.65)" />
      <circle cx="20" cy="17" r="6" fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="1.6" />
    </svg>
  );
}
