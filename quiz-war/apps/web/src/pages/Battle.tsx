import { AI_LEVELS, type AiLevel, type BattleRequestView, type Difficulty } from '@quizwar/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { PageHeader } from '../components/AppShell';
import { Avatar } from '../components/Avatar';
import { CategoryPicker } from '../components/CategoryPicker';
import { Empty, Skeleton } from '../components/Feedback';
import { api, friendlyError } from '../lib/api';
import { useGame } from '../lib/game';
import { haptic } from '../lib/platform';
import { emit } from '../lib/socket';
import { sfx } from '../lib/sound';
import { toast } from '../lib/toast';

const AI_INFO: Record<AiLevel, { icon: string; label: string }> = {
  easy: { icon: '🙂', label: 'Easy' },
  normal: { icon: '😎', label: 'Normal' },
  hard: { icon: '😤', label: 'Hard' },
  expert: { icon: '🧠', label: 'Expert' },
};

function useStart() {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const start = async (event: string, payload: object) => {
    setBusy(true);
    haptic('heavy');
    try {
      const r = await emit(event as any, payload);
      useGame.getState().reset(r.matchId);
      sfx('start');
      nav(event === 'room:create' ? `/war-room/${r.matchId}` : `/match/${r.matchId}`);
    } catch (e) {
      toast.error('Could not start', friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, start };
}

function Requests() {
  const nav = useNavigate();
  const { data, isLoading, refetch } = useQuery({ queryKey: ['battle-requests'], queryFn: () => api<{ incoming: BattleRequestView[]; outgoing: BattleRequestView[] }>('/battles/requests'), refetchInterval: 15000 });
  const act = async (id: number, action: 'accept' | 'decline' | 'cancel') => {
    try {
      if (action === 'cancel') await api(`/battles/requests/${id}`, { method: 'DELETE' });
      else {
        const r = await api<{ matchId: string | null }>(`/battles/requests/${id}/${action}`, { method: 'POST' });
        if (r.matchId) {
          useGame.getState().reset(r.matchId);
          nav(`/war-room/${r.matchId}`);
        }
      }
      void refetch();
    } catch (e) {
      toast.error('Something went wrong', friendlyError(e));
      void refetch();
    }
  };
  if (isLoading) return <Skeleton lines={3} />;
  const none = !data?.incoming.length && !data?.outgoing.length;
  if (none) return <Empty icon="⚔️" title="No pending challenges" body="Challenge a friend from your friends list or by UID." action={<button className="btn soft" onClick={() => nav('/friends')}>Open friends</button>} />;
  return (
    <div className="stack">
      {!!data?.incoming.length && <div className="section-label">Incoming</div>}
      {data?.incoming.map((r) => (
        <div key={r.id} className="card row">
          <Avatar name={r.from.username} src={r.from.avatarThumbUrl} size={44} />
          <div className="grow">
            <b>{r.from.username}</b>
            <p className="xs muted">⚔️ 1 VS 1 · {r.questionCount} Questions · {r.questionTimeSec}s{r.category ? ` · ${r.category.name}` : ''}</p>
          </div>
          <button className="btn sm success" onClick={() => void act(r.id, 'accept')}>Accept</button>
          <button className="btn sm ghost" onClick={() => void act(r.id, 'decline')}>Decline</button>
        </div>
      ))}
      {!!data?.outgoing.length && <div className="section-label">Sent</div>}
      {data?.outgoing.map((r) => (
        <div key={r.id} className="card row">
          <Avatar name={r.to.username} src={r.to.avatarThumbUrl} size={40} />
          <div className="grow">
            <b>{r.to.username}</b>
            <p className="xs muted">Waiting… expires in {Math.max(0, Math.round((r.expiresAt - Date.now()) / 1000))}s</p>
          </div>
          <button className="btn sm ghost" onClick={() => void act(r.id, 'cancel')}>Cancel</button>
        </div>
      ))}
    </div>
  );
}

export default function Battle({ tab: initialTab }: { tab?: 'play' | 'requests' }) {
  const [tab, setTab] = useState<'play' | 'requests'>(initialTab ?? 'play');
  const [params] = useSearchParams();
  const loc = useLocation();
  const nav = useNavigate();
  const [category, setCategory] = useState<number | null>(null);
  const [ranked, setRanked] = useState(true);
  const [level, setLevel] = useState<AiLevel>('normal');
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [roomMode, setRoomMode] = useState<'duel' | 'duo' | 'trio' | 'squad'>('duo');
  const [joinCode, setJoinCode] = useState('');
  const { busy, start } = useStart();
  const daily = useQuery({ queryKey: ['daily'], queryFn: () => api('/daily') });
  const stats = useQuery({ queryKey: ['my-stats'], queryFn: () => api('/me/stats'), staleTime: 120_000 });

  useEffect(() => {
    if (params.get('quick')) nav('/matchmaking?mode=duel&ranked=1', { replace: true });
    if (params.get('daily') && daily.data?.available && !daily.data.played) document.getElementById('daily')?.scrollIntoView({ behavior: 'smooth' });
    if (loc.hash) document.getElementById(loc.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [params, loc.hash, daily.data, nav]);

  return (
    <div className="page stack">
      <PageHeader title="Battle" />
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'play'} onClick={() => setTab('play')}>Play</button>
        <button role="tab" aria-selected={tab === 'requests'} onClick={() => setTab('requests')}>Challenges</button>
      </div>
      {tab === 'requests' ? (
        <Requests />
      ) : (
        <>
          <div className="section-label">Category</div>
          <CategoryPicker value={category} onChange={setCategory} />

          <section className="card" aria-labelledby="qb-h">
            <div className="card-title">
              <h2 id="qb-h">⚔️ Quick Battle</h2>
              <label className="row small bold">
                Ranked
                <span className="switch"><input type="checkbox" checked={ranked} onChange={(e) => setRanked(e.target.checked)} aria-label="Ranked" /></span>
              </label>
            </div>
            <div className="row">
              <button className="btn primary grow" onClick={() => nav(`/matchmaking?mode=duel&ranked=${ranked ? 1 : 0}${category ? `&category=${category}` : ''}`)}>1 VS 1</button>
              <button className="btn soft grow" onClick={() => nav(`/matchmaking?mode=duo&ranked=0${category ? `&category=${category}` : ''}`)}>Duo 2 VS 2</button>
            </div>
          </section>

          <section className="card" id="ai" aria-labelledby="ai-h">
            <div className="card-title"><h2 id="ai-h">🤖 Play vs AI</h2><span className="chip">Unranked</span></div>
            <div className="tabs" role="radiogroup" aria-label="AI difficulty">
              {AI_LEVELS.map((l) => (
                <button key={l} role="radio" aria-checked={level === l} aria-selected={level === l} onClick={() => setLevel(l)}>{AI_INFO[l].icon} {AI_INFO[l].label}</button>
              ))}
            </div>
            <button className="btn accent block mt" disabled={busy} onClick={() => void start('ai:start', { level, categoryId: category })}>Battle {AI_INFO[level].label} AI</button>
          </section>

          {daily.data?.available && (
            <section className="card" id="daily" style={{ background: 'linear-gradient(135deg, var(--accent-soft), var(--primary-soft))' }}>
              <div className="card-title"><h2>📅 Daily Challenge</h2><span className="chip">{daily.data.players} played</span></div>
              <p className="small muted">{daily.data.questionCount} Questions · {Math.round(daily.data.totalTimeSec / 60)} Minutes · Same questions for everyone today. One attempt.</p>
              {daily.data.played ? (
                <button className="btn soft block mt" onClick={() => nav('/rank?tab=daily')}>Your score: {daily.data.result?.score} — View leaderboard</button>
              ) : (
                <button className="btn primary block mt" disabled={busy} onClick={() => void start('solo:start', { mode: 'daily' })}>Start Daily Challenge</button>
              )}
            </section>
          )}

          <section className="card" id="solo">
            <div className="card-title"><h2>🧠 Solo Practice</h2></div>
            <div className="tabs" role="radiogroup" aria-label="Difficulty">
              {([null, 'easy', 'medium', 'hard', 'expert'] as const).map((d) => (
                <button key={String(d)} role="radio" aria-checked={difficulty === d} aria-selected={difficulty === d} onClick={() => setDifficulty(d)}>{d ? d[0].toUpperCase() + d.slice(1) : 'Any'}</button>
              ))}
            </div>
            <button className="btn soft block mt" disabled={busy} onClick={() => void start('solo:start', { mode: 'solo', categoryId: category, difficulty })}>Practice 10 Questions</button>
            {!!stats.data?.mistakesAvailable && (
              <button className="btn outline block mt" disabled={busy} onClick={() => void start('solo:start', { mode: 'solo', practiceMistakes: true, categoryId: category })}>
                🔁 Practice Mistakes ({stats.data.mistakesAvailable})
              </button>
            )}
            {!!stats.data?.weakCategories?.length && (
              <p className="xs muted mt">Weak spots: {stats.data.weakCategories.map((c: any) => `${c.icon} ${c.name} (${c.accuracy}%)`).join(' · ')}</p>
            )}
          </section>

          <div className="mode-grid">
            <button className="mode-card" id="survival" disabled={busy} onClick={() => void start('solo:start', { mode: 'survival', categoryId: category })}>
              <span className="m-icon" style={{ background: 'var(--warning-soft)' }}>❤️‍🔥</span><strong>Survival</strong><span>Keep going until one mistake</span>
            </button>
            <button className="mode-card" id="speed" disabled={busy} onClick={() => void start('solo:start', { mode: 'speed', categoryId: category })}>
              <span className="m-icon" style={{ background: 'var(--accent-soft)' }}>⚡</span><strong>Speed Round</strong><span>As many as you can in 60s</span>
            </button>
          </div>

          <section className="card" aria-labelledby="wr-h">
            <div className="card-title"><h2 id="wr-h">🏰 Custom War Room</h2></div>
            <p className="small muted">Create a private room, share the link and start when everyone is ready.</p>
            <div className="tabs mt" role="radiogroup" aria-label="Room size">
              {(['duel', 'duo', 'trio', 'squad'] as const).map((m) => (
                <button key={m} role="radio" aria-checked={roomMode === m} aria-selected={roomMode === m} onClick={() => setRoomMode(m)}>{{ duel: '1v1', duo: '2v2', trio: '3v3', squad: '4v4' }[m]}</button>
              ))}
            </div>
            <button className="btn outline block mt" disabled={busy} onClick={() => void start('room:create', { mode: roomMode, categoryId: category })}>Create War Room</button>
            <form className="row mt" onSubmit={(e) => { e.preventDefault(); const id = joinCode.trim().split('/').pop()?.toUpperCase(); if (id) nav(`/war-room/${id}`); }}>
              <input className="input grow" aria-label="Room link or code" placeholder="Paste room link or code" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} />
              <button className="btn soft" disabled={!joinCode.trim()}>Join</button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
