import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { PageHeader } from '../components/AppShell';
import { Avatar } from '../components/Avatar';
import { ErrorBox, Skeleton } from '../components/Feedback';
import { Sheet } from '../components/Sheet';
import { api, friendlyError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useGame } from '../lib/game';
import { uploadImage } from '../lib/image';
import { PUBLIC_WEB_URL, share } from '../lib/platform';
import { emit } from '../lib/socket';
import { toast } from '../lib/toast';
import { Icon, IconTile, type IconName } from '../components/Icon';
import { num, tr, useLang, useT } from '../lib/i18n';
import { haptic } from '../lib/platform';
import { SquadLogo } from './Squads';

const ROLE: Record<string, [string, string, IconName | null]> = { captain: ['Captain', 'ক্যাপ্টেন', 'crown'], officer: ['Officer', 'অফিসার', 'star'], member: ['Member', 'সদস্য', null] };

export default function SquadDetail() {
  const { id = '' } = useParams();
  const me = useAuth((s) => s.user)!;
  const mySquad = useAuth((s) => s.squadId);
  const nav = useNavigate();
  const t = useT();
  const lang = useLang();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['squad', id], queryFn: () => api(`/squads/${id}`) });
  const friends = useQuery({ queryKey: ['friends'], queryFn: async () => (await api<{ items: any[] }>('/friends')).items });
  const [invite, setInvite] = useState(false);
  const [manage, setManage] = useState<any>(null);

  if (isLoading) return <div className="page"><Skeleton kind="card" lines={2} /></div>;
  if (error || !data) return <div className="page"><ErrorBox error={error} retry={refetch} /></div>;
  const myRole = data.members.find((m: any) => m.user.id === me.id)?.role as string | undefined;
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) (haptic('success'), toast.success(ok, undefined, 'check-circle'));
      void refetch();
      await useAuth.getState().loadMe();
    } catch (e) {
      toast.error(tr('Something went wrong', 'কিছু একটা সমস্যা হয়েছে'), friendlyError(e));
    }
  };
  const squadBattle = async (mode: 'duo' | 'trio' | 'squad') => {
    try {
      const r = await emit('room:create', { mode, squadId: data.id });
      useGame.getState().reset(r.matchId);
      void share({ title: tr('Squad battle', 'স্কোয়াড ব্যাটল'), text: tr(`${data.name} squad battle — join the War Room!`, `${data.name} স্কোয়াড ব্যাটল — ওয়ার রুমে যোগ দাও!`), url: `${PUBLIC_WEB_URL}/war-room/${r.matchId}` });
      nav(`/war-room/${r.matchId}`);
    } catch (e) {
      toast.error(tr('Could not create room', 'রুম তৈরি করা যায়নি'), friendlyError(e));
    }
  };

  return (
    <div className="page stack">
      <PageHeader title={t('Squad', 'স্কোয়াড')} back />
      <section className="profile-head">
        <label style={{ cursor: myRole === 'captain' ? 'pointer' : 'default', position: 'relative' }} aria-label={myRole === 'captain' ? t('Change squad logo', 'স্কোয়াড লোগো বদলান') : undefined}>
          <SquadLogo url={data.logoUrl} size={96} />
          {myRole === 'captain' && <span className="pc-edit"><Icon name="camera" size={16} /></span>}
          {myRole === 'captain' && <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && void run(() => uploadImage(`/squads/${data.id}/logo`, e.target.files![0], api), t('Logo updated', 'লোগো আপডেট হয়েছে'))} />}
        </label>
        <h1>{data.name} <span className="chip">{data.tag}</span></h1>
        {data.description && <p className="small muted">{data.description}</p>}
        <div className="quick-stats" style={{ width: '100%' }}>
          <div><b>#{num(data.squadRank, lang)}</b><span>{t('Squad rank', 'স্কোয়াড র‍্যাংক')}</span></div>
          <div><b className="num">{num(data.xp, lang)}</b><span>{t('Squad XP', 'স্কোয়াড XP')}</span></div>
          <div><b>{num(data.memberCount, lang)}/{num(data.memberLimit, lang)}</b><span>{t('Members', 'সদস্য')}</span></div>
        </div>
      </section>
      {!myRole && !mySquad && data.isOpen && <button className="btn primary lg block" onClick={() => void run(() => api(`/squads/${data.id}/join`, { method: 'POST' }), t('Welcome to the squad!', 'স্কোয়াডে স্বাগতম!'))}><Icon name="user-plus" /> {t('Join squad', 'স্কোয়াডে যোগ দিন')}</button>}
      {myRole && (
        <section className="card">
          <div className="card-title"><h3><IconTile name="swords" tone="danger" size={30} /> {t('Squad battle room', 'স্কোয়াড ব্যাটল রুম')}</h3></div>
          <p className="xs muted mb">{t('Create a War Room for squad members. Squad Wars between squads are coming soon.', 'স্কোয়াড সদস্যদের জন্য ওয়ার রুম তৈরি করুন। স্কোয়াড বনাম স্কোয়াড যুদ্ধ শীঘ্রই আসছে।')}</p>
          <div className="row">
            <button className="btn soft grow" onClick={() => void squadBattle('duo')}>2v2</button>
            <button className="btn soft grow" onClick={() => void squadBattle('trio')}>3v3</button>
            <button className="btn soft grow" onClick={() => void squadBattle('squad')}>4v4</button>
          </div>
        </section>
      )}
      <section className="card">
        <div className="card-title"><h3><Icon name="users" size={18} /> {t('Members', 'সদস্য')}</h3>{(myRole === 'captain' || myRole === 'officer') && <button className="btn sm soft" onClick={() => setInvite(true)}><Icon name="user-plus" /> {t('Invite', 'আমন্ত্রণ')}</button>}</div>
        {data.members.map((m: any) => (
          <div key={m.user.id} className="list-row">
            <Link to={`/u/${m.user.uid}`}><Avatar name={m.user.username} src={m.user.avatarThumbUrl} size={40} /></Link>
            <div className="grow"><b>{m.user.username}</b><p className="xs muted row gap-sm">{ROLE[m.role][2] && <Icon name={ROLE[m.role][2]!} size={13} />}{t(ROLE[m.role][0], ROLE[m.role][1])} · {num(m.contributedXp, lang)} XP</p></div>
            {myRole === 'captain' && m.user.id !== me.id && <button className="btn sm ghost" onClick={() => setManage(m)}>{t('Manage', 'পরিচালনা')}</button>}
            {myRole === 'officer' && m.role === 'member' && <button className="btn sm ghost" onClick={() => void run(() => api(`/squads/${data.id}/members/${m.user.id}`, { method: 'DELETE' }), t('Member removed', 'সদস্য বাদ দেওয়া হয়েছে'))}>{t('Remove', 'বাদ দিন')}</button>}
          </div>
        ))}
      </section>
      {myRole && <button className="btn ghost block" style={{ color: 'var(--danger)' }} onClick={() => void run(() => api('/squads/leave', { method: 'POST' }), t('You left the squad', 'আপনি স্কোয়াড ছেড়েছেন')).then(() => nav('/squads'))}><Icon name="door" /> {t('Leave squad', 'স্কোয়াড ছাড়ুন')}</button>}

      <Sheet open={invite} onClose={() => setInvite(false)} title={t('Invite friends', 'বন্ধুদের আমন্ত্রণ')} icon="user-plus">
        <div className="list">
          {friends.data?.length ? friends.data.map((f) => (
            <div key={f.user.id} className="list-row"><Avatar name={f.user.username} src={f.user.avatarThumbUrl} size={36} /><b className="grow">{f.user.username}</b>
              <button className="btn sm soft" onClick={() => void run(() => api(`/squads/${data.id}/invite`, { body: { userId: f.user.id } }), t('Invitation sent', 'আমন্ত্রণ পাঠানো হয়েছে'))}>{t('Invite', 'আমন্ত্রণ')}</button></div>
          )) : <p className="muted small">{t('Add friends first to invite them.', 'আমন্ত্রণ জানাতে আগে বন্ধু যোগ করুন।')}</p>}
        </div>
      </Sheet>
      <Sheet open={!!manage} onClose={() => setManage(null)} title={manage?.user.username ?? ''}>
        {manage && (
          <div className="col">
            {manage.role !== 'officer' && <button className="btn outline block" onClick={() => void run(() => api(`/squads/${data.id}/members/${manage.user.id}`, { method: 'PATCH', body: { role: 'officer' } }), t('Promoted to officer', 'অফিসার করা হয়েছে')).then(() => setManage(null))}><Icon name="star" /> {t('Make officer', 'অফিসার করুন')}</button>}
            {manage.role === 'officer' && <button className="btn outline block" onClick={() => void run(() => api(`/squads/${data.id}/members/${manage.user.id}`, { method: 'PATCH', body: { role: 'member' } }), t('Role updated', 'ভূমিকা বদলানো হয়েছে')).then(() => setManage(null))}>{t('Make member', 'সদস্য করুন')}</button>}
            <button className="btn outline block" onClick={() => void run(() => api(`/squads/${data.id}/members/${manage.user.id}`, { method: 'PATCH', body: { role: 'captain' } }), t('Captain transferred', 'ক্যাপ্টেন বদলানো হয়েছে')).then(() => setManage(null))}><Icon name="crown" /> {t('Transfer captaincy', 'ক্যাপ্টেনসি দিন')}</button>
            <button className="btn danger block" onClick={() => void run(() => api(`/squads/${data.id}/members/${manage.user.id}`, { method: 'DELETE' }), t('Member removed', 'সদস্য বাদ দেওয়া হয়েছে')).then(() => setManage(null))}><Icon name="trash" /> {t('Remove from squad', 'স্কোয়াড থেকে বাদ দিন')}</button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
