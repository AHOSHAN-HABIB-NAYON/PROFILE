import { comboTier, MATCH_REACTIONS, MODES, type MatchPlayerView, type PowerUp } from '@quizwar/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Avatar } from '../components/Avatar';
import { Empty } from '../components/Feedback';
import { Icon, type IconName } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { useConfig } from '../hooks/queries';
import { api, friendlyError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { serverNow, useGame } from '../lib/game';
import { num, useLang, useT } from '../lib/i18n';
import { modeIcon, modeLabel } from '../lib/labels';
import { haptic } from '../lib/platform';
import { emit, useConn } from '../lib/socket';
import { sfx } from '../lib/sound';
import { toast } from '../lib/toast';

const KEYS_EN = ['A', 'B', 'C', 'D'];
const KEYS_BN = ['ক', 'খ', 'গ', 'ঘ'];
const PU: Record<PowerUp, { icon: IconName; en: string; bn: string }> = {
  fifty_fifty: { icon: 'divide', en: '50/50', bn: '৫০/৫০' },
  time_boost: { icon: 'timer', en: 'More time', bn: 'বাড়তি সময়' },
  double_score: { icon: 'crosshair', en: 'Double score', bn: 'দ্বিগুণ স্কোর' },
  hint: { icon: 'bulb', en: 'Hint', bn: 'ইঙ্গিত' },
};

/** rAF-driven countdown against the server clock (the server decides the real deadline). */
function useRemaining(deadline: number | null) {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    if (!deadline) return;
    let raf = 0;
    let lastSec = -1;
    const tick = () => {
      const left = Math.max(0, deadline - serverNow());
      setMs(left);
      const sec = Math.ceil(left / 1000);
      if (sec !== lastSec && sec <= 3 && sec > 0) sfx('tick');
      lastSec = sec;
      if (left > 0) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [deadline]);
  return ms;
}

function Countdown({ startsAt }: { startsAt: number }) {
  const t = useT();
  const lang = useLang();
  const left = useRemaining(startsAt);
  const n = Math.ceil(left / 1000);
  return (
    <div className="countdown-big num" key={n} aria-live="assertive">
      {n > 0 ? num(n, lang) : t('GO!', 'শুরু!')}
    </div>
  );
}

function ComboBurst({ combo }: { combo: number }) {
  const t = useT();
  const tier = comboTier(combo);
  if (tier < 1 || combo < 2) return null;
  return (
    <div className={`combo ${tier === 4 ? 'super' : ''}`} key={combo} aria-live="polite">
      <div className="c-flames">
        {Array.from({ length: tier === 4 ? 4 : Math.min(3, tier) }, (_, i) => (
          <Icon key={i} name={tier === 4 ? 'bolt' : 'fire'} size={tier === 4 ? 40 : 38} />
        ))}
      </div>
      <div className="c-text">{tier === 4 ? t('SUPER COMBO!', 'সুপার কম্বো!') : t(`${combo}× COMBO`, `${combo}× কম্বো`)}</div>
    </div>
  );
}

function SideScore({ players, score, right, answered, label }: { players: MatchPlayerView[]; score: number; right?: boolean; answered: number[]; label: string }) {
  const lang = useLang();
  const lead = players[0];
  const done = players.some((p) => answered.includes(p.userId));
  return (
    <div className={`score-side ${right ? 'right' : ''}`}>
      <div className="row" style={{ gap: 0 }}>
        {players.slice(0, 2).map((p, i) => (
          <span key={p.userId} style={{ marginLeft: i ? -12 : 0 }} className={done ? 'answered' : ''}>
            <Avatar name={p.username} src={p.avatarUrl} size={40} bot={p.isBot} status={p.connected ? null : 'offline'} />
          </span>
        ))}
      </div>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="s-name ellipsis">
          {label || lead?.username}
          {done && <Icon name="check-circle" size={13} className="answered-check" />}
        </div>
        <div className="s-score num" key={score}>{num(score, lang)}</div>
      </div>
    </div>
  );
}

/** Floating reaction stickers rising from the sender's side. */
function ReactionLayer({ myTeam }: { myTeam: number }) {
  const reactions = useGame((s) => s.reactions);
  const players = useGame((s) => s.snapshot?.players ?? []);
  return (
    <div className="reaction-layer" aria-live="polite">
      {reactions.map((r) => {
        const p = players.find((x) => x.userId === r.userId);
        return (
          <div key={r.id} className={`reaction ${r.team === myTeam ? 'mine' : 'theirs'}`} style={{ ['--x' as any]: `${(r.id * 37) % 40}px` }}>
            <span className="r-emoji">{r.reaction}</span>
            {p && <span className="r-name">{p.username}</span>}
          </div>
        );
      })}
    </div>
  );
}

function ReactionBar({ matchId }: { matchId: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [cool, setCool] = useState(false);
  const send = async (reaction: string) => {
    if (cool) return;
    setCool(true);
    setTimeout(() => setCool(false), 1600);
    haptic('tap');
    setOpen(false);
    await emit('match:react' as any, { matchId, reaction }).catch(() => undefined);
  };
  return (
    <div className="reaction-bar">
      {open && (
        <div className="reaction-tray" role="menu" aria-label={t('Send a reaction', 'রিঅ্যাকশন পাঠান')}>
          {MATCH_REACTIONS.map((r) => (
            <button key={r} role="menuitem" onClick={() => void send(r)} disabled={cool} aria-label={r}>
              {r}
            </button>
          ))}
        </div>
      )}
      <button className={`btn icon sm soft ${open ? 'on' : ''}`} aria-label={t('Reactions', 'রিঅ্যাকশন')} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="smile" size={20} />
      </button>
    </div>
  );
}

/** Opponent dropped: live countdown until they are forfeited, so nobody waits blindly. */
function OpponentLeft({ name, until }: { name: string; until: number | null }) {
  const t = useT();
  const lang = useLang();
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), 250);
    return () => clearInterval(id);
  }, []);
  const left = until ? Math.max(0, Math.ceil((until - now) / 1000)) : null;
  return (
    <p className="opponent-left" role="status">
      <Icon name="wifi-off" size={14} />{' '}
      {left !== null
        ? t(`${name} left — you win in ${left}s if they don't return`, `${name} চলে গেছে — ${num(left, lang)} সেকেন্ডে না ফিরলে আপনি জিতবেন`)
        : t(`${name} disconnected — waiting for them to reconnect…`, `${name}-এর সংযোগ বিচ্ছিন্ন — ফিরে আসার অপেক্ষা…`)}
    </p>
  );
}

export default function Match() {
  const t = useT();
  const lang = useLang();
  const config = useConfig();
  const { id = '' } = useParams();
  const nav = useNavigate();
  const me = useAuth((s) => s.user)!;
  const conn = useConn((s) => s.status);
  const g = useGame();
  const [missing, setMissing] = useState(false);
  const [quitOpen, setQuitOpen] = useState(false);
  // Android Back during a match opens this same "Leave match?" sheet.
  useEffect(() => {
    const on = () => setQuitOpen(true);
    window.addEventListener('qw:leave-match', on);
    return () => window.removeEventListener('qw:leave-match', on);
  }, []);
  const [float, setFloat] = useState<{ pts: number; key: number } | null>(null);
  const [comboShow, setComboShow] = useState<number>(0);
  const sending = useRef(false);
  const inv = useQuery({ queryKey: ['power-ups'], queryFn: () => api<Record<PowerUp, number>>('/me/power-ups'), staleTime: 10_000 });

  // (Re)attach to the match: covers refresh, deep link and reconnect.
  useEffect(() => {
    if (conn !== 'connected') return;
    if (g.matchId === id && g.snapshot && g.snapshot.matchId === id && g.snapshot.state !== 'lobby') return;
    if (useGame.getState().matchId !== id) useGame.getState().reset(id);
    emit('match:resume', { matchId: id })
      .then((r) => (r.snapshot ? useGame.getState().applySnapshot(r.snapshot) : setMissing(true)))
      .catch(() => setMissing(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn, id]);

  useEffect(() => {
    if (g.end && g.matchId === id) {
      const tm = setTimeout(() => nav(`/result/${id}`, { replace: true }), 700);
      return () => clearTimeout(tm);
    }
  }, [g.end, g.matchId, id, nav]);

  useEffect(() => {
    if (g.snapshot?.state === 'lobby' && g.snapshot.matchId === id) nav(`/war-room/${id}`, { replace: true });
  }, [g.snapshot, id, nav]);

  const remaining = useRemaining(g.question ? g.deadline : null);
  const overall = useRemaining(g.snapshot?.endsAt ?? null);

  if (missing && !g.end) {
    return (
      <div className="page full">
        <Empty
          icon="hourglass"
          title={t('This match has ended', 'এই ম্যাচ শেষ হয়ে গেছে')}
          body={t('It may have finished while you were away.', 'আপনি দূরে থাকার সময় হয়তো শেষ হয়ে গেছে।')}
          action={<button className="btn primary" onClick={() => nav('/', { replace: true })}><Icon name="home" /> {t('Back to home', 'হোমে ফিরুন')}</button>}
        />
      </div>
    );
  }
  const snap = g.snapshot;
  if (!snap)
    return (
      <div className="stage-dark">
        <div className="mm-stage"><span className="spinner" style={{ width: 34, height: 34 }} /><p className="dim">{t('Joining battle…', 'ব্যাটলে যোগ দিচ্ছেন…')}</p></div>
      </div>
    );

  const mode = MODES[snap.mode];
  const solo = mode.kind === 'solo';
  const pen = config.data?.game.penalties;
  const fined = !!pen?.enabled && !solo && (snap.type === 'pvp' || (pen.applyToAiMatches && snap.type === 'ai'));
  const myTeam = snap.players.find((p) => p.userId === me.id)?.team ?? 0;
  const myPlayers = snap.players.filter((p) => p.team === myTeam);
  const oppPlayers = snap.players.filter((p) => p.team !== myTeam);
  const q = g.question;
  const revealed = g.reveal && q && g.reveal.questionIndex === q.index ? g.reveal : null;
  const timeTotal = q ? q.deadline - q.startedAt : 1;
  const secLeft = Math.ceil(remaining / 1000);
  const low = !!q && !revealed && secLeft <= 3;
  const me_ = snap.players.find((p) => p.userId === me.id);
  const keys = lang === 'bn' ? KEYS_BN : KEYS_EN;
  const canReact = !solo;

  async function answer(i: number) {
    if (!q || g.myPick !== null || revealed || sending.current || remaining <= 0) return;
    sending.current = true;
    useGame.getState().set({ myPick: i });
    haptic('tap');
    sfx('tap');
    try {
      const r = await emit('match:answer', { matchId: id, questionIndex: q.index, optionIndex: i }, 6000);
      useGame.getState().set({ myResult: { correct: r.correct, points: r.points, combo: r.combo } });
      if (r.correct) {
        setFloat({ pts: r.points, key: Date.now() });
        if (r.combo >= 2) setComboShow(r.combo);
      }
    } catch (e: any) {
      if (e?.code !== 'duplicate_answer') {
        toast.error(e?.code === 'too_late' ? t('Time’s up!', 'সময় শেষ!') : t('Answer not sent', 'উত্তর পাঠানো যায়নি'), friendlyError(e));
        if (e?.code !== 'round_closed' && e?.code !== 'too_late') useGame.getState().set({ myPick: null });
      }
    } finally {
      sending.current = false;
    }
  }

  async function powerUp(p: PowerUp) {
    if (!q || g.myPick !== null) return;
    try {
      const r = await emit('match:powerup', { matchId: id, questionIndex: q.index, powerUp: p });
      haptic('success');
      if (r.removedOptions) useGame.getState().set({ removed: r.removedOptions });
      if (r.hint) useGame.getState().set({ hint: r.hint });
      if (r.deadline) useGame.getState().set({ deadline: r.deadline });
      if (p === 'double_score') toast.success(t('Double score active!', 'দ্বিগুণ স্কোর চালু!'), t('This question is worth ×2', 'এই প্রশ্নে ×২ পয়েন্ট'), 'crosshair');
      const left = { ...(snap!.you?.powerUpsLeft ?? {}) };
      left[p] = Math.max(0, (left[p] ?? 1) - 1);
      useGame.getState().set({ snapshot: { ...snap!, you: snap!.you ? { ...snap!.you, powerUpsLeft: left } : null } });
      void inv.refetch();
    } catch (e) {
      toast.error(t('Power-up unavailable', 'পাওয়ার-আপ ব্যবহার করা যাচ্ছে না'), friendlyError(e));
    }
  }

  const optionClass = (i: number) => {
    if (g.removed.includes(i) && !revealed) return 'option removed';
    if (revealed) {
      if (i === revealed.correctIndex) return 'option correct';
      if (i === g.myPick) return 'option wrong';
      return 'option dim';
    }
    return g.myPick === i ? 'option picked' : 'option';
  };

  const pickersOf = (i: number) => (revealed ? revealed.results.filter((r) => r.optionIndex === i && r.userId !== me.id) : []);
  const powerUpsLeft = snap.you?.powerUpsLeft ?? {};
  const puEnabled = Object.keys(powerUpsLeft).length > 0;
  const disconnectedOpp = oppPlayers.find((p) => !p.connected && !p.isBot);
  const qTotal = snap.questionCount;

  return (
    <div className="game">
      {comboShow > 0 && <ComboBurst combo={comboShow} key={comboShow} />}
      <ReactionLayer myTeam={myTeam} />
      <div className="game-top">
        <span className={`conn-chip ${conn !== 'connected' ? 'bad' : ''}`}><i />{conn === 'connected' ? t('Live', 'লাইভ') : t('Reconnecting…', 'সংযোগ হচ্ছে…')}</span>
        <span className="chip"><Icon name={modeIcon(snap.mode, snap.type)} /> {snap.type === 'ai' ? t('AI battle', 'AI ব্যাটল') : modeLabel(snap.mode)}{snap.ranked ? t(' · Ranked', ' · র‍্যাংকড') : ''}</span>
        <button className="btn icon sm ghost" aria-label={t('Leave match', 'ম্যাচ ছাড়ুন')} onClick={() => setQuitOpen(true)}><Icon name="flag" size={20} /></button>
      </div>

      {solo ? (
        <div className="score-head">
          <div className="score-side"><div><div className="s-name">{t('Score', 'স্কোর')}</div><div className="s-score num">{num(me_?.score ?? 0, lang)}</div></div></div>
          <div className="q-counter">{q ? <>{t('QUESTION', 'প্রশ্ন')}<b className="num">{num(q.index + 1, lang)}{qTotal ? `/${num(qTotal, lang)}` : ''}</b></> : null}</div>
          <div className="score-side right">
            <div>
              <div className="s-name">{snap.endsAt ? t('Time left', 'সময় বাকি') : t('Correct', 'সঠিক')}</div>
              <div className="s-score num">{snap.endsAt ? `${num(Math.ceil(overall / 1000), lang)}${t('s', 'সে')}` : num(me_?.correct ?? 0, lang)}</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="score-head">
          <SideScore players={myPlayers} score={snap.teamScores[myTeam] ?? 0} answered={g.answered} label={myPlayers.length > 1 ? t('Your team', 'আপনার দল') : t('You', 'আপনি')} />
          <div className="q-counter">{q ? <>{t('Q', 'প্রশ্ন')}<b className="num">{num(String(q.index + 1).padStart(2, '0'), lang)}/{qTotal ? num(qTotal, lang) : '∞'}</b></> : 'VS'}</div>
          <SideScore players={oppPlayers} score={snap.teamScores.find((_, ti) => ti !== myTeam) ?? 0} answered={g.answered} label={oppPlayers.length > 1 ? t('Opponents', 'প্রতিপক্ষ') : ''} right />
        </div>
      )}
      {disconnectedOpp && <OpponentLeft name={disconnectedOpp.username} until={disconnectedOpp.graceUntil ?? null} />}

      {snap.state === 'countdown' && g.countdownAt ? (
        <div className="countdown-stage">
          {!solo && (
            <div className="vs-row">
              <div className="vs-player"><Avatar name={myPlayers[0]?.username ?? ''} src={myPlayers[0]?.avatarUrl} size={76} /><b>{myPlayers.map((p) => p.username).join(' & ')}</b></div>
              <div className="vs-badge">VS</div>
              <div className="vs-player right"><Avatar name={oppPlayers[0]?.username ?? ''} src={oppPlayers[0]?.avatarUrl} size={76} bot={oppPlayers[0]?.isBot} /><b>{oppPlayers.map((p) => p.username).join(' & ')}</b></div>
            </div>
          )}
          <p className="bold muted">{solo ? t(`${mode.label} starting`, `${modeLabel(snap.mode)} শুরু হচ্ছে`) : t('Opponent found!', 'প্রতিপক্ষ পাওয়া গেছে!')}</p>
          <Countdown startsAt={g.countdownAt} />
        </div>
      ) : q ? (
        <>
          <div className="timer-wrap">
            <div className={`timer-bar ${low ? 'low' : ''}`} role="timer" aria-label={t(`${secLeft} seconds left`, `${secLeft} সেকেন্ড বাকি`)}>
              <span style={{ transform: `scaleX(${revealed ? 0 : Math.max(0, remaining / timeTotal)})` }} />
            </div>
            <span className={`timer-num num ${low ? 'low' : ''}`}>{revealed ? '' : num(secLeft, lang)}</span>
          </div>
          <div className="question-card" key={q.index}>
            {float && <span className="points-float" key={float.key}>+{num(float.pts, lang)}</span>}
            <div className="q-meta">
              <span className="chip"><Icon name="book" /> {q.category}</span>
              {me_ && me_.combo >= 2 && <span className="chip warning"><Icon name="fire" /> {num(me_.combo, lang)}</span>}
            </div>
            <p className="q-text">{q.text}</p>
            {q.imageUrl && <img src={q.imageUrl} alt={t('Question illustration', 'প্রশ্নের ছবি')} loading="eager" />}
          </div>
          {g.hint && !revealed && <div className="hint-box"><Icon name="bulb" size={18} /> {g.hint}</div>}
          <div className="options" role="group" aria-label={t('Answers', 'উত্তর')}>
            {q.options.map((o, i) => (
              <button key={`${q.index}-${i}`} className={optionClass(i)} disabled={g.myPick !== null || !!revealed || g.removed.includes(i)} onClick={() => void answer(i)} aria-pressed={g.myPick === i}>
                <span className="o-key">{revealed && i === revealed.correctIndex ? <Icon name="check" size={16} strokeWidth={3} /> : revealed && i === g.myPick ? <Icon name="close" size={16} strokeWidth={3} /> : keys[i]}</span>
                <span className="grow">{o}</span>
                {pickersOf(i).length > 0 && (
                  <span className="o-who">
                    {pickersOf(i).map((r) => {
                      const p = snap.players.find((x) => x.userId === r.userId);
                      return p ? <Avatar key={r.userId} name={p.username} src={p.avatarUrl} size={22} bot={p.isBot} /> : null;
                    })}
                  </span>
                )}
              </button>
            ))}
          </div>
          {revealed && solo && revealed.explanation && <div className="reveal-explain"><Icon name="book-check" size={18} /> {revealed.explanation}</div>}
          {g.myPick !== null && !revealed && <p className="center xs faint mt row gap-sm" style={{ justifyContent: 'center' }}><Icon name="lock" size={13} /> {t('Answer locked · waiting for the round to end…', 'উত্তর লক হয়েছে · রাউন্ড শেষের অপেক্ষা…')}</p>}
          <div className="game-foot">
            {puEnabled ? (
              <div className="powerups" aria-label={t('Power-ups', 'পাওয়ার-আপ')}>
                {(Object.keys(PU) as PowerUp[])
                  .filter((p) => p in powerUpsLeft)
                  .map((p) => {
                    const owned = inv.data?.[p] ?? 0;
                    const left = powerUpsLeft[p] ?? 0;
                    return (
                      <button key={p} className="pu-btn" disabled={!left || !owned || g.myPick !== null || !!revealed} onClick={() => void powerUp(p)} aria-label={t(`${PU[p].en} (${owned} owned)`, `${PU[p].bn} (${owned}টি আছে)`)} title={t(PU[p].en, PU[p].bn)}>
                        <Icon name={PU[p].icon} size={20} />
                        <span className="badge">{num(owned, lang)}</span>
                      </button>
                    );
                  })}
              </div>
            ) : (
              <span className="xs faint grow">{snap.ranked ? t('Ranked: power-ups are off for fairness', 'র‍্যাংকড: ন্যায্যতার জন্য পাওয়ার-আপ বন্ধ') : ''}</span>
            )}
            {canReact && <ReactionBar matchId={id} />}
          </div>
        </>
      ) : (
        <div className="countdown-stage"><span className="spinner" style={{ width: 30, height: 30, color: 'var(--primary)' }} /><p className="muted">{t('Get ready…', 'প্রস্তুত হোন…')}</p></div>
      )}

      <Sheet open={quitOpen} onClose={() => setQuitOpen(false)} title={t('Leave this match?', 'ম্যাচ ছেড়ে যাবেন?')} icon="flag">
        <p className="muted">
          {solo
            ? t('Your run ends now and counts with your current score.', 'এখনই খেলা শেষ হবে এবং বর্তমান স্কোর গণ্য হবে।')
            : t('Leaving counts as a forfeit — your opponent wins.', 'ম্যাচ ছেড়ে গেলে এটা হার (forfeit) হিসেবে গণ্য হবে — প্রতিপক্ষ জিতবে।')}
        </p>
        {fined && pen && (pen.quitCoins > 0 || pen.quitXp > 0) && (
          <div className="penalty-box" role="alert">
            <Icon name="alert" size={24} className="pb-icon" />
            <div>
              <strong>{t('You will be fined', 'জরিমানা কাটা হবে')}</strong>
              <div className="pb-amounts">
                {pen.quitCoins > 0 && <span><Icon name="coin" size={20} /> −{num(pen.quitCoins, lang)}</span>}
                {pen.quitXp > 0 && <span><Icon name="xp" size={20} /> −{num(pen.quitXp, lang)} XP</span>}
              </div>
              <span className="small muted">
                {pen.giveCoinsToOpponents ? t('The coins go to your opponent. ', 'কাটা কয়েন প্রতিপক্ষ পাবে। ') : ''}
                {t('Closing the app or losing connection without returning counts the same.', 'অ্যাপ বন্ধ করলে বা নেট কেটে গিয়ে ফিরে না এলেও একই জরিমানা হবে।')}
              </span>
            </div>
          </div>
        )}
        <div className="row mt-lg">
          <button className="btn primary grow" onClick={() => setQuitOpen(false)}><Icon name="gamepad" /> {t('Keep playing', 'খেলা চালিয়ে যান')}</button>
          <button
            className="btn soft-danger grow"
            onClick={async () => {
              setQuitOpen(false);
              await emit('match:forfeit', { matchId: id }).catch(() => undefined);
              useAuth.setState({ activeMatchId: null });
              if (!solo) {
                useGame.getState().reset();
                nav('/', { replace: true });
              }
            }}
          >
            <Icon name="door" /> {t('Leave', 'ছেড়ে দিন')}
          </button>
        </div>
      </Sheet>
    </div>
  );
}
