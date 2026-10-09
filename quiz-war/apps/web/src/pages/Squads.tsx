import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { PageHeader } from '../components/AppShell';
import { Empty, ListSkeleton } from '../components/Feedback';
import { Icon, IconTile } from '../components/Icon';
import { PullToRefresh } from '../components/PullToRefresh';
import { Sheet } from '../components/Sheet';
import { api, friendlyError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { num, useLang, useT } from '../lib/i18n';
import { haptic } from '../lib/platform';
import { toast } from '../lib/toast';

export function SquadLogo({ url, size = 44 }: { url?: string | null; size?: number }) {
  return (
    <span className="squad-logo" style={{ width: size, height: size }}>
      {url ? <img src={url} alt="" /> : <Icon name="shield" size={Math.round(size * 0.5)} />}
    </span>
  );
}

export default function Squads() {
  const t = useT();
  const lang = useLang();
  const squadId = useAuth((s) => s.squadId);
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [create, setCreate] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['squads', q], queryFn: async () => (await api<{ items: any[] }>(`/squads?q=${encodeURIComponent(q)}&pageSize=30`)).items });
  const invites = useQuery({ queryKey: ['squad-invites'], queryFn: async () => (await api<{ items: any[] }>('/squads/invites')).items });

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      const r = await api<{ id: number }>('/squads', { body: { name: f.get('name'), tag: f.get('tag'), description: f.get('description') || null, isOpen: f.get('open') === 'on' } });
      await useAuth.getState().loadMe();
      haptic('success');
      nav(`/squads/${r.id}`);
    } catch (e2) {
      setErr(friendlyError(e2));
    }
  }

  return (
    <PullToRefresh onRefresh={() => Promise.all([list.refetch(), invites.refetch()])}>
      <div className="page stack">
        <PageHeader title={t('Squads', 'স্কোয়াড')} back action={!squadId && <button className="btn sm primary" onClick={() => setCreate(true)}><Icon name="plus" /> {t('Create', 'তৈরি করুন')}</button>} />
        {squadId && (
          <Link to={`/squads/${squadId}`} className="card tap feature-card" style={{ background: 'var(--primary-soft)' }}>
            <IconTile name="shield" tone="primary" size={46} />
            <b className="grow">{t('My squad', 'আমার স্কোয়াড')}</b>
            <Icon name="chevron" size={20} />
          </Link>
        )}
        {invites.data?.map((i) => (
          <div key={i.id} className="card req-card">
            <div className="row">
              <SquadLogo url={i.logoUrl} />
              <div className="grow"><b>{i.name}</b> <span className="chip">{i.tag}</span><p className="xs muted">{t('invited you to join', 'আপনাকে যোগ দিতে আমন্ত্রণ জানিয়েছে')}</p></div>
            </div>
            <div className="row mt">
              <button className="btn sm outline grow" onClick={() => void api(`/squads/invites/${i.id}/decline`, { method: 'POST' }).then(() => invites.refetch())}><Icon name="close" /> {t('Decline', 'বাতিল')}</button>
              <button
                className="btn sm success grow"
                onClick={async () => {
                  try {
                    await api(`/squads/invites/${i.id}/accept`, { method: 'POST' });
                    await useAuth.getState().loadMe();
                    nav(`/squads/${i.squadId}`);
                  } catch (e) {
                    toast.error(t('Could not join', 'যোগ দেওয়া যায়নি'), friendlyError(e));
                  }
                }}
              >
                <Icon name="check" /> {t('Join', 'যোগ দিন')}
              </button>
            </div>
          </div>
        ))}
        <div className="input-wrap">
          <Icon name="search" size={20} />
          <input className="input" placeholder={t('Search squads by name or tag', 'নাম বা ট্যাগ দিয়ে স্কোয়াড খুঁজুন')} aria-label={t('Search squads', 'স্কোয়াড খুঁজুন')} enterKeyHint="search" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {list.isLoading ? (
          <ListSkeleton rows={5} />
        ) : !list.data?.length ? (
          <Empty icon="shield" tone="cyan" title={t('No squads found', 'কোনো স্কোয়াড পাওয়া যায়নি')} body={t('Create one and invite your friends!', 'নতুন স্কোয়াড বানিয়ে বন্ধুদের আমন্ত্রণ জানান!')} />
        ) : (
          <div className="card list stagger">
            {list.data.map((s) => (
              <Link key={s.id} to={`/squads/${s.id}`} className="list-row link" style={{ color: 'var(--text)' }}>
                <SquadLogo url={s.logoUrl} />
                <div className="grow">
                  <b>{s.name}</b> <span className="chip">{s.tag}</span>
                  <p className="xs muted">
                    {num(s.memberCount, lang)}/{num(s.memberLimit, lang)} {t('members', 'সদস্য')} · {num(Number(s.xp), lang)} XP {s.isOpen ? '' : t('· invite only', '· শুধু আমন্ত্রণে')}
                  </p>
                </div>
                <Icon name="chevron" size={18} className="faint" />
              </Link>
            ))}
          </div>
        )}
        <Sheet open={create} onClose={() => setCreate(false)} title={t('Create a squad', 'স্কোয়াড তৈরি করুন')} icon="shield">
          <form className="col" onSubmit={submit}>
            {err && <p className="form-error"><Icon name="alert-circle" size={18} /> {err}</p>}
            <div className="field"><label htmlFor="sn">{t('Name', 'নাম')}</label><input id="sn" name="name" className="input" required minLength={3} maxLength={40} /></div>
            <div className="field"><label htmlFor="st">{t('Tag (2–6 letters)', 'ট্যাগ (২–৬ অক্ষর)')}</label><input id="st" name="tag" className="input" required minLength={2} maxLength={6} style={{ textTransform: 'uppercase' }} autoCapitalize="characters" spellCheck={false} /></div>
            <div className="field"><label htmlFor="sd">{t('Description', 'বিবরণ')}</label><textarea id="sd" name="description" className="input" maxLength={300} /></div>
            <label className="row small bold"><span className="switch"><input type="checkbox" role="switch" name="open" defaultChecked /></span> {t('Anyone can join', 'যে কেউ যোগ দিতে পারবে')}</label>
            <button className="btn primary block"><Icon name="check" /> {t('Create squad', 'স্কোয়াড তৈরি করুন')}</button>
          </form>
        </Sheet>
      </div>
    </PullToRefresh>
  );
}
