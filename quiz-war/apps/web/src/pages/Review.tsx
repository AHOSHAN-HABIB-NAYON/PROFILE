import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { PageHeader } from '../components/AppShell';
import { Empty, ErrorBox, Skeleton } from '../components/Feedback';
import { Sheet } from '../components/Sheet';
import { api, friendlyError } from '../lib/api';
import { useGame } from '../lib/game';
import { emit } from '../lib/socket';
import { toast } from '../lib/toast';
import { REPORT_REASONS } from '@quizwar/shared';

export default function Review() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [filter, setFilter] = useState<'all' | 'wrong'>('all');
  const [report, setReport] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['review', id], queryFn: async () => (await api<{ items: any[] }>(`/matches/${id}/review`)).items });

  const practice = async () => {
    try {
      const r = await emit('solo:start', { mode: 'solo', practiceMistakes: true });
      useGame.getState().reset(r.matchId);
      nav(`/match/${r.matchId}`);
    } catch (e) {
      toast.error('Could not start practice', friendlyError(e));
    }
  };

  const items = (data ?? []).filter((q) => filter === 'all' || !q.correct);
  return (
    <div className="page stack">
      <PageHeader title="Review answers" back action={<button className="btn sm ghost" onClick={() => setReport(true)}>Report</button>} />
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={filter === 'all'} onClick={() => setFilter('all')}>All ({data?.length ?? 0})</button>
        <button role="tab" aria-selected={filter === 'wrong'} onClick={() => setFilter('wrong')}>Mistakes ({data?.filter((q) => !q.correct).length ?? 0})</button>
      </div>
      {isLoading ? <Skeleton kind="card" lines={3} /> : error ? <ErrorBox error={error} retry={refetch} /> : items.length === 0 ? (
        <Empty icon="🎉" title={filter === 'wrong' ? 'No mistakes!' : 'Nothing to review'} />
      ) : (
        items.map((q) => (
          <article key={q.index} className="card">
            <div className="row between mb"><span className="chip">Q{q.index + 1}</span><span className={`chip ${q.correct ? 'success' : 'danger'}`}>{q.correct ? `✓ +${q.points}` : q.yourIndex == null ? '⌛ No answer' : '✗ Wrong'}</span></div>
            <p className="bold bn">{q.text}</p>
            {q.imageUrl && <img src={q.imageUrl} alt="" style={{ maxHeight: 160, marginTop: 8, borderRadius: 10 }} />}
            <div className="col mt" style={{ gap: 6 }}>
              {q.options.map((o: string, i: number) => (
                <div key={i} className={`option ${i === q.correctIndex ? 'correct' : i === q.yourIndex ? 'wrong' : ''}`} style={{ minHeight: 44, animation: 'none', cursor: 'default' }}>
                  <span className="o-key">{'ABCD'[i]}</span><span className="grow">{o}</span>
                  {i === q.yourIndex && <span className="xs bold">You</span>}
                </div>
              ))}
            </div>
            {q.explanation && <div className="reveal-explain">📘 {q.explanation}</div>}
          </article>
        ))
      )}
      {!!data?.some((q) => !q.correct) && <button className="btn primary lg block" onClick={() => void practice()}>🔁 Practice Mistakes</button>}
      <Sheet open={report} onClose={() => setReport(false)} title="Report this match">
        <form className="col" onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            await api('/reports', { body: { matchId: id, reason: f.get('reason'), details: String(f.get('details') || '') || undefined } });
            toast.success('Report sent', 'Thanks — our moderators will review it.');
            setReport(false);
          } catch (err) {
            toast.error('Could not send report', friendlyError(err));
          }
        }}>
          <div className="field"><label htmlFor="rr">Reason</label>
            <select id="rr" name="reason" className="input" defaultValue="cheating">{REPORT_REASONS.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}</select>
          </div>
          <div className="field"><label htmlFor="rd">Details (optional)</label><textarea id="rd" name="details" className="input" maxLength={1000} /></div>
          <button className="btn danger block">Send report</button>
        </form>
      </Sheet>
    </div>
  );
}
