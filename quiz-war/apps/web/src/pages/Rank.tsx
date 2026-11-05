import { leagueForRating } from '@quizwar/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
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
import { useConfig } from '../hooks/queries';
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
    <section className="league-hero compact">
      <div className="lh-top">
        <span className="lh-emblem"><LeagueEmblem league={cur.key} size={52} /></span>
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
      {season.data?.season && (
        <p className="xs lh-season">
          <Icon name="clock" size={14} /> {season.data.season.name} · {t(`ends in ${days} day${days === 1 ? '' : 's'}`, `${num(days ?? 0, lang)} দিন বাকি`)}
        </p>
      )}
    </section>
  );
}

/** Top 3 on steps (2 · 1 · 3), used by the Quiz and Ludo boards. */
function Podium({ top, unit }: { top: any[]; unit?: string }) {
  const t = useT();
  const lang = useLang();
  const me = useAuth((s) => s.user)!;
  return (
    <div className="podium" role="list" aria-label={t('Top 3', 'সেরা ৩')}>
      {[top[1], top[0], top[2]].map((e, i) => {
        const place = [2, 1, 3][i]!;
        if (!e) return <div key={`empty-${place}`} className={`p p${place} empty`} aria-hidden />;
        return (
          <Link key={e.user.id} to={`/u/${e.user.uid}`} className={`p p${place} ${e.user.id === me.id ? 'me' : ''}`} role="listitem">
            <span className="p-ava">
              {place === 1 && <Icon name="crown" size={28} className="p-crown" />}
              <span className="p-ring"><Avatar name={e.user.username} src={e.user.avatarThumbUrl} size={place === 1 ? 72 : 58} frame={e.user.frame} /></span>
              <span className="p-medal"><RankMedal rank={place} size={26} /></span>
            </span>
            <b className="p-name"><PlayerName name={e.user.username} verified={e.user.verified} premium={e.user.premium} size={14} /></b>
            <span className="p-score num">{num(e.score, lang)}{unit ? <small> {unit}</small> : null}</span>
            <span className="p-base"><b>{num(place, lang)}</b></span>
          </Link>
        );
      })}
    </div>
  );
}

/** Ludo board: most online wins (all time / this month / this week). */
function LudoRank() {
  const t = useT();
  const lang = useLang();
  const me = useAuth((s) => s.user)!;
  const [scope, setScope] = useState<'global' | 'monthly' | 'weekly'>('monthly');
  const q = useQuery({ queryKey: ['ludo-lb', scope], queryFn: () => api<{ items: { rank: number; user: any; score: number; games: number }[]; me: { rank: number; score: number; games: number } | null }>(`/ludo/leaderboard?scope=${scope}`) });
  const items = q.data?.items ?? [];
  return (
    <>
      <div className="tabs" role="tablist">
        {([['monthly', 'Monthly', 'মাসিক'], ['weekly', 'Weekly', 'সাপ্তাহিক'], ['global', 'All time', 'সব সময়']] as const).map(([k, en, bn]) => (
          <button key={k} role="tab" aria-selected={scope === k} onClick={() => setScope(k)}>{t(en, bn)}</button>
        ))}
      </div>
      {q.data?.me && (
        <div className="my-rank">
          <Avatar name={me.username} src={me.avatarThumbUrl} size={38} />
          <b className="grow">{t('Your rank', 'আপনার অবস্থান')}</b>
          <b className="num my-rank-n">#{num(q.data.me.rank, lang)}</b>
          <span className="chip num">{num(q.data.me.score, lang)} {t('wins', 'জয়')}</span>
        </div>
      )}
      {q.isLoading ? (
        <ListSkeleton rows={6} />
      ) : q.error ? (
        <ErrorBox error={q.error} retry={() => void q.refetch()} />
      ) : !items.length ? (
        <Empty icon="gamepad" tone="warning" title={t('No Ludo winners yet', 'এখনো কেউ লুডুতে জেতেনি')} body={t('Win online Ludo games to be the first on this board!', 'অনলাইন লুডুতে জিতে প্রথম হন!')} action={<Link className="btn primary" to="/ludo"><Icon name="gamepad" /> {t('Play Ludo', 'লুডু খেলুন')}</Link>} />
      ) : (
        <>
        <Podium top={items.slice(0, 3)} unit={t('wins', 'জয়')} />
        {items.length > 3 && (
        <div className="card lb-card">
          {items.slice(3).map((e) => (
            <Link key={e.user.id} to={`/u/${e.user.uid}`} className={`lb-row ${e.user.id === me.id ? 'me' : ''}`}>
              <span className="rank">{num(e.rank, lang)}</span>
              <Avatar name={e.user.username} src={e.user.avatarThumbUrl} size={42} frame={e.user.frame} />
              <div className="grow" style={{ minWidth: 0 }}>
                <b style={{ display: 'block' }}><PlayerName name={e.user.username} verified={e.user.verified} premium={e.user.premium} /></b>
                <p className="xs muted">{t(`${e.games} games`, `${num(e.games, lang)}টি খেলা`)}</p>
              </div>
              <b className="num">{num(e.score, lang)} <small className="muted">{t('wins', 'জয়')}</small></b>
            </Link>
          ))}
        </div>
        )}
        </>
      )}
    </>
  );
}

/** "Top N this month get free premium" (N is set in the admin panel). */
function RewardBanner({ top, onOpen, active }: { top: number; onOpen: () => void; active: boolean }) {
  const t = useT();
  const lang = useLang();
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const days = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 86400000));
  return (
    <button type="button" className="reward-strip" onClick={onOpen} disabled={active} aria-label={t('Monthly reward', 'মাসিক পুরস্কার')}>
      <Icon name="crown" size={18} />
      <span className="grow">{t(`Top ${top} this month win Premium`, `এই মাসের সেরা ${num(top, lang)} জন পাবে ফ্রি প্রিমিয়াম`)}</span>
      <small>{t(`${days}d left`, `${num(days, lang)} দিন বাকি`)}</small>
      {!active && <Icon name="chevron" size={16} />}
    </button>
  );
}

export default function Rank() {
  const t = useT();
  const lang = useLang();
  const [params, setParams] = useSearchParams();
  const game = params.get('game') === 'ludo' ? 'ludo' : 'quiz';
  const scope = params.get('tab') ?? 'global';
  const rewardTop = useConfig().data?.monthlyPremiumTop ?? 0;
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
        <div className="game-switch" role="tablist" aria-label={t('Game', 'গেম')}>
          <button role="tab" aria-selected={game === 'quiz'} onClick={() => setParams({ tab: scope }, { replace: true })}><Icon name="brain" /> {t('Quiz', 'কুইজ')}</button>
          <button role="tab" aria-selected={game === 'ludo'} onClick={() => setParams({ game: 'ludo' }, { replace: true })}><Icon name="gamepad" /> {t('Ludo', 'লুডু')}</button>
        </div>
        {rewardTop > 0 && <RewardBanner top={rewardTop} active={game === 'quiz' && scope === 'monthly'} onOpen={() => setParams({ tab: 'monthly' }, { replace: true })} />}
        {game === 'ludo' ? (
          <LudoRank />
        ) : (
        <>
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
            <span className="grow" style={{ minWidth: 0 }}>
              <b>{t('Your rank', 'আপনার অবস্থান')}</b>
              {scope === 'monthly' && rewardTop > 0 && (
                <small className="my-rank-hint">
                  {myRank.rank <= rewardTop
                    ? t('You are in the premium reward zone!', 'আপনি প্রিমিয়াম পুরস্কারের তালিকায় আছেন!')
                    : items[rewardTop - 1]
                      ? t(`${Math.max(1, items[rewardTop - 1].score - myRank.score + 1)} more to reach the top ${rewardTop}`, `সেরা ${num(rewardTop, lang)}-এ যেতে আর ${num(Math.max(1, items[rewardTop - 1].score - myRank.score + 1), lang)} পয়েন্ট`)
                      : null}
                </small>
              )}
            </span>
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
            {top.length > 0 && <Podium top={top} />}
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
                  <Fragment key={e.user.id}>
                  <Link to={`/u/${e.user.uid}`} className={`lb-row ${e.user.id === me.id ? 'me' : ''}${scope === 'monthly' && e.rank <= rewardTop ? ' prize' : ''}`}>
                    <span className="rank">{num(e.rank, lang)}</span>
                    <Avatar name={e.user.username} src={e.user.avatarThumbUrl} size={42} frame={e.user.frame} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <b style={{ display: 'block' }}><PlayerName name={e.user.username} verified={e.user.verified} premium={e.user.premium} /></b>
                      <p className="xs muted">{t('Lv', 'লেভেল')} {num(e.user.level, lang)}{e.wins ? t(` · ${e.wins} wins`, ` · ${num(e.wins, lang)} জয়`) : ''}</p>
                    </div>
                    {scope === 'monthly' && e.rank <= rewardTop && <span className="prize-chip"><Icon name="crown" size={13} /> {t('Premium', 'প্রিমিয়াম')}</span>}
                    <b className="num">{num(e.score, lang)}</b>
                  </Link>
                  {scope === 'monthly' && rewardTop > 3 && e.rank === rewardTop && <div className="prize-line"><span>{t(`Top ${rewardTop} win Premium`, `সেরা ${num(rewardTop, lang)} জন প্রিমিয়াম পাবে`)}</span></div>}
                  </Fragment>
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
        </>
        )}
      </div>
    </PullToRefresh>
  );
}
