import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { Avatar } from '../components/Avatar';
import { CountUp, Skeleton } from '../components/Feedback';
import { LeagueBadge, LevelBar } from '../components/Game';
import { useMissions } from '../hooks/queries';
import { api, friendlyError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { haptic } from '../lib/platform';
import { useConn } from '../lib/socket';
import { sfx } from '../lib/sound';
import { toast } from '../lib/toast';

const ICON: Record<string, string> = { coins: '🪙', xp: '⭐', power_up: '⚡', mystery: '🎁' };

function DailyReward() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['daily-reward'], queryFn: () => api('/me/rewards/daily') });
  const claim = useMutation({
    mutationFn: () => api('/me/rewards/daily/claim', { method: 'POST' }),
    onSuccess: (r: any) => {
      sfx('reward');
      haptic('success');
      toast.success(`Day ${r.day} reward claimed!`, `+${r.label}`, '🎁');
      void qc.invalidateQueries({ queryKey: ['daily-reward'] });
    },
    onError: (e) => toast.error('Could not claim', friendlyError(e)),
  });
  if (!data) return <Skeleton kind="card" lines={1} />;
  return (
    <section className="card" aria-labelledby="dr-title">
      <div className="card-title">
        <h3 id="dr-title">🎁 Daily Reward</h3>
        {data.claimedToday ? <span className="chip success">Claimed ✓</span> : <span className="chip primary">Day {data.day}</span>}
      </div>
      <div className="reward-track">
        {data.ladder.slice(0, 7).map((r: any, i: number) => {
          const d = i + 1;
          const cls = d < data.day || (data.claimedToday && d === data.day) ? 'done' : d === data.day ? 'today' : '';
          return (
            <div key={i} className={`reward-day ${cls}`}>
              <span className="r-ico">{ICON[r.type]}</span>
              {r.type === 'power_up' ? '×' + r.amount : r.type === 'mystery' ? '?' : r.amount}
              <div className="faint">D{d}</div>
            </div>
          );
        })}
      </div>
      {!data.claimedToday && (
        <button className="btn primary block mt" disabled={claim.isPending} onClick={() => claim.mutate()}>
          Claim Day {data.day}
        </button>
      )}
    </section>
  );
}

function DailyChallengeCard() {
  const nav = useNavigate();
  const { data } = useQuery({ queryKey: ['daily'], queryFn: () => api('/daily') });
  if (!data?.available) return null;
  return (
    <section className="card row" style={{ background: 'linear-gradient(135deg, var(--accent-soft), var(--primary-soft))' }}>
      <div style={{ fontSize: 34 }} aria-hidden>📅</div>
      <div className="grow">
        <h3>Daily Challenge</h3>
        <p className="xs muted">{data.questionCount} Questions · {Math.round(data.totalTimeSec / 60)} Minutes · {data.players} played today</p>
      </div>
      {data.played ? (
        <span className="chip success">Score {data.result?.score ?? 0}</span>
      ) : (
        <button className="btn sm accent" onClick={() => nav('/battle?daily=1')}>Play</button>
      )}
    </section>
  );
}

function MissionsCard() {
  const nav = useNavigate();
  const { data } = useMissions();
  const items = data?.items ?? [];
  if (!items.length) return null;
  const today = items.filter((m) => m.period === 'daily');
  const done = today.filter((m) => m.completed).length;
  const claimable = data?.claimable ?? 0;
  return (
    <section className={`card row ${claimable ? 'mission ready' : ''}`} style={{ cursor: 'pointer' }} onClick={() => nav('/shop?tab=missions')} role="link" aria-label="Missions">
      <div style={{ fontSize: 34 }} aria-hidden>🎯</div>
      <div className="grow">
        <h3>মিশন ও রিওয়ার্ড</h3>
        <p className="xs muted">{claimable ? `${claimable}টি রিওয়ার্ড Claim করার অপেক্ষায়!` : `আজকের মিশন ${done}/${today.length} সম্পূর্ণ`}</p>
      </div>
      {claimable ? <span className="btn sm primary claim-btn">Claim</span> : <span className="chip">দেখুন</span>}
    </section>
  );
}

function FriendsOnline() {
  const { data } = useQuery({ queryKey: ['friends'], queryFn: async () => (await api<{ items: any[] }>('/friends')).items });
  const online = (data ?? []).filter((f) => f.status !== 'offline').slice(0, 10);
  return (
    <section className="card">
      <div className="card-title">
        <h3>👥 Friends Online</h3>
        <Link to="/friends" className="small bold">See all</Link>
      </div>
      {!data ? (
        <Skeleton lines={1} kind="line" />
      ) : online.length === 0 ? (
        <p className="small muted">No friends online right now. <Link to="/friends">Add friends</Link> with their UID or QR code.</p>
      ) : (
        <div className="row" style={{ overflowX: 'auto', gap: 14, paddingBottom: 4 }}>
          {online.map((f) => (
            <Link key={f.user.id} to={`/u/${f.user.uid}`} className="col center" style={{ gap: 4, color: 'var(--text)', minWidth: 60 }}>
              <Avatar name={f.user.username} src={f.user.avatarThumbUrl} status={f.status} size={52} frame={f.user.frame} />
              <span className="xs bold ellipsis" style={{ maxWidth: 64 }}>{f.user.username}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export default function Home() {
  const user = useAuth((s) => s.user)!;
  const online = useConn((s) => s.online);
  const nav = useNavigate();
  const quick = () => {
    haptic('heavy');
    sfx('tap');
    nav('/matchmaking?mode=duel&ranked=1', { viewTransition: true });
  };
  return (
    <div className="page stack">
      <section className="row" aria-label="Your profile">
        <Link to="/profile"><Avatar name={user.username} src={user.avatarThumbUrl ?? user.avatarUrl} size={52} frame={user.frame} status="online" /></Link>
        <div className="grow">
          <div className="row gap-sm"><h2 className="ellipsis">{user.username}</h2><LeagueBadge rating={user.rating} compact /></div>
          <LevelBar xp={user.xp} />
        </div>
      </section>

      <section className="hero-battle" aria-labelledby="qb">
        <span className="live"><i /> <CountUp value={online} /> {online === 1 ? "Player" : "Players"} Online</span>
        <h2 id="qb" className="mt">⚔️ QUICK BATTLE</h2>
        <p>Ranked 1 VS 1 · Same questions · Fastest correct answer wins</p>
        <button className="btn block" onClick={quick}>Find Opponent</button>
      </section>

      <div className="mode-grid">
        <button className="mode-card" onClick={() => nav('/matchmaking?mode=duo&ranked=0')}><span className="m-icon">👥</span><strong>Duo 2 VS 2</strong><span>Team up with a partner</span></button>
        <button className="mode-card" onClick={() => nav('/battle#ai')}><span className="m-icon" style={{ background: 'var(--cyan-soft)' }}>🤖</span><strong>VS AI</strong><span>Easy to Expert bots</span></button>
        <button className="mode-card" onClick={() => nav('/friends')}><span className="m-icon" style={{ background: 'var(--danger-soft)' }}>🎯</span><strong>Challenge</strong><span>Battle a friend</span></button>
        <button className="mode-card" onClick={() => nav('/battle#solo')}><span className="m-icon" style={{ background: 'var(--success-soft)' }}>🧠</span><strong>Solo Practice</strong><span>Learn at your pace</span></button>
        <button className="mode-card" onClick={() => nav('/battle#survival')}><span className="m-icon" style={{ background: 'var(--warning-soft)' }}>❤️‍🔥</span><strong>Survival</strong><span>One mistake ends it</span></button>
        <button className="mode-card" onClick={() => nav('/battle#speed')}><span className="m-icon" style={{ background: 'var(--accent-soft)' }}>⚡</span><strong>Speed Round</strong><span>60 seconds sprint</span></button>
      </div>

      <DailyChallengeCard />
      <DailyReward />
      <MissionsCard />
      <FriendsOnline />

      <section className="stat-grid" aria-label="Quick stats">
        <Link to="/profile" className="stat"><b>🔥 {user.streakDays}</b><span>Day streak</span></Link>
        <Link to="/rank" className="stat"><b className="num">{user.rating}</b><span>Rating</span></Link>
        <Link to="/shop" className="stat"><b style={{ color: 'var(--coin)' }}>🪙 <CountUp value={user.coins} /></b><span>Coins</span></Link>
      </section>
    </div>
  );
}
