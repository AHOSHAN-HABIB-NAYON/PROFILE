import { leagueForRating } from '@quizwar/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PageHeader } from '../components/AppShell';
import { Avatar } from '../components/Avatar';
import { CategoryPicker } from '../components/CategoryPicker';
import { Empty, ErrorBox, Skeleton } from '../components/Feedback';
import { useLeagues } from '../components/Game';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

const SCOPES = [
  ['global', 'Global'],
  ['weekly', 'Weekly'],
  ['monthly', 'Monthly'],
  ['season', 'Season'],
  ['friends', 'Friends'],
  ['category', 'Category'],
  ['squad', 'Squads'],
  ['daily', 'Daily'],
] as const;
const PAGE = 25;

function LeagueCard() {
  const me = useAuth((s) => s.user)!;
  const leagues = [...useLeagues()].sort((a, b) => a.minRating - b.minRating);
  const cur = leagueForRating(me.rating, leagues);
  const next = leagues.find((l) => l.minRating > me.rating);
  const season = useQuery({ queryKey: ['season'], queryFn: () => api('/seasons/current', { auth: false }) });
  const pct = next ? Math.round(((me.rating - cur.minRating) / (next.minRating - cur.minRating)) * 100) : 100;
  const days = season.data?.season ? Math.max(0, Math.ceil((new Date(season.data.season.endsAt).getTime() - Date.now()) / 86400000)) : null;
  return (
    <section className="card pad-lg">
      <div className="league-card">
        <span className="l-icon" aria-hidden>{cur.icon}</span>
        <div className="grow">
          <p className="xs bold faint">YOUR LEAGUE</p>
          <h2>{cur.name}</h2>
          <p className="small muted num">Rating {me.rating}{next ? ` · ${next.minRating - me.rating} to ${next.icon} ${next.name}` : ' · Top league!'}</p>
        </div>
      </div>
      <div className="progress mt" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="League progress"><span style={{ width: `${pct}%` }} /></div>
      {season.data?.season && <p className="xs muted mt">🗓️ {season.data.season.name} · ends in {days} day{days === 1 ? '' : 's'}</p>}
      <div className="row mt" style={{ overflowX: 'auto', gap: 6 }}>
        {leagues.map((l) => <span key={l.key} className={`chip ${l.key === cur.key ? 'primary' : ''}`} title={`${l.minRating}+`}>{l.icon} {l.name}</span>)}
      </div>
    </section>
  );
}

export default function Rank() {
  const [params, setParams] = useSearchParams();
  const scope = (params.get('tab') ?? 'global') as (typeof SCOPES)[number][0];
  const [category, setCategory] = useState<number | null>(null);
  const me = useAuth((s) => s.user)!;
  const q = useInfiniteQuery({
    queryKey: ['lb', scope, category],
    enabled: scope !== 'category' || !!category,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api<any>(`/leaderboards/${scope}?page=${pageParam}&pageSize=${PAGE}${scope === 'category' && category ? `&categoryId=${category}` : ''}`),
    getNextPageParam: (last, all) => (last.items.length === PAGE ? all.length + 1 : undefined),
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const myRank = q.data?.pages[0]?.me;
  const top = scope !== 'squad' ? items.slice(0, 3) : [];
  const rest = scope !== 'squad' && items.length >= 3 ? items.slice(3) : items;

  return (
    <div className="page stack">
      <PageHeader title="Rank" />
      <LeagueCard />
      <div className="tabs" role="tablist" aria-label="Leaderboard">
        {SCOPES.map(([k, l]) => <button key={k} role="tab" aria-selected={scope === k} onClick={() => setParams({ tab: k }, { replace: true })}>{l}</button>)}
      </div>
      {scope === 'category' && <CategoryPicker value={category} onChange={setCategory} allowAll={false} />}
      {myRank && <div className="card row" style={{ background: 'var(--primary-soft)' }}><b>Your rank</b><span className="grow" /><b className="num">#{myRank.rank}</b><span className="chip num">{myRank.score}</span></div>}

      {scope === 'category' && !category ? (
        <Empty icon="📚" title="Pick a category" body="See the top players for each subject." />
      ) : q.isLoading ? (
        <Skeleton lines={8} />
      ) : q.error ? (
        <ErrorBox error={q.error} retry={() => void q.refetch()} />
      ) : items.length === 0 ? (
        <Empty icon="🏆" title="No rankings yet" body="Play battles to get on the board!" />
      ) : (
        <>
          {top.length === 3 && (
            <div className="podium">
              {[top[1], top[0], top[2]].map((e, i) => (
                <Link key={e.user.id} to={`/u/${e.user.uid}`} className={`p ${i === 1 ? 'first' : ''}`} style={{ color: 'var(--text)' }}>
                  <span className="medal">{['🥈', '🥇', '🥉'][i]}</span>
                  <Avatar name={e.user.username} src={e.user.avatarThumbUrl} size={i === 1 ? 58 : 48} frame={e.user.frame} />
                  <b className="xs ellipsis" style={{ maxWidth: '100%' }}>{e.user.username}</b>
                  <span className="chip num">{e.score}</span>
                </Link>
              ))}
            </div>
          )}
          <div className="card">
            {(top.length === 3 ? rest : items).map((e: any) =>
              scope === 'squad' ? (
                <Link key={e.squad.id} to={`/squads/${e.squad.id}`} className="lb-row" style={{ color: 'var(--text)' }}>
                  <span className="rank">{e.rank}</span>
                  <span className="avatar" style={{ width: 40, height: 40, fontSize: 40 }}>{e.squad.logoUrl ? <img src={e.squad.logoUrl} alt="" /> : <span className="initial">🛡️</span>}</span>
                  <div className="grow"><b>{e.squad.name}</b> <span className="chip">{e.squad.tag}</span><p className="xs muted">{e.squad.members} members</p></div>
                  <b className="num">{e.squad.score.toLocaleString()} XP</b>
                </Link>
              ) : (
                <Link key={e.user.id} to={`/u/${e.user.uid}`} className={`lb-row ${e.user.id === me.id ? 'me' : ''}`} style={{ color: 'var(--text)' }}>
                  <span className="rank">{e.rank}</span>
                  <Avatar name={e.user.username} src={e.user.avatarThumbUrl} size={40} frame={e.user.frame} />
                  <div className="grow" style={{ minWidth: 0 }}><b className="ellipsis" style={{ display: 'block' }}>{e.user.username}</b><p className="xs muted">Lv {e.user.level}{e.wins ? ` · ${e.wins} wins` : ''}</p></div>
                  <b className="num">{e.score.toLocaleString()}</b>
                </Link>
              ),
            )}
          </div>
          {q.hasNextPage && <button className="btn soft block" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>{q.isFetchingNextPage ? 'Loading…' : 'Load more'}</button>}
        </>
      )}
    </div>
  );
}
