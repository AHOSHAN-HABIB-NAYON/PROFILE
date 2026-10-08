import { comboTier, MODES, type MatchPlayerView, type PowerUp } from '@quizwar/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Avatar } from '../components/Avatar';
import { Empty } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { api, friendlyError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { serverNow, useGame } from '../lib/game';
import { haptic } from '../lib/platform';
import { emit, useConn } from '../lib/socket';
import { sfx } from '../lib/sound';
import { toast } from '../lib/toast';

const KEYS = ['A', 'B', 'C', 'D'];
const PU: Record<PowerUp, { icon: string; label: string }> = {
  fifty_fifty: { icon: '½', label: '50/50' },
  time_boost: { icon: '⏱️', label: 'Time' },
  double_score: { icon: '×2', label: 'Double' },
  hint: { icon: '💡', label: 'Hint' },
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
  const left = useRemaining(startsAt);
  const n = Math.ceil(left / 1000);
  return <div className="countdown-big num" key={n} aria-live="assertive">{n > 0 ? n : 'GO!'}</div>;
}

function ComboBurst({ combo }: { combo: number }) {
  const tier = comboTier(combo);
  if (tier < 1 || combo < 2) return null;
  const flames = tier === 4 ? '💥' : '🔥'.repeat(Math.min(3, tier));
  return (
    <div className={`combo ${tier === 4 ? 'super' : ''}`} key={combo} aria-live="polite">
      <div className="c-flames">{flames}</div>
      <div className="c-text">{tier === 4 ? 'SUPER COMBO!' : `${combo}× COMBO`}</div>
    </div>
  );
}

function SideScore({ players, score, right, answered, label }: { players: MatchPlayerView[]; score: number; right?: boolean; answered: number[]; label: string }) {
  const lead = players[0];
  return (
    <div className={`score-side ${right ? 'right' : ''}`}>
      <div className="row" style={{ gap: 0 }}>
        {players.slice(0, 2).map((p, i) => (
          <span key={p.userId} style={{ marginLeft: i ? -12 : 0 }}>
            <Avatar name={p.username} src={p.avatarUrl} size={40} bot={p.isBot} status={p.connected ? null : 'offline'} />
          </span>
        ))}
      </div>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="s-name ellipsis">
          {label || lead?.username}{' '}
          {players.some((p) => answered.includes(p.userId)) && <span className="answered-dot" title="Answered" aria-label="answered" />}
        </div>
        <div className="s-score num">{score}</div>
      </div>
    </div>
  );
}

export default function Match() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const me = useAuth((s) => s.user)!;
  const conn = useConn((s) => s.status);
  const g = useGame();
  const [missing, setMissing] = useState(false);
  const [quitOpen, setQuitOpen] = useState(false);
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
      const t = setTimeout(() => nav(`/result/${id}`, { replace: true }), 700);
      return () => clearTimeout(t);
    }
  }, [g.end, g.matchId, id, nav]);

  useEffect(() => {
    if (g.snapshot?.state === 'lobby' && g.snapshot.matchId === id) nav(`/war-room/${id}`, { replace: true });
  }, [g.snapshot, id, nav]);

  const remaining = useRemaining(g.question ? g.deadline : null);
  const overall = useRemaining(g.snapshot?.endsAt ?? null);

  if (missing && !g.end) {
    return <div className="page full"><Empty icon="⌛" title="This match has ended" body="It may have finished while you were away." action={<button className="btn primary" onClick={() => nav('/', { replace: true })}>Back to Home</button>} /></div>;
  }
  const snap = g.snapshot;
  if (!snap) return <div className="page full"><div className="mm-stage"><span className="spinner" /><p className="muted">Joining battle…</p></div></div>;

  const mode = MODES[snap.mode];
  const solo = mode.kind === 'solo';
  const myTeam = snap.players.find((p) => p.userId === me.id)?.team ?? 0;
  const myPlayers = snap.players.filter((p) => p.team === myTeam);
  const oppPlayers = snap.players.filter((p) => p.team !== myTeam);
  const q = g.question;
  const revealed = g.reveal && q && g.reveal.questionIndex === q.index ? g.reveal : null;
  const timeTotal = q ? q.deadline - q.startedAt : 1;
  const secLeft = Math.ceil(remaining / 1000);
  const low = !!q && !revealed && secLeft <= 3;
  const me_ = snap.players.find((p) => p.userId === me.id);

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
        toast.error(e?.code === 'too_late' ? "Time's up!" : 'Answer not sent', friendlyError(e));
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
      if (p === 'double_score') toast.success('Double Score active!', 'This question is worth ×2', '×2');
      const left = { ...(snap!.you?.powerUpsLeft ?? {}) };
      left[p] = Math.max(0, (left[p] ?? 1) - 1);
      useGame.getState().set({ snapshot: { ...snap!, you: snap!.you ? { ...snap!.you, powerUpsLeft: left } : null } });
      void inv.refetch();
    } catch (e) {
      toast.error('Power-up unavailable', friendlyError(e));
    }
  }

  const optionClass = (i: number) => {
    if (g.removed.includes(i) && !revealed) return 'option removed';
    if (revealed) {
      if (i === revealed.correctIndex) return 'option correct';
      if (i === g.myPick) return 'option wrong';
      return 'option';
    }
    return g.myPick === i ? 'option picked' : 'option';
  };

  const pickersOf = (i: number) => (revealed ? revealed.results.filter((r) => r.optionIndex === i && r.userId !== me.id) : []);
  const powerUpsLeft = snap.you?.powerUpsLeft ?? {};
  const puEnabled = Object.keys(powerUpsLeft).length > 0;
  const disconnectedOpp = oppPlayers.find((p) => !p.connected && !p.isBot);

  return (
    <div className="game">
      {comboShow > 0 && <ComboBurst combo={comboShow} key={comboShow} />}
      <div className="row between" style={{ marginBottom: 8 }}>
        <span className={`conn-chip ${conn !== 'connected' ? 'bad' : ''}`}><i />{conn === 'connected' ? 'Live' : 'Reconnecting…'}</span>
        <span className="chip">{snap.type === 'ai' ? '🤖 AI Battle' : solo ? mode.label : `${mode.label}${snap.ranked ? ' · Ranked' : ''}`}</span>
        <button className="btn icon sm ghost" aria-label="Leave match" onClick={() => setQuitOpen(true)}><Icon name="flag" size={18} /></button>
      </div>

      {solo ? (
        <div className="score-head">
          <div className="score-side"><div><div className="s-name">Score</div><div className="s-score num">{me_?.score ?? 0}</div></div></div>
          <div className="q-counter">{q ? <>QUESTION<b className="num">{q.index + 1}{snap.questionCount ? `/${snap.questionCount}` : ''}</b></> : null}</div>
          <div className="score-side right"><div><div className="s-name">{snap.endsAt ? 'Time left' : 'Correct'}</div><div className="s-score num">{snap.endsAt ? `${Math.ceil(overall / 1000)}s` : me_?.correct ?? 0}</div></div></div>
        </div>
      ) : (
        <div className="score-head">
          <SideScore players={myPlayers} score={snap.teamScores[myTeam] ?? 0} answered={g.answered} label={myPlayers.length > 1 ? 'Your team' : 'You'} />
          <div className="q-counter">{q ? <>Q<b className="num">{String(q.index + 1).padStart(2, '0')}/{snap.questionCount ?? '∞'}</b></> : 'VS'}</div>
          <SideScore players={oppPlayers} score={snap.teamScores.find((_, t) => t !== myTeam) ?? 0} answered={g.answered} label={oppPlayers.length > 1 ? 'Opponents' : ''} right />
        </div>
      )}
      {disconnectedOpp && <p className="opponent-left">⚠️ {disconnectedOpp.username} disconnected — waiting for them to reconnect…</p>}

      {snap.state === 'countdown' && g.countdownAt ? (
        <div className="mm-stage" style={{ minHeight: '60dvh' }}>
          {!solo && (
            <div className="vs-row">
              <div className="vs-player"><Avatar name={myPlayers[0]?.username ?? ''} src={myPlayers[0]?.avatarUrl} size={72} /><b>{myPlayers.map((p) => p.username).join(' & ')}</b></div>
              <div className="vs-badge">VS</div>
              <div className="vs-player right"><Avatar name={oppPlayers[0]?.username ?? ''} src={oppPlayers[0]?.avatarUrl} size={72} bot={oppPlayers[0]?.isBot} /><b>{oppPlayers.map((p) => p.username).join(' & ')}</b></div>
            </div>
          )}
          <p className="bold muted">{solo ? `${mode.label} starting` : 'Opponent Found!'}</p>
          <Countdown startsAt={g.countdownAt} />
        </div>
      ) : q ? (
        <>
          <div className={`timer-bar ${low ? 'low' : ''}`} role="timer" aria-label={`${secLeft} seconds left`}>
            <span style={{ transform: `scaleX(${revealed ? 0 : Math.max(0, remaining / timeTotal)})` }} />
          </div>
          <div className="row between xs bold">
            <span className="faint">{q.category}</span>
            <span className={low ? '' : 'faint'} style={low ? { color: 'var(--danger)' } : undefined}>{revealed ? '' : `${secLeft}s`}</span>
          </div>
          <div className="question-card" key={q.index} style={{ position: 'relative', marginTop: 8 }}>
            {float && <span className="points-float" key={float.key}>+{float.pts}</span>}
            <div className="q-meta"><span className="chip">{q.difficulty}</span>{me_ && me_.combo >= 2 && <span className="chip warning">🔥 {me_.combo}</span>}</div>
            <p className="q-text">{q.text}</p>
            {q.imageUrl && <img src={q.imageUrl} alt="Question illustration" loading="eager" />}
          </div>
          {g.hint && !revealed && <div className="hint-box">💡 {g.hint}</div>}
          <div className="options" role="group" aria-label="Answers">
            {q.options.map((o, i) => (
              <button key={`${q.index}-${i}`} className={optionClass(i)} disabled={g.myPick !== null || !!revealed || g.removed.includes(i)} onClick={() => void answer(i)} aria-pressed={g.myPick === i}>
                <span className="o-key">{KEYS[i]}</span>
                <span className="grow">{o}</span>
                {revealed && i === revealed.correctIndex && <span aria-label="correct answer">✓</span>}
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
          {revealed && solo && revealed.explanation && <div className="reveal-explain">📘 {revealed.explanation}</div>}
          {g.myPick !== null && !revealed && <p className="center xs faint mt">Answer locked · waiting for the round to end…</p>}
          <div className="game-foot">
            {puEnabled ? (
              <div className="powerups" aria-label="Power-ups">
                {(Object.keys(PU) as PowerUp[]).filter((p) => p in powerUpsLeft).map((p) => {
                  const owned = inv.data?.[p] ?? 0;
                  const left = powerUpsLeft[p] ?? 0;
                  return (
                    <button key={p} className="pu-btn" disabled={!left || !owned || g.myPick !== null || !!revealed} onClick={() => void powerUp(p)} aria-label={`${PU[p].label} (${owned} owned)`} title={PU[p].label}>
                      {PU[p].icon}
                      <span className="badge">{owned}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <span className="xs faint grow">{snap.ranked ? 'Ranked: power-ups disabled for fairness' : ''}</span>
            )}
          </div>
        </>
      ) : (
        <div className="mm-stage" style={{ minHeight: '50dvh' }}><span className="spinner" /><p className="muted">Get ready…</p></div>
      )}

      <Sheet open={quitOpen} onClose={() => setQuitOpen(false)} title="Leave this match?">
        <p className="muted">{solo ? 'Your run ends now and counts with your current score.' : 'Leaving counts as a forfeit — your opponent wins and ranked rating is lost.'}</p>
        <div className="row mt-lg">
          <button className="btn outline grow" onClick={() => setQuitOpen(false)}>Keep playing</button>
          <button
            className="btn danger grow"
            onClick={async () => {
              setQuitOpen(false);
              await emit('match:forfeit', { matchId: id }).catch(() => undefined);
              if (!solo) {
                useGame.getState().reset();
                nav('/', { replace: true });
              }
            }}
          >
            Leave match
          </button>
        </div>
      </Sheet>
    </div>
  );
}
