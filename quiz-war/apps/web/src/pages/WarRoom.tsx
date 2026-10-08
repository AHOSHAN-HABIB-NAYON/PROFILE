import { MODES } from '@quizwar/shared';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Avatar } from '../components/Avatar';
import { Empty } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { friendlyError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useGame } from '../lib/game';
import { haptic, PUBLIC_WEB_URL, share } from '../lib/platform';
import { emit, useConn } from '../lib/socket';
import { sfx } from '../lib/sound';
import { toast } from '../lib/toast';

export default function WarRoom() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const me = useAuth((s) => s.user)!;
  const conn = useConn((s) => s.status);
  const snap = useGame((s) => (s.matchId === id ? s.snapshot : null));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (conn !== 'connected') return;
    if (useGame.getState().matchId !== id) useGame.getState().reset(id);
    emit('room:join', { matchId: id })
      .then((r) => useGame.getState().applySnapshot(r.snapshot))
      .catch((e) => setError(friendlyError(e)));
  }, [conn, id]);

  useEffect(() => {
    if (snap && snap.state !== 'lobby') nav(`/match/${id}`, { replace: true });
  }, [snap, id, nav]);

  if (error) return <div className="page full"><Empty icon="🏰" title="War Room unavailable" body={error} action={<button className="btn primary" onClick={() => nav('/battle')}>Back to Battle</button>} /></div>;
  if (!snap) return <div className="page full"><div className="mm-stage"><span className="spinner" /><p className="muted">Entering the War Room…</p></div></div>;

  const mine = snap.players.find((p) => p.userId === me.id);
  const isHost = snap.hostUserId === me.id;
  const teams = Array.from({ length: MODES[snap.mode].teams }, (_, t) => snap.players.filter((p) => p.team === t));
  const allReady = snap.players.every((p) => p.ready) && teams.every((t) => t.length > 0);
  const link = `${PUBLIC_WEB_URL.replace(/\/$/, '')}/war-room/${id}`;

  const toggleReady = async () => {
    haptic('tap');
    sfx('tap');
    try {
      await emit('room:ready', { matchId: id, ready: !mine?.ready });
    } catch (e) {
      toast.error('Could not update', friendlyError(e));
    }
  };
  const startWar = async () => {
    setBusy(true);
    try {
      await emit('room:start', { matchId: id });
    } catch (e) {
      toast.error('Cannot start yet', friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  const leave = async () => {
    await emit('room:leave', { matchId: id }).catch(() => undefined);
    useGame.getState().reset();
    nav('/battle', { replace: true });
  };

  return (
    <div className="page full war-room">
      <div className="center" style={{ marginTop: 8 }}>
        <p className="xs bold faint" style={{ letterSpacing: '.2em' }}>QUIZ WAR</p>
        <h1 style={{ fontSize: 26 }}>⚔️ WAR ROOM</h1>
      </div>
      <div className="card row wrap" style={{ justifyContent: 'center' }}>
        <span className="chip primary">Mode: {MODES[snap.mode].label}</span>
        <span className="chip">Category: {snap.category ? `${snap.category.icon} ${snap.category.name}` : '🎲 Mixed'}</span>
        <span className="chip">Questions: {snap.questionCount ?? '∞'}</span>
        <span className="chip">{snap.questionTimeSec}s / question</span>
      </div>
      {teams.map((players, t) => (
        <section key={t} className={`team-box t${t}`} aria-label={`Team ${t + 1}`}>
          <div className="row between mb"><b>{teams.length > 1 ? (t === 0 ? '🔵 Team Blue' : '🔴 Team Red') : 'Players'}</b><span className="xs faint">{players.length}/{MODES[snap.mode].teamSize}</span></div>
          {players.map((p) => (
            <div key={p.userId} className="list-row">
              <Avatar name={p.username} src={p.avatarUrl} size={40} bot={p.isBot} status={p.connected ? 'online' : 'offline'} />
              <div className="grow">
                <b className="ellipsis">{p.username}{p.userId === snap.hostUserId && ' 👑'}</b>
                <p className="xs faint">Lv {p.level} · {p.rating}</p>
              </div>
              <span className={`ready-tag ${p.ready ? 'on' : 'off'}`}>{p.ready ? '🟢 READY' : 'NOT READY'}</span>
            </div>
          ))}
          {players.length < MODES[snap.mode].teamSize && <p className="xs faint center" style={{ padding: 8 }}>Waiting for players…</p>}
        </section>
      ))}
      <button className={`btn lg block ${mine?.ready ? 'outline' : 'success'}`} onClick={() => void toggleReady()}>{mine?.ready ? 'Not ready' : "I'm READY"}</button>
      {isHost && snap.players.length > 1 && (
        <button className="btn primary lg block" disabled={!allReady || busy} onClick={() => void startWar()}>⚔️ START WAR</button>
      )}
      <div className="row">
        <button className="btn soft grow" onClick={() => void share({ title: 'Join my War Room', text: `⚔️ Join my QUIZ WAR battle room (${MODES[snap.mode].label})!`, url: link }).then((r) => r === 'copied' && toast.success('Link copied'))}>
          <Icon name="share" /> Invite
        </button>
        <button className="btn ghost" onClick={() => void leave()}>Leave</button>
      </div>
    </div>
  );
}
