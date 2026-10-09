import { leagueForRating } from '@quizwar/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PageHeader } from '../components/AppShell';
import { Avatar } from '../components/Avatar';
import { CategoryPicker } from '../components/CategoryPicker';
import { Empty, ErrorBox, ListSkeleton, N } from '../components/Feedback';
import { useLeagues } from '../components/Game';
import { Icon, type IconName } from '../components/Icon';
import { LeagueEmblem, RankMedal } from '../components/LeagueEmblem';
import { PlayerName } from '../components/Verified';
import { PullToRefresh } from '../components/PullToRefresh';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { num, useLang, useT } from '../lib/i18n';

const SCOPES: [string, string, string, IconName][] = [
  ['global', 'Global', 'সারা দেশ', 'globe'],
  ['weekly', 'Weekly', 'সাপ্তাহিক', 'calendar'],
  ['monthly', 'Monthly', 'মাসিক', 'calendar'],
  ['season', 'Season', 'সিজন', 'trophy'],
  ['friends', 'Friends', 'বন্ধুরা', 'users'],
  ['category', 'Category', 'ক্যাটাগরি', 'book'],
  ['squad', 'Squads', 'স্কোয়াড', 'shield'],
  ['daily', 'Daily', 'ডেইলি', 'bolt'],
];
const PAGE = 25;

function LeagueCard() {
  const me = useAuth((s) => s.user)!;
  const t = useT();
  const lang = useLang();
  const leagues = [...useLeagues()].sort((a, b) => a.minRating - b.minRating);
  const cur = leagueForRating(me.rating, leagues);
  const next = leagues.find((l) => l.minRating > me.rating);
  const season = useQuery({ queryKey: ['season'], queryFn: () => api('/seasons/current', { auth: false }) });
  const pct = next ? Math.round(((me.rating - cur.minRating) / (next.minRating - cur.minRating)) * 100) : 100;
  const days = season.data?.season ? Math.max(0, Math.ceil((new Date(season.data.season.endsAt).getTime() - Date.now()) / 86400000)) : null;
  return (
    <section className="league-hero">
      <div className="lh-top">
        <span className="lh-emblem"><LeagueEmblem league={cur.key} size={84} /></span>
        <div className="grow">
          <p className="xs bold lh-label">{t('YOUR LEAGUE', 'আপনার লীগ')}</p>
          <h2>{cur.name}</h2>
          <p className="small">
            {t('Rating', 'রেটিং')} <N v={me.rating} />
            {next ? t(` · ${next.minRating - me.rating} to ${next.name}`, ` · ${next.name} থেকে ${num(next.minRating - me.rating, lang)} দূরে`) : t(' · Top league!', ' · সর্বোচ্চ লীগ!')}
          </p>
        </div>
      </div>
      <div className="lh-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t('League progress', 'লীগের অগ্রগতি')}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="lh-ladder">
        {leagues.map((l) => (
          <span key={l.key} className={`lh-step ${l.key === cur.key ? 'cur' : l.minRating < cur.minRating ? 'done' : ''}`} title={`${l.name} · ${l.minRating}+`}>
            <LeagueEmblem league={l.key} size={30} />
          </span>
        ))}
      </div>
      {season.data?.season && (
        <p className="xs lh-season">
          <Icon name="clock" size={14} /> {season.data.season.name} · {t(`ends in ${days} day${days === 1 ? '' : 's'}`, `${num(days ?? 0, lang)} দিন বাকি`)}
        </p>
      )}
    </section>
  );
}

export default function Rank() {
  const t = useT();
  const lang = useLang();
  const [params, setParams] = useSearchParams();
  const scope = params.get('tab') ?? 'global';
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
  const rest = scope !== 'squad' ? items.slice(3) : items;

  return (
    <PullToRefresh onRefresh={() => q.refetch()}>
      <div className="page stack">
        <PageHeader title={t('Rank', 'র‍্যাংক')} />
        <LeagueCard />
        <div className="tabs" role="tablist" aria-label={t('Leaderboard', 'লিডারবোর্ড')}>
          {SCOPES.map(([k, en, bn, icon]) => (
            <button key={k} role="tab" aria-selected={scope === k} onClick={() => setParams({ tab: k }, { replace: true })}>
              <Icon name={icon} /> {t(en, bn)}
            </button>
          ))}
        </div>
        {scope === 'category' && <CategoryPicker value={category} onChange={setCategory} allowAll={false} />}
        {myRank && (
          <div className="my-rank">
            <Avatar name={me.username} src={me.avatarThumbUrl} size={38} />
            <b className="grow">{t('Your rank', 'আপনার অবস্থান')}</b>
            <b className="num my-rank-n">#{num(myRank.rank, lang)}</b>
            <span className="chip num">{num(myRank.score, lang)}</span>
          </div>
        )}

        {scope === 'category' && !category ? (
          <Empty icon="book" title={t('Pick a category', 'একটি ক্যাটাগরি বেছে নিন')} body={t('See the top players for each subject.', 'প্রতিটি বিষয়ের সেরা প্লেয়ারদের দেখুন।')} />
        ) : q.isLoading ? (
          <ListSkeleton rows={8} />
        ) : q.error ? (
          <ErrorBox error={q.error} retry={() => void q.refetch()} />
        ) : items.length === 0 ? (
          <Empty icon="trophy" tone="warning" title={t('No rankings yet', 'এখনো কোনো র‍্যাংকিং নেই')} body={t('Play battles to get on the board!', 'ব্যাটল খেলে লিডারবোর্ডে নাম তুলুন!')} />
        ) : (
          <>
            {top.length > 0 && (
              <div className="podium" role="list" aria-label={t('Top 3', 'সেরা ৩')}>
                {[top[1], top[0], top[2]].map((e, i) => {
                  const place = [2, 1, 3][i];
                  if (!e) return <div key={`empty-${place}`} className={`p p${place} empty`} aria-hidden />;
                  return (
                    <Link key={e.user.id} to={`/u/${e.user.uid}`} className={`p p${place} ${e.user.id === me.id ? 'me' : ''}`} role="listitem">
                      <span className="p-ava">
                        {place === 1 && <Icon name="crown" size={28} className="p-crown" />}
                        <span className="p-ring"><Avatar name={e.user.username} src={e.user.avatarThumbUrl} size={place === 1 ? 72 : 58} frame={e.user.frame} /></span>
                        <span className="p-medal"><RankMedal rank={place} size={26} /></span>
                      </span>
                      <b className="p-name"><PlayerName name={e.user.username} verified={e.user.verified} size={14} /></b>
                      <span className="p-score num">{num(e.score, lang)}</span>
                      <span className="p-base"><b>{num(place, lang)}</b></span>
                    </Link>
                  );
                })}
              </div>
            )}
            <div className="card lb-card">
              {(top.length > 0 ? rest : items).map((e: any) =>
                scope === 'squad' ? (
                  <Link key={e.squad.id} to={`/squads/${e.squad.id}`} className="lb-row">
                    <span className="rank">{e.rank <= 3 ? <RankMedal rank={e.rank} size={26} /> : num(e.rank, lang)}</span>
                    <span className="avatar" style={{ width: 40, height: 40, fontSize: 40 }}>{e.squad.logoUrl ? <img src={e.squad.logoUrl} alt="" /> : <Icon name="shield" size={20} />}</span>
                    <div className="grow"><b>{e.squad.name}</b> <span className="chip">{e.squad.tag}</span><p className="xs muted">{num(e.squad.members, lang)} {t('members', 'সদস্য')}</p></div>
                    <b className="num">{num(e.squad.score, lang)} XP</b>
                  </Link>
                ) : (
                  <Link key={e.user.id} to={`/u/${e.user.uid}`} className={`lb-row ${e.user.id === me.id ? 'me' : ''}`}>
                    <span className="rank">{num(e.rank, lang)}</span>
                    <Avatar name={e.user.username} src={e.user.avatarThumbUrl} size={42} frame={e.user.frame} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <b style={{ display: 'block' }}><PlayerName name={e.user.username} verified={e.user.verified} /></b>
                      <p className="xs muted">{t('Lv', 'লেভেল')} {num(e.user.level, lang)}{e.wins ? t(` · ${e.wins} wins`, ` · ${num(e.wins, lang)} জয়`) : ''}</p>
                    </div>
                    <b className="num">{num(e.score, lang)}</b>
                  </Link>
                ),
              )}
            </div>
            {q.hasNextPage && (
              <button className="btn soft block" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
                {q.isFetchingNextPage ? <span className="spinner" /> : <Icon name="chevron-down" />} {t('Load more', 'আরও দেখুন')}
              </button>
            )}
          </>
        )}
      </div>
    </PullToRefresh>
  );
}
