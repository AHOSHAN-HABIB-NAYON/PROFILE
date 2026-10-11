import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { PageHeader } from '../components/AppShell';
import { CategoryArt } from '../components/CategoryPlay';
import { Empty, ErrorBox, ListSkeleton } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { api } from '../lib/api';
import { num, useLang, useT } from '../lib/i18n';
import { haptic } from '../lib/platform';

type StudyData = {
  category: { id: number; name: string; nameBn: string | null; slug: string; icon: string; iconUrl: string | null; color: string | null };
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  items: { n: number; id: number; text: string; explanation: string | null; difficulty: string; imageUrl: string | null; options: string[]; correctIndex: number }[];
};

const LETTERS_BN = ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ'];
const LETTERS_EN = ['A', 'B', 'C', 'D', 'E', 'F'];

/** Page numbers with gaps: 1 … 4 5 [6] 7 8 … 20 */
function pageList(page: number, pages: number): (number | '…')[] {
  const set = new Set([1, pages, page - 2, page - 1, page, page + 1, page + 2].filter((p) => p >= 1 && p <= pages));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  sorted.forEach((p, i) => {
    if (i && p - sorted[i - 1]! > 1) out.push('…');
    out.push(p);
  });
  return out;
}

/** Read every question of a category with its correct answer — 30 per page. */
export default function Study() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const t = useT();
  const lang = useLang();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['study', id, page], queryFn: () => api<StudyData>(`/categories/${id}/study?page=${page}`, { auth: false }), placeholderData: (prev) => prev, staleTime: 5 * 60_000 });
  const d = q.data;
  const letters = lang === 'bn' ? LETTERS_BN : LETTERS_EN;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page]);

  const go = (p: number) => {
    if (!d || p < 1 || p > d.pages || p === page) return;
    haptic('tap');
    setParams({ page: String(p) });
  };

  const name = d ? (lang === 'bn' ? (d.category.nameBn ?? d.category.name) : d.category.name) : '';
  const pager = d && d.pages > 1 && (
    <nav className="pager" aria-label={t('Pages', 'পেজ')}>
      <button className="btn sm soft" disabled={page <= 1} onClick={() => go(page - 1)} aria-label={t('Previous page', 'আগের পেজ')}><Icon name="back" size={18} /></button>
      {pageList(page, d.pages).map((p, i) =>
        p === '…' ? <span key={`g${i}`} className="pager-gap">…</span> : (
          <button key={p} className={`pager-num${p === page ? ' on' : ''}`} aria-current={p === page ? 'page' : undefined} onClick={() => go(p)}>{num(p, lang)}</button>
        ),
      )}
      <button className="btn sm primary" disabled={page >= d.pages} onClick={() => go(page + 1)}>{t('Next', 'পরের')} <Icon name="chevron" size={18} /></button>
    </nav>
  );

  return (
    <div className="page stack study-page">
      <PageHeader title={t('Questions & answers', 'প্রশ্ন ও উত্তর')} back />
      {q.error && !d ? (
        <ErrorBox error={q.error} retry={q.refetch} />
      ) : !d ? (
        <ListSkeleton rows={6} />
      ) : (
        <>
          <section className="study-head" style={{ ['--cat' as string]: d.category.color ?? undefined }}>
            <CategoryArt c={{ ...(d.category as any), questionCount: d.total }} size={54} />
            <div className="grow">
              <b>{name}</b>
              <small>
                {t(`${d.total} questions · page ${page} of ${d.pages}`, `মোট ${num(d.total, lang)}টি প্রশ্ন · পেজ ${num(page, lang)}/${num(d.pages, lang)}`)}
              </small>
            </div>
            <button className="btn sm primary" onClick={() => (history.length > 1 ? nav(-1) : nav('/'))}><Icon name="swords" size={16} /> {t('Play', 'খেলুন')}</button>
          </section>
          {!d.items.length ? (
            <Empty icon="book" title={t('No questions yet', 'এখনো কোনো প্রশ্ন নেই')} />
          ) : (
            <ol className="study-list" start={d.items[0]!.n}>
              {d.items.map((it) => (
                <li key={it.id} className="study-q card">
                  <p className="sq-text"><span className="sq-n">{num(it.n, lang)}.</span> {it.text}</p>
                  {it.imageUrl && <img className="sq-img" src={it.imageUrl} alt="" loading="lazy" />}
                  <ul className="sq-opts">
                    {it.options.map((o, i) => (
                      <li key={i} className={i === it.correctIndex ? 'correct' : undefined}>
                        <span className="sq-letter">{letters[i]}</span>
                        <span className="grow">{o}</span>
                        {i === it.correctIndex && <Icon name="check-circle" size={18} />}
                      </li>
                    ))}
                  </ul>
                  {it.correctIndex >= 0 && (
                    <p className="sq-answer"><b>{t('Answer:', 'উত্তর:')}</b> {letters[it.correctIndex]}) {it.options[it.correctIndex]}</p>
                  )}
                  {it.explanation && <p className="sq-explain"><Icon name="info" size={15} /> {it.explanation}</p>}
                </li>
              ))}
            </ol>
          )}
          {pager}
        </>
      )}
    </div>
  );
}
