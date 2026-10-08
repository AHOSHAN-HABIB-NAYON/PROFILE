import { useInfiniteQuery } from '@tanstack/react-query';
import { MODES } from '@quizwar/shared';
import { Link } from 'react-router';
import { PageHeader } from '../components/AppShell';
import { Empty, Skeleton } from '../components/Feedback';
import { api } from '../lib/api';

const RESULT: Record<string, [string, string]> = { win: ['Victory', 'success'], loss: ['Defeat', 'danger'], draw: ['Draw', 'accent'], abandoned: ['Left', 'warning'], completed: ['Completed', 'primary'] };

export default function History() {
  const q = useInfiniteQuery({
    queryKey: ['history'],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => (await api<{ items: any[] }>(`/me/matches?page=${pageParam}&pageSize=20`)).items,
    getNextPageParam: (last, all) => (last.length === 20 ? all.length + 1 : undefined),
  });
  const items = q.data?.pages.flat() ?? [];
  return (
    <div className="page stack">
      <PageHeader title="Match history" back />
      {q.isLoading ? <Skeleton lines={6} /> : !items.length ? <Empty icon="📜" title="No matches yet" /> : (
        <div className="card list">
          {items.map((m) => {
            const [label, cls] = RESULT[m.result ?? 'completed'] ?? ['—', ''];
            const opp = m.players.filter((p: any) => p.team !== m.team).map((p: any) => p.name).join(', ');
            return (
              <Link key={m.id} to={`/review/${m.id}`} className="list-row link" style={{ color: 'var(--text)' }}>
                <span style={{ fontSize: 22 }} aria-hidden>{m.type === 'ai' ? '🤖' : m.type === 'daily' ? '📅' : m.type === 'solo' ? '🧠' : '⚔️'}</span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <b className="small">{MODES[m.mode as keyof typeof MODES]?.label ?? m.mode}{m.type === 'ai' && ' · AI'}{m.ranked && ' · Ranked'}</b>
                  <p className="xs muted ellipsis">{opp ? `vs ${opp} · ` : ''}{m.correct}/{m.answered} correct · {new Date(m.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="col" style={{ alignItems: 'flex-end', gap: 2 }}>
                  <span className={`chip ${cls}`}>{label}</span>
                  <span className="xs faint num">{m.score} pts{m.ratingAfter != null && m.ratingBefore != null ? ` · ${m.ratingAfter - m.ratingBefore >= 0 ? '+' : ''}${m.ratingAfter - m.ratingBefore}` : ''}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      {q.hasNextPage && <button className="btn soft block" onClick={() => void q.fetchNextPage()}>Load more</button>}
    </div>
  );
}
