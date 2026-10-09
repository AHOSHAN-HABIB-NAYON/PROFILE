import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { PageHeader } from '../components/AppShell';
import { Empty, ListSkeleton } from '../components/Feedback';
import { Icon, IconTile } from '../components/Icon';
import { PullToRefresh } from '../components/PullToRefresh';
import { api } from '../lib/api';
import { num, useLang, useT } from '../lib/i18n';
import { modeIcon, modeLabel } from '../lib/labels';

const RESULT: Record<string, [string, string, string]> = {
  win: ['Victory', 'জয়', 'success'],
  loss: ['Defeat', 'পরাজয়', 'danger'],
  draw: ['Draw', 'ড্র', 'accent'],
  abandoned: ['Left', 'ছেড়ে গেছেন', 'warning'],
  completed: ['Completed', 'সম্পন্ন', 'primary'],
};

export default function History() {
  const t = useT();
  const lang = useLang();
  const q = useInfiniteQuery({
    queryKey: ['history'],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => (await api<{ items: any[] }>(`/me/matches?page=${pageParam}&pageSize=20`)).items,
    getNextPageParam: (last, all) => (last.length === 20 ? all.length + 1 : undefined),
  });
  const items = q.data?.pages.flat() ?? [];
  return (
    <PullToRefresh onRefresh={() => q.refetch()}>
      <div className="page stack">
        <PageHeader title={t('Match history', 'ম্যাচ হিস্টোরি')} back />
        {q.isLoading ? (
          <ListSkeleton rows={6} />
        ) : !items.length ? (
          <Empty icon="history" tone="accent" title={t('No matches yet', 'এখনো কোনো ম্যাচ নেই')} body={t('Your battles will show up here with a full review.', 'আপনার খেলা ম্যাচগুলো রিভিউ সহ এখানে দেখাবে।')} action={<Link to="/battle" className="btn primary"><Icon name="swords" /> {t('Play now', 'এখনই খেলুন')}</Link>} />
        ) : (
          <div className="card list">
            {items.map((m) => {
              const [en, bn, cls] = RESULT[m.result ?? 'completed'] ?? ['—', '—', ''];
              const opp = m.players.filter((p: any) => p.team !== m.team).map((p: any) => p.name).join(', ');
              const delta = m.ratingAfter != null && m.ratingBefore != null ? m.ratingAfter - m.ratingBefore : null;
              return (
                <Link key={m.id} to={`/review/${m.id}`} className="list-row link" style={{ color: 'var(--text)' }}>
                  <IconTile name={modeIcon(m.mode, m.type)} tone={cls === 'success' ? 'success' : cls === 'danger' ? 'danger' : 'primary'} size={42} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <b className="small">{modeLabel(m.mode)}{m.type === 'ai' && ' · AI'}{m.ranked && t(' · Ranked', ' · র‍্যাংকড')}</b>
                    <p className="xs muted ellipsis">
                      {opp ? t(`vs ${opp} · `, `বনাম ${opp} · `) : ''}
                      {t(`${m.correct}/${m.answered} correct`, `${num(m.correct, lang)}/${num(m.answered, lang)} সঠিক`)} · {new Date(m.createdAt).toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB')}
                    </p>
                  </div>
                  <div className="col" style={{ alignItems: 'flex-end', gap: 2 }}>
                    <span className={`chip ${cls}`}>{t(en, bn)}</span>
                    <span className="xs faint num">
                      {num(m.score, lang)} {t('pts', 'পয়েন্ট')}
                      {delta != null ? ` · ${delta >= 0 ? '+' : ''}${num(delta, lang)}` : ''}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        {q.hasNextPage && (
          <button className="btn soft block" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
            {q.isFetchingNextPage ? <span className="spinner" /> : <Icon name="chevron-down" />} {t('Load more', 'আরও দেখুন')}
          </button>
        )}
      </div>
    </PullToRefresh>
  );
}
