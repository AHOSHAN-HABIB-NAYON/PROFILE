import {
  applyMove,
  applyRoll,
  ludoColorsFor,
  moverOf,
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
  type LudoSnapshot,
  type LudoState,
  type PublicUser,
} from '@quizwar/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { QrCode } from '../components/Qr';
import { QrScanner } from '../components/QrScanner';
import { useConn } from '../lib/socket';
import { Sheet } from '../components/Sheet';
import { VoiceBar } from '../components/VoiceBar';
import { useConfig } from '../hooks/queries';
import { api } from '../lib/api';
import { ludoAct, ludoQueue, ludoUnqueue, onLudoMatched, onLudoSnap } from '../lib/ludoOnline';
import { sfx } from '../lib/sound';
import { IconTile } from '../components/Icon';
import { emit } from '../lib/socket';
import { toast } from '../lib/toast';
import { PUBLIC_WEB_URL, share } from '../lib/platform';
import { Avatar } from '../components/Avatar';
import { Confetti } from '../components/Confetti';
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
  return (
    <div className="ludo-stage">
      <header className="ludo-top">
        <button className="ludo-round" aria-label={t('Back', 'ফিরে যান')} onClick={() => nav(-1)}><Icon name="back" size={22} /></button>
        <b>{t('Ludo', 'লুডু')}</b>
        <span className="ludo-round ghost" />
      </header>
      <LudoHub />
    </div>
  );
}

type HubSheet = 'online' | 'friends' | 'computer' | 'local' | null;

/** Ludo home: logo + four big tiles (Online, Friends, Computer, Pass & Play). Also used on Battle. */
export function LudoHub() {
  const t = useT();
  const lang = useLang();
  const nav = useNavigate();
  const online = useConn((s) => s.online);
  const cfg = useConfig().data;
  const [sheet, setSheet] = useState<HubSheet>(null);
  const [mode, setMode] = useState<'1v1' | '2v2'>('1v1');
  const [room, setRoom] = useState<'2' | '4' | 'teams'>('2');
  const [code, setCode] = useState('');
  const [scan, setScan] = useState(false);
  const [busy, setBusy] = useState(false);
  const [players, setPlayers] = useState<2 | 4>(4);
  const [level, setLevel] = useState<0 | 1 | 2>(1);
  const [localN, setLocalN] = useState<2 | 3 | 4>(2);
  const onlineOff = cfg?.ludoEnabled === false;
  const open = (k: HubSheet) => {
    haptic('tap');
    ludoSfx('turn');
    if ((k === 'online' || k === 'friends') && onlineOff) return toast.info(t('Online Ludo is off right now', 'অনলাইন লুডু এখন বন্ধ আছে'), undefined, 'gamepad');
    setSheet(k);
  };
  const makeRoom = async () => {
    setBusy(true);
    try {
      const r = await emit('ludo:create', { size: room === '2' ? 2 : 4, teams: room === 'teams' });
      setSheet(null);
      nav(`/ludo/online/${r.snapshot.id}`);
    } catch (e: any) {
      toast.error(t('Could not make a room', 'রুম বানানো গেল না'), e?.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ludo-hub">
      <div className="lh-logo" aria-label="Ludo">
        <LudoLogo />
      </div>
      <div className="lh-grid">
        <button type="button" className="lh-tile" onClick={() => open('online')}>
          <span className="lt-art"><TileArt kind="online" /></span>
          <b>{t('Play online', 'অনলাইনে খেলুন')}</b>
          <small className="lt-live"><i /> {t(`${online} online`, `অনলাইনে ${num(online, lang)} জন`)}</small>
        </button>
        <button type="button" className="lh-tile" onClick={() => open('friends')}>
          <span className="lt-art"><TileArt kind="friends" /></span>
          <span className="lt-mic" aria-hidden><Icon name="mic" size={14} /></span>
          <b>{t('Play with friends', 'বন্ধুদের সাথে')}</b>
          <small>{t('Room · code · QR · voice', 'রুম · কোড · QR · ভয়েস')}</small>
        </button>
        <button type="button" className="lh-tile" onClick={() => open('computer')}>
          <span className="lt-art"><TileArt kind="computer" /></span>
          <b>{t('Computer', 'কম্পিউটার')}</b>
          <small>{t('No internet needed', 'নেট ছাড়াই')}</small>
        </button>
        <button type="button" className="lh-tile" onClick={() => open('local')}>
          <span className="lt-art"><TileArt kind="local" /></span>
          <b>{t('Pass & play', 'এক ফোনে খেলুন')}</b>
          <small>{t('2–4 players, one phone', '২–৪ জন, এক ফোনে')}</small>
        </button>
      </div>

      <Sheet open={sheet === 'online'} onClose={() => setSheet(null)} title={t('Play online', 'অনলাইনে খেলুন')} icon="globe">
        <div className="col">
          <p className="small muted">{t('We find real players for you. Win to earn coins and climb the Ludo board.', 'আপনার জন্য আসল প্লেয়ার খুঁজে দেওয়া হবে। জিতলে কয়েন, আর লুডুর র‍্যাংকে উপরে উঠবেন।')}</p>
          <div className="seg">
            <button aria-pressed={mode === '1v1'} onClick={() => setMode('1v1')}>{t('1 vs 1', '১ বনাম ১')}</button>
            <button aria-pressed={mode === '2v2'} onClick={() => setMode('2v2')}>{t('2 vs 2 (team)', '২ বনাম ২ (দল)')}</button>
          </div>
          <button className="btn primary block" onClick={() => (setSheet(null), nav(`/ludo/find?mode=${mode}`))}><Icon name="search" /> {t('Find players', 'প্লেয়ার খুঁজুন')}</button>
        </div>
      </Sheet>

      <Sheet open={sheet === 'friends'} onClose={() => setSheet(null)} title={t('Play with friends', 'বন্ধুদের সাথে')} icon="users">
        <div className="col">
          <b className="small">{t('Make a room', 'রুম বানান')}</b>
          <div className="seg">
            <button aria-pressed={room === '2'} onClick={() => setRoom('2')}>{t('2 players', '২ জন')}</button>
            <button aria-pressed={room === '4'} onClick={() => setRoom('4')}>{t('4 players', '৪ জন')}</button>
            <button aria-pressed={room === 'teams'} onClick={() => setRoom('teams')}>{t('2 vs 2', '২ বনাম ২')}</button>
          </div>
          <button className="btn primary block" disabled={busy} onClick={() => void makeRoom()}><Icon name="plus" /> {t('Make a room', 'রুম বানান')}</button>
          <div className="lh-or"><span>{t('or join a room', 'অথবা রুমে যোগ দিন')}</span></div>
          <form className="ludo-code" onSubmit={(e) => (e.preventDefault(), code.trim().length >= 4 && (setSheet(null), nav(`/ludo/room/${code.trim().toUpperCase()}`)))}>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={t('Room code', 'রুম কোড')} maxLength={8} aria-label={t('Room code', 'রুম কোড')} autoCapitalize="characters" />
            <button className="btn sm primary" type="submit" disabled={code.trim().length < 4}>{t('Join', 'যোগ দিন')}</button>
            <button className="btn sm soft" type="button" onClick={() => (haptic('tap'), setScan(true))} aria-label={t('Scan QR', 'QR স্ক্যান')}><Icon name="scan" /> {t('Scan', 'স্ক্যান')}</button>
          </form>
        </div>
      </Sheet>

      <Sheet open={sheet === 'computer'} onClose={() => setSheet(null)} title={t('Play the computer', 'কম্পিউটারের সাথে')} icon="bot">
        <div className="col">
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
          <button className="btn primary block" onClick={() => (setSheet(null), nav(`/ludo/play?mode=ai&n=${players}&lv=${level}`))}><Icon name="play" /> {t('Play now', 'খেলা শুরু')}</button>
        </div>
      </Sheet>

      <Sheet open={sheet === 'local'} onClose={() => setSheet(null)} title={t('Pass & play', 'এক ফোনে খেলুন')} icon="users">
        <div className="col">
          <p className="small muted">{t('Everyone plays on this phone — pass it on each turn.', 'সবাই এই ফোনেই খেলবে — চাল শেষে ফোন হাতবদল করুন।')}</p>
          <div className="lc-row">
            <span className="lc-label">{t('Players', 'প্লেয়ার')}</span>
            <div className="seg">
              {([2, 3, 4] as const).map((n) => <button key={n} aria-pressed={localN === n} onClick={() => setLocalN(n)}>{num(n, lang)}</button>)}
            </div>
          </div>
          <button className="btn primary block" onClick={() => (setSheet(null), nav(`/ludo/play?mode=local&n=${localN}`))}><Icon name="play" /> {t('Start', 'শুরু করুন')}</button>
        </div>
      </Sheet>

      <QrScanner open={scan} onClose={() => setScan(false)} onCode={(c) => (setScan(false), setSheet(null), nav(`/ludo/room/${c}`))} />
    </div>
  );
}

/** "LUDO" in four coloured balls with a crown, pawns and a dice. */
function LudoLogo() {
  const letters: [string, string][] = [['L', '#1e88e5'], ['U', '#e53935'], ['D', '#43a047'], ['O', '#fbc02d']];
  return (
    <svg viewBox="0 0 320 170" className="ludo-logo">
      <defs>
        <radialGradient id="ll-ball" cx="35%" cy="30%" r="70%"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#e2e8f0" /></radialGradient>
        <linearGradient id="ll-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fde68a" /><stop offset="1" stopColor="#d97706" /></linearGradient>
      </defs>
      {/* crown */}
      <path d="M44 34 l12 -22 l12 16 l12 -20 l12 20 l12 -16 l12 22 z" fill="url(#ll-gold)" stroke="#92400e" strokeWidth="2" transform="translate(-6 0)" />
      <rect x="38" y="33" width="72" height="8" rx="3" fill="url(#ll-gold)" stroke="#92400e" strokeWidth="2" />
      {letters.map(([ch, c], i) => (
        <g key={ch} transform={`translate(${40 + i * 66} 70)`}>
          <circle r="29" fill="url(#ll-ball)" stroke={c} strokeWidth="6" />
          <text textAnchor="middle" dy="13" fontSize="38" fontWeight="900" fill={c} fontFamily="'Plus Jakarta Sans Variable', sans-serif">{ch}</text>
        </g>
      ))}
      {/* board, pawns and dice */}
      <g transform="translate(95 108)">
        <path d="M0 22 L65 0 L130 22 L65 46 Z" fill="#fff" stroke="#cbd5e1" strokeWidth="2" />
        <path d="M18 22 L65 6 L65 22 Z" fill="#e53935" opacity=".85" /><path d="M65 6 L112 22 L65 22 Z" fill="#43a047" opacity=".85" />
        <path d="M18 22 L65 40 L65 22 Z" fill="#1e88e5" opacity=".85" /><path d="M65 22 L112 22 L65 40 Z" fill="#fbc02d" opacity=".85" />
        <rect x="52" y="-8" width="26" height="26" rx="6" fill="#fff" stroke="#94a3b8" strokeWidth="2" transform="rotate(12 65 5)" />
        <circle cx="60" cy="0" r="2.6" fill="#1e293b" /><circle cx="70" cy="9" r="2.6" fill="#1e293b" /><circle cx="65" cy="4.5" r="2.6" fill="#1e293b" />
      </g>
      {([[70, '#1e88e5'], [250, '#fbc02d']] as [number, string][]).map(([x, c]) => (
        <g key={x} transform={`translate(${x} 118)`}>
          <ellipse cx="0" cy="40" rx="18" ry="5" fill="rgba(0,0,0,.25)" />
          <path d="M-15 38 Q0 -2 15 38 Z" fill={c} stroke="rgba(0,0,0,.25)" strokeWidth="1.5" />
          <circle cx="0" cy="4" r="11" fill={c} stroke="rgba(0,0,0,.25)" strokeWidth="1.5" />
          <circle cx="-4" cy="0" r="3.5" fill="rgba(255,255,255,.6)" />
        </g>
      ))}
    </svg>
  );
}

/** Pictures on the four menu tiles. */
function TileArt({ kind }: { kind: 'online' | 'friends' | 'computer' | 'local' }) {
  const phone = (x: number) => <rect x={x} y="10" width="26" height="40" rx="5" fill="#facc15" stroke="#a16207" strokeWidth="2" />;
  return (
    <svg viewBox="0 0 120 60">
      {kind === 'online' && (
        <>
          {phone(6)}{phone(88)}
          <path d="M36 30 Q60 14 84 30" fill="none" stroke="#fde047" strokeWidth="2" strokeDasharray="2 4" />
          <circle cx="60" cy="30" r="13" fill="#38bdf8" stroke="#fff" strokeWidth="2" />
          <path d="M51 26 q5 -3 8 1 t9 0 M52 34 q4 3 8 0 t8 1" stroke="#16a34a" strokeWidth="3" fill="none" strokeLinecap="round" />
        </>
      )}
      {kind === 'friends' && (
        <>
          {phone(6)}{phone(88)}
          <path d="M36 30 Q60 14 84 30" fill="none" stroke="#fde047" strokeWidth="2" strokeDasharray="2 4" />
          {[50, 70].map((x) => <path key={x} d={`M${x} 38 l-9 -9 a5 5 0 0 1 9 -6 a5 5 0 0 1 9 6 z`} fill="#ef4444" stroke="#fff" strokeWidth="1.5" />)}
        </>
      )}
      {kind === 'computer' && (
        <>
          <rect x="44" y="8" width="32" height="44" rx="6" fill="#facc15" stroke="#a16207" strokeWidth="2" />
          <rect x="48" y="16" width="24" height="26" rx="3" fill="#1e3a8a" />
          <text x="60" y="35" textAnchor="middle" fontSize="13" fontWeight="900" fill="#fff" fontFamily="sans-serif">VS</text>
        </>
      )}
      {kind === 'local' && (
        <>
          <circle cx="30" cy="20" r="8" fill="#facc15" /><path d="M16 50 q14 -26 28 0 z" fill="#facc15" />
          <circle cx="90" cy="20" r="8" fill="#facc15" /><path d="M76 50 q14 -26 28 0 z" fill="#facc15" />
          <path d="M48 44 L60 38 L72 44 L60 50 Z" fill="#fde047" stroke="#a16207" strokeWidth="1.5" />
        </>
      )}
    </svg>
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
  // Phone Back button: ask before leaving (game over → straight to the menu).
  const overRef = useRef(false);
  overRef.current = phase === 'over';
  useEffect(() => {
    const on = () => (overRef.current ? nav('/ludo') : setLeaving(true));
    window.addEventListener('qw:leave-ludo', on);
    return () => window.removeEventListener('qw:leave-ludo', on);
  }, [nav]);

  const cur = game.turn;
  const curSeat = seats[cur]!;
  const isBot = curSeat.bot;

  const flash = (msg: string) => {
    setBanner(msg);
    window.setTimeout(() => alive.current && setBanner(null), 1200);
  };
  const [cheer, setCheer] = useState<{ color: LudoColor; k: number } | null>(null);
  const cheerFor = (color: LudoColor) => {
    const k = Date.now();
    setCheer({ color, k });
    haptic('success');
    window.setTimeout(() => alive.current && setCheer((c) => (c?.k === k ? null : c)), 1700);
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
      cheerFor(g.players[g.turn]!.color);
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
            {cheer && <HomeCheer key={cheer.k} color={cheer.color} />}
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
        <LudoOverScreen
          rows={game.players.map((p, i) => ({ name: seats[i]!.name, avatar: seats[i]!.avatar ?? null, color: p.color, place: p.place, home: p.tokens.filter((x) => x >= LUDO_FINISH).length, isMe: mode === 'ai' && i === 0, isBot: seats[i]!.bot, uid: i === 0 && mode === 'ai' ? (me?.uid ?? null) : null, team: null }))}
          won={mode === 'ai' ? game.players[0]!.place === 1 : true}
          modeText={mode === 'ai' ? t(`vs computer · ${LEVELS[level][0]}`, `কম্পিউটারের সাথে · ${LEVELS[level][1]}`) : t('one phone', 'এক ফোনে')}
          coins={0}
          actions={
            <>
              <button className="btn primary" onClick={restart}><Icon name="refresh" /> {t('Play again', 'আবার খেলুন')}</button>
              <button className="btn outline" onClick={() => nav('/ludo')}>{t('Menu', 'মেনু')}</button>
            </>
          }
        />
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

/* ------------------------------------------------------------------ */
/*  Online                                                            */
/* ------------------------------------------------------------------ */

const LUDO_TIPS: [string, string][] = [
  ['A six brings a token out and gives another roll.', 'ছক্কা উঠলে গুটি বের হয়, আর আবার চাল পাওয়া যায়।'],
  ['Star squares are safe — nobody can capture you there.', 'তারা-চিহ্নের ঘর নিরাপদ — সেখানে কেউ কাটতে পারে না।'],
  ['Two of your tokens on one square make a block.', 'এক ঘরে নিজের দুই গুটি থাকলে সেগুলো কাটা যায় না।'],
  ['Capture a token to get an extra roll!', 'গুটি কাটলে একটি বাড়তি চাল পাবেন!'],
];

/** Full-screen "Finding players…" (like quiz matchmaking). Back = cancel and return. */
export function LudoFind() {
  const t = useT();
  const lang = useLang();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const mode = params.get('mode') === '2v2' ? '2v2' : '1v1';
  const user = useAuth((s) => s.user)!;
  const conn = useConn((s) => s.status);
  const [secs, setSecs] = useState(0);
  const [tip, setTip] = useState(0);
  const [offer, setOffer] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const matched = useRef(false);

  useEffect(() => {
    onLudoMatched((gameId) => {
      matched.current = true;
      sfx('start');
      haptic('success');
      nav(`/ludo/online/${gameId}`, { replace: true });
    });
    const i = window.setInterval(() => setSecs((x) => x + 1), 1000);
    const j = window.setInterval(() => setTip((x) => (x + 1) % LUDO_TIPS.length), 4500);
    return () => {
      onLudoMatched(null);
      window.clearInterval(i);
      window.clearInterval(j);
      if (!matched.current) ludoUnqueue();
    };
  }, [nav]);

  useEffect(() => {
    if (conn !== 'connected' || started.current) return;
    started.current = true;
    sfx('tap');
    void ludoQueue(mode).then((err) => err && setError(err));
  }, [conn, mode]);

  // Phone Back = cancel.
  useEffect(() => {
    const on = () => cancel();
    window.addEventListener('qw:leave-ludo', on);
    return () => window.removeEventListener('qw:leave-ludo', on);
  });

  const cancel = () => {
    haptic('tap');
    ludoUnqueue();
    if (history.length > 1) nav(-1);
    else nav('/', { replace: true });
  };
  const playComputer = () => {
    ludoUnqueue();
    nav(`/ludo/play?mode=ai&n=${mode === '1v1' ? 2 : 4}&lv=1`, { replace: true });
  };
  const mm = `${num(Math.floor(secs / 60), lang)}:${num(String(secs % 60).padStart(2, '0'), lang)}`;
  return (
    <div className="stage-dark ludo-find">
      <div className="mm-stage">
        <span className="chip on-dark"><Icon name="gamepad" /> {t('Ludo', 'লুডু')} · {mode === '1v1' ? t('1 vs 1', '১ বনাম ১') : t('2 vs 2', '২ বনাম ২')}</span>
        <div className="radar" aria-hidden>
          <span className="sweep" />
          <span className="orbit o1 lf-pawn" style={{ ['--tc' as any]: LUDO_COLORS[0] }}><Pin /></span>
          <span className="orbit o2 lf-pawn" style={{ ['--tc' as any]: LUDO_COLORS[1] }}><Pin /></span>
          <span className="orbit o3 lf-pawn" style={{ ['--tc' as any]: LUDO_COLORS[2] }}><Pin /></span>
          <Avatar name={user.username} src={user.avatarThumbUrl ?? user.avatarUrl} size={92} frame={user.frame} />
        </div>
        <h1 aria-live="polite">{t('Finding players…', 'প্লেয়ার খোঁজা হচ্ছে…')}</h1>
        <p className="dim row gap-sm" style={{ justifyContent: 'center' }}>
          <Icon name="timer" size={16} /> <span className="num">{mm}</span>
        </p>
        {error && (
          <div className="mm-ai card">
            <p className="small" style={{ margin: 0 }}><Icon name="alert-circle" size={16} /> {error}</p>
            <button className="btn primary mt" onClick={() => (setError(null), setSecs(0), void ludoQueue(mode).then((err) => err && setError(err)))}><Icon name="refresh" /> {t('Try again', 'আবার চেষ্টা করুন')}</button>
          </div>
        )}
        {secs >= 30 && offer && !error && (
          <div className="mm-ai card">
            <div className="row">
              <IconTile name="bot" tone="cyan" size={44} anim="float" />
              <div className="grow" style={{ textAlign: 'left' }}>
                <b>{t('No players yet — play the computer?', 'এখনো কাউকে পাওয়া যায়নি — কম্পিউটারের সাথে খেলবেন?')}</b>
                <p className="xs muted">{t('You can come back and search again any time.', 'যেকোনো সময় আবার খুঁজতে পারবেন।')}</p>
              </div>
            </div>
            <div className="row mt">
              <button className="btn ghost" onClick={() => setOffer(false)}>{t('Keep waiting', 'অপেক্ষা করি')}</button>
              <button className="btn accent grow" onClick={playComputer}><Icon name="bot" /> {t('Play computer', 'কম্পিউটারের সাথে')}</button>
            </div>
          </div>
        )}
        <p className="mm-tip" key={tip}><Icon name="bulb" size={16} /> {t(...LUDO_TIPS[tip]!)}</p>
        <button className="btn outline-dark" onClick={cancel}><Icon name="close" /> {t('Cancel', 'বাতিল করুন')}</button>
      </div>
    </div>
  );
}

/** /ludo/room/:code → join, then open the room. */
export function LudoJoin() {
  const { code = '' } = useParams();
  const nav = useNavigate();
  const t = useT();
  useEffect(() => {
    let off = false;
    const go = async () => {
      for (let i = 0; i < 10 && !off; i++) {
        try {
          const r = await emit('ludo:join', { code });
          if (!off) nav(`/ludo/online/${r.snapshot.id}`, { replace: true });
          return;
        } catch (e: any) {
          if (e?.code !== 'network') {
            toast.error(t('Could not join', 'যোগ দেওয়া গেল না'), e?.message);
            if (!off) nav('/ludo', { replace: true });
            return;
          }
          await sleep(800);
        }
      }
    };
    void go();
    return () => void (off = true);
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="ludo-stage" style={{ display: 'grid', placeItems: 'center' }}>
      <span className="spinner" />
    </div>
  );
}

/** Who acts this turn: the player, their partner (2 vs 2) or the computer (null). */
function controllerOf(s: LudoSnapshot): number | null {
  if (!s.state) return null;
  const seat = s.seats[s.state.turn];
  if (!seat) return null;
  if (!seat.bot && !seat.left) return seat.userId;
  if (s.teams) {
    const partner = s.seats.find((x, i) => i !== s.state!.turn && x.team === seat.team && !x.bot && !x.left);
    if (partner) return partner.userId;
  }
  return null;
}

/** Token positions with small offsets when several share a square. */
function layoutTokens(state: LudoState, anim: { p: number; tk: number; pr: number } | null) {
  const list = state.players.flatMap((p, pi) =>
    p.tokens.map((pr0, tk) => {
      const pr = anim && anim.p === pi && anim.tk === tk ? anim.pr : pr0;
      const [x, y] = cellOf(p.color, pr, tk);
      return { pi, tk, color: p.color, pr, x, y, key: `${x.toFixed(2)},${y.toFixed(2)}` };
    }),
  );
  const groups = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const k of list) if (k.pr >= 0) groups.set(k.key, (groups.get(k.key) ?? 0) + 1);
  return list.map((k) => {
    const count = k.pr >= 0 ? (groups.get(k.key) ?? 1) : 1;
    const i = seen.get(k.key) ?? 0;
    seen.set(k.key, i + 1);
    const off = count > 1 ? [[-0.2, -0.12], [0.2, -0.12], [-0.2, 0.18], [0.2, 0.18]][i % 4]! : [0, 0];
    return { ...k, x: k.x + off[0]!, y: k.y + off[1]!, small: count > 1 };
  });
}

function OnlinePanel({ corner, color, name, avatar, bot, active, sub, dice, pct, you }: { corner: string; color: LudoColor; name: string; avatar: string | null; bot: boolean; active: boolean; sub: ReactNode; dice: ReactNode; pct: number | null; you: boolean }) {
  return (
    <div className={`ludo-panel ${corner}${active ? ' active' : ''}${you ? ' you' : ''}`} style={{ ['--pc' as any]: LUDO_COLORS[color] }}>
      <span className="lp-av">
        <Avatar name={name} src={avatar} size={40} bot={bot} />
        {pct !== null && (
          <svg className="lp-timer" viewBox="0 0 44 44" aria-hidden>
            <circle cx="22" cy="22" r="20" pathLength="100" strokeDasharray={`${pct} 100`} />
          </svg>
        )}
      </span>
      <span className="lp-info">
        <b className="ellipsis">{name}</b>
        <small>{sub}</small>
      </span>
      <span className="lp-dice">{dice}</span>
    </div>
  );
}

/** Online game: room lobby, live board and results. */
export function LudoOnline() {
  const { id = '' } = useParams();
  const t = useT();
  const lang = useLang();
  const nav = useNavigate();
  const me = useAuth((s) => s.user)!;
  const sound = useSettings((s) => s.sound);
  const setSettings = useSettings((s) => s.set);
  const cfg = useConfig().data;
  const [snap, setSnap] = useState<LudoSnapshot | null>(null);
  const [view, setView] = useState<LudoState | null>(null);
  const [anim, setAnim] = useState<{ p: number; tk: number; pr: number } | null>(null);
  const [rolling, setRolling] = useState(false);
  const [faces, setFaces] = useState(6);
  const [banner, setBanner] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [qr, setQr] = useState(false);
  const [gone, setGone] = useState(false);
  const [, tick] = useState(0);
  const queue = useRef<LudoSnapshot[]>([]);
  const busy = useRef(false);
  const shown = useRef(0);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);
  const finishedRef = useRef(false);
  useEffect(() => {
    const on = () => (finishedRef.current ? nav('/ludo') : setLeaving(true));
    window.addEventListener('qw:leave-ludo', on);
    return () => window.removeEventListener('qw:leave-ludo', on);
  }, [nav]);

  const flash = (msg: string) => {
    setBanner(msg);
    window.setTimeout(() => alive.current && setBanner(null), 1200);
  };
  const [cheer, setCheer] = useState<{ color: LudoColor; k: number } | null>(null);
  const cheerFor = (color: LudoColor) => {
    const k = Date.now();
    setCheer({ color, k });
    haptic('success');
    window.setTimeout(() => alive.current && setCheer((c) => (c?.k === k ? null : c)), 1700);
  };

  /** Show snapshots one by one: dice spin, tokens hop. */
  const process = async () => {
    if (busy.current) return;
    busy.current = true;
    while (queue.current.length && alive.current) {
      const s = queue.current.shift()!;
      if (s.seq <= shown.current) continue;
      const fresh = s.seq === shown.current + 1 && shown.current > 0;
      const L = s.last;
      if (fresh && s.status === 'playing' && L?.type === 'roll') {
        setRolling(true);
        ludoSfx('roll');
        for (let i = 0; i < 7; i++) {
          setFaces(1 + Math.floor(Math.random() * 6));
          await sleep(55);
        }
        setFaces(L.dice);
        setRolling(false);
        if (L.dice === 6) ludoSfx('six');
        if (L.lost) flash(t('Three sixes — turn lost', 'তিনবার ছক্কা — চাল বাতিল'));
      } else if (fresh && L?.type === 'move' && s.state) {
        const from = L.path[0] === 0 && L.path.length === 1;
        if (from) ludoSfx('out');
        for (let i = 0; i < L.path.length; i++) {
          setAnim({ p: L.mover, tk: L.token, pr: L.path[i]! });
          if (!from) ludoSfx('step', i);
          await sleep(from ? 260 : 175);
        }
        setAnim(null);
        if (L.captured.length) {
          ludoSfx('capture');
          haptic('heavy');
          flash(t('Captured!', 'গুটি কাটা পড়েছে!'));
        } else if (L.home) {
          ludoSfx('home');
          cheerFor(s.state.players[L.mover]!.color);
        } else if (L.extra) flash(t('Six! Roll again', 'ছক্কা! আবার চাল'));
      } else if (fresh && L?.type === 'pass') ludoSfx('turn');
      if (s.status === 'finished' && !s.state && shown.current > 0) setGone(true);
      setSnap(s);
      if (s.state) setView(s.state);
      if (fresh && s.status === 'finished' && s.state?.finished) ludoSfx('win');
      shown.current = s.seq;
    }
    busy.current = false;
  };

  useEffect(() => {
    const offSnap = onLudoSnap((s) => {
      if (s.id !== id) return;
      queue.current.push(s);
      void process();
    });
    let stop = false;
    const load = async () => {
      for (let i = 0; i < 10 && !stop; i++) {
        try {
          const r = await emit('ludo:resume', { gameId: id });
          if (stop) return;
          if (r.snapshot.seq > shown.current) {
            shown.current = r.snapshot.seq;
            setSnap(r.snapshot);
            setView(r.snapshot.state);
            if (r.snapshot.last?.type === 'roll') setFaces(r.snapshot.last.dice);
          }
          return;
        } catch (e: any) {
          if (e?.code !== 'network' && e?.code !== 'timeout') {
            setGone(true);
            return;
          }
          await sleep(900);
        }
      }
    };
    void load();
    const i = window.setInterval(() => tick((n) => n + 1), 500);
    return () => {
      stop = true;
      offSnap();
      window.clearInterval(i);
    };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (gone)
    return (
      <div className="ludo-stage" style={{ display: 'grid', placeItems: 'center' }}>
        <div className="lo-card">
          <h2>{t('This game is over', 'খেলাটি শেষ হয়ে গেছে')}</h2>
          <button className="btn primary" onClick={() => nav('/ludo', { replace: true })}>{t('Ludo menu', 'লুডু মেনু')}</button>
        </div>
      </div>
    );
  if (!snap)
    return (
      <div className="ludo-stage" style={{ display: 'grid', placeItems: 'center' }}>
        <span className="spinner" />
      </div>
    );

  const mySeatIdx = snap.seats.findIndex((s) => s.userId === me.id);
  const mySeat = snap.seats[mySeatIdx];
  const isHost = snap.hostId === me.id;
  const others = snap.seats.filter((s) => !s.bot && s.userId !== me.id && !s.left);
  const voicePlayers = others.map((s) => ({ userId: s.userId, name: s.name, avatar: s.avatar, ...(snap.teams && mySeat ? { side: s.team === mySeat.team ? ('mine' as const) : ('opp' as const) } : {}) }));
  const leave = () => {
    void ludoAct('ludo:leave', snap.id);
    nav('/ludo', { replace: true });
  };

  /* ------------------------------ Lobby ------------------------------ */
  if (snap.status === 'lobby') {
    const colors = ludoColorsFor(snap.size);
    const link = `${PUBLIC_WEB_URL.replace(/\/$/, '')}/ludo/room/${snap.code}`;
    const doShare = () =>
      void share({ title: t('Play Ludo with me', 'আমার সাথে লুডু খেলো'), text: t(`Join my QUIZ WAR Ludo room! Code: ${snap.code}`, `আমার QUIZ WAR লুডু রুমে আসো! কোড: ${snap.code}`), url: link }).then((r) => r === 'copied' && toast.success(t('Link copied', 'লিংক কপি হয়েছে'), undefined, 'copy'));
    return (
      <div className="ludo-stage">
        <header className="ludo-top">
          <button className="ludo-round" aria-label={t('Leave room', 'রুম ছাড়ুন')} onClick={() => setLeaving(true)}><Icon name="back" size={22} /></button>
          <b>{snap.teams ? t('Ludo room · 2 vs 2', 'লুডু রুম · ২ বনাম ২') : t(`Ludo room · ${snap.size} players`, `লুডু রুম · ${num(snap.size, lang)} জন`)}</b>
          <button className="ludo-round" aria-label={t('QR code', 'QR কোড')} onClick={() => setQr(true)}><Icon name="qr" size={20} /></button>
        </header>

        <section className="lr-code">
          <small>{t('Room code', 'রুম কোড')}</small>
          <button type="button" className="lr-code-val" onClick={() => void navigator.clipboard?.writeText(snap.code ?? '').then(() => toast.success(t('Code copied', 'কোড কপি হয়েছে'), snap.code ?? '', 'copy'))}>
            {snap.code} <Icon name="copy" size={18} />
          </button>
          <div className="lr-code-actions">
            <button className="btn sm white" onClick={doShare}><Icon name="share" /> {t('Share', 'শেয়ার')}</button>
            <button className="btn sm white" onClick={() => setInviteOpen(true)}><Icon name="user-add" /> {t('Invite friends', 'বন্ধু ডাকুন')}</button>
          </div>
        </section>

        <div className={`lr-seats n${snap.size}`}>
          {colors.map((c, i) => {
            const seat = snap.seats[i];
            return (
              <div key={i} className={`lr-seat${seat ? '' : ' empty'}`} style={{ ['--pc' as any]: LUDO_COLORS[c] }}>
                {snap.teams && <span className="lr-team">{t(`Team ${(i % 2) + 1}`, `দল ${num((i % 2) + 1, lang)}`)}</span>}
                {seat ? (
                  <>
                    <Avatar name={seat.name} src={seat.avatar} size={56} />
                    <b className="ellipsis">{seat.name}{seat.userId === snap.hostId && <Icon name="crown" size={14} className="lr-crown" />}</b>
                    <small>{seat.userId === me.id ? t('You', 'আপনি') : seat.connected ? t('Ready', 'প্রস্তুত') : t('Offline', 'অফলাইন')}</small>
                  </>
                ) : (
                  <button type="button" className="lr-add" onClick={() => setInviteOpen(true)}>
                    <span><Icon name="user-plus" size={22} /></span>
                    <small>{t('Invite', 'ডাকুন')}</small>
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="lr-note">{snap.seats.length < snap.size ? t(`Waiting for players: ${snap.seats.length}/${snap.size} — the game starts when the room is full.`, `প্লেয়ারের অপেক্ষা: ${num(snap.seats.length, lang)}/${num(snap.size, lang)} — রুম পূর্ণ হলে খেলা শুরু হবে।`) : t('Everyone is here!', 'সবাই চলে এসেছে!')}</p>

        {others.length > 0 && <VoiceBar className="dark" roomId={snap.id} players={voicePlayers} />}

        <div className="lr-actions">
          {isHost ? (
            <button className="btn primary block" disabled={snap.seats.length < snap.size} onClick={() => (haptic('tap'), void ludoAct('ludo:start', snap.id))}><Icon name="play" /> {snap.seats.length < snap.size ? t('Waiting for players…', 'প্লেয়ারের অপেক্ষায়…') : t('Start game', 'খেলা শুরু করুন')}</button>
          ) : (
            <p className="lr-wait"><span className="spinner" /> {t('Waiting for the host to start…', 'হোস্ট শুরু করার অপেক্ষায়…')}</p>
          )}
          <button className="btn outline-dark sm" onClick={() => setLeaving(true)}><Icon name="door" /> {t('Leave', 'চলে যান')}</button>
        </div>

        <InviteSheet open={inviteOpen} onClose={() => setInviteOpen(false)} gameId={snap.id} inRoom={snap.seats.map((s) => s.userId)} />
        <Sheet open={qr} onClose={() => setQr(false)} title={t('Scan to join', 'স্ক্যান করে যোগ দিন')} icon="qr">
          <div style={{ display: 'grid', placeItems: 'center', padding: 12 }}><QrCode value={link} /></div>
        </Sheet>
        <LeaveModal open={leaving} onClose={() => setLeaving(false)} onLeave={leave} lobby />
      </div>
    );
  }

  /* ------------------------------ Board ------------------------------ */
  const state = view ?? snap.state!;
  const synced = shown.current === snap.seq && !busy.current && !anim;
  const ctrl = controllerOf(snap);
  const myTurn = snap.status === 'playing' && ctrl === me.id && synced;
  const canRoll = myTurn && state.dice === 0;
  const last = snap.last;
  const movable = myTurn && state.dice > 0 && last?.type === 'roll' ? last.moves : [];
  const mover = moverOf(state);
  const tokens = layoutTokens(state, anim);
  const pctLeft = snap.deadline ? Math.max(0, Math.min(100, ((snap.deadline - Date.now()) / (snap.turnSeconds * 1000)) * 100)) : null;
  const curSeat = snap.seats[state.turn];
  const finished = snap.status === 'finished' && !!snap.state;
  finishedRef.current = finished;
  const won = !!mySeat && (snap.state?.players[mySeatIdx]?.place ?? 0) === 1;
  const humanGame = snap.seats.filter((s) => !s.bot).length > 1;

  const panel = (corner: (typeof CORNER)[number]) => {
    const color = CORNER.indexOf(corner) as LudoColor;
    const pi = snap.seats.findIndex((s) => s.color === color);
    if (pi < 0) return <div key={corner} className="ludo-panel empty" />;
    const seat = snap.seats[pi]!;
    const active = pi === state.turn && snap.status === 'playing';
    const home = state.players[pi]!.tokens.filter((x) => x >= LUDO_FINISH).length;
    const sub = seat.left
      ? t('Left · computer plays', 'চলে গেছে · কম্পিউটার খেলছে')
      : !seat.bot && !seat.connected
        ? t('Offline', 'অফলাইন')
        : snap.teams
          ? t(`Team ${(seat.team ?? 0) + 1} · ${home}/4`, `দল ${num((seat.team ?? 0) + 1, lang)} · ${num(home, lang)}/৪`)
          : t(`${home}/4 home`, `${num(home, lang)}/৪ ঘরে`);
    return (
      <OnlinePanel
        key={corner}
        corner={corner}
        color={color}
        name={seat.userId === me.id ? t('You', 'আপনি') : seat.name}
        avatar={seat.avatar}
        bot={seat.bot}
        active={active}
        you={seat.userId === me.id}
        sub={sub}
        pct={active && pctLeft !== null ? pctLeft : null}
        dice={active ? <Dice value={faces} rolling={rolling} canRoll={canRoll} onRoll={() => (haptic('tap'), void ludoAct('ludo:roll', snap.id))} /> : <span className="lp-dice-off" />}
      />
    );
  };

  return (
    <div className="ludo-stage play">
      <header className="ludo-top">
        <button className="ludo-round" aria-label={t('Leave game', 'খেলা ছাড়ুন')} onClick={() => (finished ? nav('/ludo') : setLeaving(true))}><Icon name="back" size={22} /></button>
        <b>{snap.teams ? t('Ludo · 2 vs 2', 'লুডু · ২ বনাম ২') : snap.kind === 'quick' ? t('Ludo · online', 'লুডু · অনলাইন') : t('Ludo · room', 'লুডু · রুম')}</b>
        <button className="ludo-round" aria-label={sound ? t('Sound off', 'সাউন্ড বন্ধ') : t('Sound on', 'সাউন্ড চালু')} onClick={() => setSettings({ sound: !sound })}><Icon name={sound ? 'volume' : 'mute'} size={20} /></button>
      </header>

      <div className="ludo-table">
        <div className="ludo-panels top">{(['tl', 'tr'] as const).map(panel)}</div>
        <div className="ludo-board-wrap">
          <div className="ludo-board">
            <svg viewBox="0 0 15 15" className="ludo-svg"><BoardArt /></svg>
            {tokens.map((tk) => {
              const can = tk.pi === mover && movable.includes(tk.tk);
              return (
                <button
                  key={`${tk.pi}-${tk.tk}`}
                  type="button"
                  className={`ludo-token${can ? ' can' : ''}${tk.small ? ' small' : ''}${tk.pr >= LUDO_FINISH ? ' done' : ''}${anim && anim.p === tk.pi && anim.tk === tk.tk ? ' hop' : ''}`}
                  style={{ left: `${(tk.x / 15) * 100}%`, top: `${(tk.y / 15) * 100}%`, ['--tc' as any]: LUDO_COLORS[tk.color], zIndex: can ? 30 : Math.round(tk.y * 2) }}
                  onClick={() => can && (haptic('tap'), void emit('ludo:move', { gameId: snap.id, token: tk.tk }).catch(() => undefined))}
                  disabled={!can}
                  aria-label={t('Move this token', 'এই গুটি চালুন')}
                >
                  <Pin />
                </button>
              );
            })}
            {banner && <div className="ludo-banner">{banner}</div>}
            {cheer && <HomeCheer key={cheer.k} color={cheer.color} />}
          </div>
        </div>
        <div className="ludo-panels bottom">{(['bl', 'br'] as const).map(panel)}</div>
      </div>

      <p className="ludo-hint">
        {finished
          ? ' '
          : myTurn
            ? canRoll
              ? t('Your turn — tap the dice', 'আপনার চাল — ছক্কায় চাপুন')
              : movable.length
                ? t('Tap a glowing token', 'যে গুটি জ্বলছে সেটায় চাপুন')
                : ' '
            : curSeat
              ? t(`${curSeat.name} is playing…`, `${curSeat.name} খেলছে…`)
              : ' '}
      </p>

      {others.length > 0 && !finished && <VoiceBar className="dark" roomId={snap.id} players={voicePlayers} autoJoin={snap.kind === 'room'} />}

      <LeaveModal open={leaving} onClose={() => setLeaving(false)} onLeave={leave} quick={snap.size === 2 && !snap.teams} />

      {finished && (
        <LudoOverScreen
          rows={snap.seats.map((s, i) => ({ name: s.name, avatar: s.avatar, color: s.color, place: snap.state!.players[i]!.place, home: snap.state!.players[i]!.tokens.filter((x) => x >= LUDO_FINISH).length, isMe: s.userId === me.id, isBot: s.bot, uid: s.userId === me.id ? me.uid : null, team: snap.teams ? s.team : null }))}
          won={won}
          modeText={snap.teams ? t('2 vs 2', '২ বনাম ২') : snap.size === 2 ? t('1 vs 1', '১ বনাম ১') : t('4 players', '৪ জন')}
          coins={humanGame ? (cfg?.ludoWinCoins ?? 0) : 0}
          actions={
            <>
              {snap.kind === 'room' ? (
                isHost ? (
                  <button className="btn primary" onClick={() => void ludoAct('ludo:rematch', snap.id)}><Icon name="refresh" /> {t('Play again', 'আবার খেলুন')}</button>
                ) : (
                  <span className="small muted">{t('The host can start again', 'হোস্ট আবার শুরু করতে পারবে')}</span>
                )
              ) : (
                <button className="btn primary" onClick={() => (void ludoAct('ludo:leave', snap.id), nav(`/ludo/find?mode=${snap.teams ? '2v2' : '1v1'}`, { replace: true }))}><Icon name="search" /> {t('Play again', 'আবার খেলুন')}</button>
              )}
              <button className="btn outline" onClick={leave}>{t('Menu', 'মেনু')}</button>
            </>
          }
        />
      )}
    </div>
  );
}

function LeaveModal({ open, onClose, onLeave, lobby, quick }: { open: boolean; onClose: () => void; onLeave: () => void; lobby?: boolean; quick?: boolean }) {
  const t = useT();
  return (
    <Modal open={open} onClose={onClose} label={t('Leave?', 'ছেড়ে যাবেন?')}>
      <h2>{lobby ? t('Leave the room?', 'রুম ছেড়ে যাবেন?') : t('Leave the game?', 'খেলা ছেড়ে যাবেন?')}</h2>
      <p>{lobby ? t('You can join again with the code.', 'কোড দিয়ে আবার যোগ দিতে পারবেন।') : quick ? t('In 1 vs 1, leaving means you lose.', '১ বনাম ১-এ ছেড়ে গেলে আপনি হারবেন।') : t('The computer (or your partner) will play for you.', 'আপনার হয়ে কম্পিউটার (বা দলের সাথী) খেলবে।')}</p>
      <div className="modal-actions">
        <button className="btn outline" onClick={onClose}>{t('Stay', 'থাকুন')}</button>
        <button className="btn danger" onClick={onLeave}>{t('Leave', 'ছেড়ে যান')}</button>
      </div>
    </Modal>
  );
}

function InviteSheet({ open, onClose, gameId, inRoom }: { open: boolean; onClose: () => void; gameId: string; inRoom: number[] }) {
  const t = useT();
  const [sent, setSent] = useState<Record<number, boolean>>({});
  const friends = useQuery({ queryKey: ['friends'], queryFn: async () => (await api<{ items: { user: PublicUser; status: string }[] }>('/friends')).items, enabled: open });
  const list = (friends.data ?? []).sort((a, b) => Number(b.status !== 'offline') - Number(a.status !== 'offline'));
  return (
    <Sheet open={open} onClose={onClose} title={t('Invite friends', 'বন্ধুদের ডাকুন')} icon="user-add">
      <div className="fwd-list">
        {!list.length && <p className="small muted" style={{ padding: 12 }}>{t('No friends yet.', 'এখনো কোনো বন্ধু নেই।')}</p>}
        {list.map((f) => {
          const here = inRoom.includes(f.user.id);
          return (
            <div key={f.user.id} className="fwd-row">
              <Avatar name={f.user.username} src={f.user.avatarThumbUrl} status={f.status as any} size={42} />
              <b className="grow ellipsis">{f.user.username}</b>
              <button
                className={`btn sm ${sent[f.user.id] || here ? 'soft' : 'primary'}`}
                disabled={here || !!sent[f.user.id]}
                onClick={() =>
                  void emit('ludo:invite', { gameId, to: f.user.id })
                    .then(() => (haptic('success'), setSent((s) => ({ ...s, [f.user.id]: true }))))
                    .catch((e: any) => toast.error(t('Not sent', 'পাঠানো যায়নি'), e?.message))
                }
              >
                {here ? t('In room', 'রুমে আছে') : sent[f.user.id] ? t('Sent', 'পাঠানো হয়েছে') : t('Invite', 'ডাকুন')}
              </button>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/*  Game over: celebration + share card (same as quiz results)        */
/* ------------------------------------------------------------------ */

interface OverRow {
  name: string;
  avatar: string | null;
  color: LudoColor;
  place: number;
  home: number;
  isMe: boolean;
  isBot: boolean;
  uid: string | null;
  team: number | null;
}

function LudoOverScreen({ rows, won, modeText, coins, actions }: { rows: OverRow[]; won: boolean; modeText: string; coins: number; actions: ReactNode }) {
  const t = useT();
  const lang = useLang();
  const me = useAuth((s) => s.user)!;
  const cfg = useConfig().data;
  const [card, setCard] = useState<{ blob: Blob; url: string } | null>(null);
  const sorted = [...rows].sort((a, b) => a.place - b.place);
  const teams = rows.some((r) => r.team !== null);
  const myRow = rows.find((r) => r.isMe);
  const playUrl = cfg?.playStoreUrl || 'https://play.google.com/store/apps/details?id=app.quizwar.bd';

  useEffect(() => {
    let alive = true;
    let url: string | null = null;
    const two = rows.length === 2;
    const teamOf = (r: OverRow, i: number) => (teams ? (r.team ?? 0) : two ? (r.isMe ? 0 : 1) : 0);
    const myTeam = myRow ? teamOf(myRow, rows.indexOf(myRow)) : 0;
    const teamScores = teams || two ? [0, 1].map((tm) => rows.filter((r, i) => teamOf(r, i) === tm).reduce((s, r) => s + r.home, 0)) : [myRow?.home ?? 0];
    const date = new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());
    void import('../lib/shareCard').then(({ renderResultCard }) =>
      renderResultCard({
        lang,
        outcome: won ? 'win' : 'loss',
        headline: won ? t('Ludo win!', 'লুডুতে জয়!') : t('Good game!', 'ভালো খেলেছি!'),
        subline: `${t('Ludo', 'লুডু')} · ${modeText}`,
        details: [
          { label: t('Game', 'খেলা'), value: t('Ludo', 'লুডু') },
          { label: t('Place', 'স্থান'), value: num(myRow?.place ?? 1, lang) },
          { label: t('Tokens home', 'ঘরে তোলা'), value: `${num(myRow?.home ?? 0, lang)}/${num(4, lang)}` },
        ],
        date,
        teamScores,
        teams: teams || two ? 2 : 1,
        myTeam,
        winnerTeam: teams || two ? (won ? myTeam : 1 - myTeam) : null,
        players: rows.map((r, i) => ({ name: r.name, uid: r.uid, avatarUrl: r.avatar, score: r.home, correct: r.home, answered: 4, team: teamOf(r, i), isBot: r.isBot, isMe: r.isMe })),
        appUrl: PUBLIC_WEB_URL,
        profileUrl: `${PUBLIC_WEB_URL.replace(/\/$/, '')}/u/${me.uid}`,
        playUrl,
        ctaText: t(`Play Ludo with me! UID ${me.uid}`, `আমার সাথে লুডু খেলো! UID ${me.uid}`),
        labels: { correct: t('home', 'ঘরে'), points: t('home', 'ঘরে'), teamBlue: t('Your team', 'আপনার দল'), teamRed: t('Opponent', 'প্রতিপক্ষ'), you: t('You', 'আপনি'), ai: t('Computer', 'কম্পিউটার') },
      }),
    ).then((blob) => {
      if (!alive || !blob) return;
      url = URL.createObjectURL(blob);
      setCard({ blob, url });
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shareText = [
    won ? t(`I won at Ludo (${modeText}) on QUIZ WAR Bangladesh!`, `QUIZ WAR Bangladesh-এ লুডুতে (${modeText}) জিতেছি!`) : t(`I played Ludo (${modeText}) on QUIZ WAR Bangladesh.`, `QUIZ WAR Bangladesh-এ লুডু (${modeText}) খেললাম।`),
    won ? t('Can you beat me?', 'পারলে আমাকে হারাও!') : t('Play with me!', 'আমার সাথে খেলো!'),
    `UID: ${me.uid}`,
    `${t('Get it on Google Play', 'Google Play থেকে নিন')}: ${playUrl}`,
    '#QuizWarBangladesh #Ludo',
  ].join('\n');
  const fileName = `quizwar-ludo-${Date.now().toString(36)}.png`;
  const doShare = async () => {
    haptic('tap');
    const { shareImage } = await import('../lib/shareImage');
    const r = await shareImage(card?.blob ?? null, { title: 'QUIZ WAR Bangladesh', text: shareText, url: `${PUBLIC_WEB_URL.replace(/\/$/, '')}/u/${me.uid}`, fileName });
    if (r === 'copied') toast.success(t('Copied — paste it anywhere', 'কপি হয়েছে — যেকোনো জায়গায় পেস্ট করুন'), undefined, 'copy');
  };
  const doSave = async () => {
    if (!card) return;
    const { saveImage } = await import('../lib/shareImage');
    const r = await saveImage(card.blob, fileName);
    if (r !== 'failed') toast.success(t('Saved to gallery', 'গ্যালারিতে সেভ হয়েছে'), undefined, 'download');
  };

  return (
    <div className={`ludo-over${won ? ' won' : ''}`} role="dialog" aria-label={t('Game over', 'খেলা শেষ')}>
      {won && <Confetti colors={['#facc15', '#f59e0b', '#e53935', '#43a047', '#1e88e5', '#ffffff']} />}
      <div className="lo-card">
        <span className={`lo-trophy${won ? ' win' : ''}`}><Icon name={won ? 'trophy' : 'medal'} size={46} /></span>
        <h2>{won ? t('You won!', 'আপনি জিতেছেন!') : teams ? t('Your team lost', 'আপনার দল হেরেছে') : t('Good game!', 'ভালো খেলেছেন!')}</h2>
        {won && coins > 0 && <p className="lo-coins"><Icon name="coins" size={18} /> +{num(coins, lang)} {t('coins', 'কয়েন')}</p>}
        <ol className="lo-list">
          {sorted.map((r) => (
            <li key={r.color} className={r.isMe ? 'me' : undefined}>
              <span className="lo-place">{num(r.place, lang)}</span>
              <i style={{ background: LUDO_COLORS[r.color] }} />
              <b className="grow">{r.isMe ? t('You', 'আপনি') : r.name}</b>
              <small className="lo-home">{num(r.home, lang)}/{num(4, lang)}</small>
              {r.place === 1 && <Icon name="crown" size={18} />}
            </li>
          ))}
        </ol>
        <div className="lo-share">
          <button className="btn soft sm" onClick={() => void doShare()}><Icon name="share" /> {t('Share card', 'কার্ড শেয়ার')}</button>
          <button className="btn soft sm" disabled={!card} onClick={() => void doSave()}><Icon name="download" /> {t('Save', 'সেভ')}</button>
        </div>
        {card && <img className="lo-card-preview" src={card.url} alt={t('Your Ludo result card', 'আপনার লুডু ফলাফল কার্ড')} />}
        <div className="lo-actions">{actions}</div>
      </div>
    </div>
  );
}

/** Token reached home: Ludo-King-style "well done" burst over the board. */
function HomeCheer({ color }: { color: LudoColor }) {
  const t = useT();
  const c = LUDO_COLORS[color];
  return (
    <div className="home-cheer" style={{ ['--hc' as any]: c }} aria-live="polite">
      <span className="hc-rays" />
      <svg className="hc-star" viewBox="0 0 100 100" aria-hidden>
        <polygon points="50,6 62,38 96,38 68,58 79,92 50,72 21,92 32,58 4,38 38,38" fill="#fde047" stroke="#b45309" strokeWidth="4" strokeLinejoin="round" />
        <circle cx="50" cy="52" r="13" fill={c} stroke="#fff" strokeWidth="4" />
      </svg>
      <b className="hc-text">{t('Well done!', 'দারুণ!')}</b>
      <small className="hc-sub">{t('Token home · roll again', 'গুটি ঘরে উঠেছে · আবার চাল')}</small>
      {Array.from({ length: 12 }, (_, i) => <i key={i} className="hc-spark" style={{ ['--a' as any]: `${i * 30}deg`, ['--d' as any]: `${(i % 3) * 0.05}s` }} />)}
    </div>
  );
}
