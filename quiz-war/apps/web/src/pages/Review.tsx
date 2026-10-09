import { REPORT_REASONS } from '@quizwar/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { PageHeader } from '../components/AppShell';
import { Empty, ErrorBox, Skeleton } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { api, friendlyError } from '../lib/api';
import { useGame } from '../lib/game';
import { num, useLang, useT } from '../lib/i18n';
import { reasonLabel } from '../lib/labels';
import { emit } from '../lib/socket';
import { toast } from '../lib/toast';

export default function Review() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const t = useT();
  const lang = useLang();
  const [filter, setFilter] = useState<'all' | 'wrong'>('all');
  const [report, setReport] = useState(false);
  const [sending, setSending] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['review', id], queryFn: async () => (await api<{ items: any[] }>(`/matches/${id}/review`)).items });

  const practice = async () => {
    try {
      const r = await emit('solo:start', { mode: 'solo', practiceMistakes: true });
      useGame.getState().reset(r.matchId);
      nav(`/match/${r.matchId}`);
    } catch (e) {
      toast.error(t('Could not start practice', 'অনুশীলন শুরু করা যায়নি'), friendlyError(e));
    }
  };

  const mistakes = data?.filter((q) => !q.correct).length ?? 0;
  const items = (data ?? []).filter((q) => filter === 'all' || !q.correct);
  return (
    <div className="page stack">
      <PageHeader
        title={t('Review answers', 'উত্তর পর্যালোচনা')}
        back
        action={
          <button className="btn sm ghost" onClick={() => setReport(true)} aria-label={t('Report this match', 'ম্যাচটি রিপোর্ট করুন')}>
            <Icon name="flag" /> {t('Report', 'রিপোর্ট')}
          </button>
        }
      />
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={filter === 'all'} onClick={() => setFilter('all')}><Icon name="list" /> {t('All', 'সব')} ({num(data?.length ?? 0, lang)})</button>
        <button role="tab" aria-selected={filter === 'wrong'} onClick={() => setFilter('wrong')}><Icon name="x-circle" /> {t('Mistakes', 'ভুলগুলো')} ({num(mistakes, lang)})</button>
      </div>
      {isLoading ? (
        <Skeleton kind="card" lines={3} />
      ) : error ? (
        <ErrorBox error={error} retry={refetch} />
      ) : items.length === 0 ? (
        <Empty icon={filter === 'wrong' ? 'party' : 'book'} tone="success" title={filter === 'wrong' ? t('No mistakes!', 'একটিও ভুল নেই!') : t('Nothing to review', 'দেখার মতো কিছু নেই')} />
      ) : (
        items.map((q) => (
          <article key={q.index} className="card review-card">
            <div className="row between mb">
              <span className="chip">{t('Q', 'প্রশ্ন')} {num(q.index + 1, lang)}</span>
              <span className={`chip ${q.correct ? 'success' : q.yourIndex == null ? 'warning' : 'danger'}`}>
                {q.correct ? (
                  <><Icon name="check-circle" size={14} /> +{num(q.points, lang)}</>
                ) : q.yourIndex == null ? (
                  <><Icon name="hourglass" size={14} /> {t('No answer', 'উত্তর দেননি')}</>
                ) : (
                  <><Icon name="x-circle" size={14} /> {t('Wrong', 'ভুল')}</>
                )}
              </span>
            </div>
            <p className="bold bn">{q.text}</p>
            {q.imageUrl && <img src={q.imageUrl} alt="" loading="lazy" style={{ maxHeight: 160, marginTop: 8, borderRadius: 10 }} />}
            <div className="col mt" style={{ gap: 6 }}>
              {q.options.map((o: string, i: number) => (
                <div key={i} className={`option ${i === q.correctIndex ? 'correct' : i === q.yourIndex ? 'wrong' : ''}`} style={{ minHeight: 44, animation: 'none', cursor: 'default' }}>
                  <span className="o-key">{'ABCD'[i]}</span>
                  <span className="grow">{o}</span>
                  {i === q.correctIndex && <Icon name="check" size={18} />}
                  {i === q.yourIndex && <span className="xs bold">{t('You', 'আপনি')}</span>}
                </div>
              ))}
            </div>
            {q.explanation && (
              <div className="reveal-explain row top gap-sm">
                <Icon name="bulb" size={18} style={{ flex: 'none', marginTop: 2 }} />
                <span>{q.explanation}</span>
              </div>
            )}
          </article>
        ))
      )}
      {mistakes > 0 && (
        <button className="btn primary lg block" onClick={() => void practice()}>
          <Icon name="rotate" /> {t('Practice mistakes', 'ভুলগুলো অনুশীলন করুন')}
        </button>
      )}
      <Sheet open={report} onClose={() => setReport(false)} title={t('Report this match', 'ম্যাচটি রিপোর্ট করুন')} icon="flag">
        <form
          className="col"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setSending(true);
            try {
              await api('/reports', { body: { matchId: id, reason: f.get('reason'), details: String(f.get('details') || '') || undefined } });
              toast.success(t('Report sent', 'রিপোর্ট পাঠানো হয়েছে'), t('Thanks — our moderators will review it.', 'ধন্যবাদ — আমাদের মডারেটররা বিষয়টি দেখবেন।'), 'shield-check');
              setReport(false);
            } catch (err) {
              toast.error(t('Could not send report', 'রিপোর্ট পাঠানো যায়নি'), friendlyError(err));
            } finally {
              setSending(false);
            }
          }}
        >
          <div className="field">
            <label htmlFor="rr">{t('Reason', 'কারণ')}</label>
            <select id="rr" name="reason" className="input" defaultValue="cheating">
              {REPORT_REASONS.map((r) => <option key={r} value={r}>{reasonLabel(r)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rd">{t('Details (optional)', 'বিস্তারিত (ঐচ্ছিক)')}</label>
            <textarea id="rd" name="details" className="input" maxLength={1000} />
          </div>
          <button className="btn danger block" disabled={sending}>{sending ? <span className="spinner" /> : <Icon name="flag" />} {t('Send report', 'রিপোর্ট পাঠান')}</button>
        </form>
      </Sheet>
    </div>
  );
}
