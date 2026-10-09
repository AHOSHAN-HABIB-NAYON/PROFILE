import { leagueForRating, REPORT_REASONS } from '@quizwar/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { PageHeader } from '../components/AppShell';
import { Avatar, statusLabel } from '../components/Avatar';
import { ChallengeSheet } from '../components/ChallengeSheet';
import { Empty, Skeleton } from '../components/Feedback';
import { useLeagues } from '../components/Game';
import { achievementIcon, Icon, IconTile } from '../components/Icon';
import { LeagueEmblem } from '../components/LeagueEmblem';
import { Sheet } from '../components/Sheet';
import { BrandMark } from '../components/Splash';
import { api, friendlyError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { num, useLang, useT } from '../lib/i18n';
import { reasonLabel } from '../lib/labels';
import { haptic } from '../lib/platform';
import { toast } from '../lib/toast';
import { StatsGrid } from './Profile';
import { SquadLogo } from './Squads';
import { VerifiedBadge } from '../components/Verified';

export default function PublicProfile() {
  const t = useT();
  const lang = useLang();
  const { uid = '' } = useParams();
  const authed = useAuth((s) => s.status === 'authed');
  const me = useAuth((s) => s.user);
  const leagues = useLeagues();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [challenge, setChallenge] = useState(false);
  const [more, setMore] = useState(false);
  const [report, setReport] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ['profile', uid.toUpperCase()], queryFn: () => api(`/users/${encodeURIComponent(uid)}`) });

  if (isLoading) return <div className="page"><Skeleton kind="card" lines={2} /></div>;
  if (error || !data)
    return (
      <div className="page">
        <Empty
          icon="search"
          title={t('Player not found', 'প্লেয়ার পাওয়া যায়নি')}
          body={t('Check the UID and try again.', 'UID ঠিক আছে কিনা দেখে আবার চেষ্টা করুন।')}
          action={<Link className="btn primary" to={authed ? '/friends?tab=add' : '/login'}><Icon name="arrow-left" /> {t('Go back', 'ফিরে যান')}</Link>}
        />
      </div>
    );
  const self = me?.id === data.user.id;
  const rel = data.relation;
  const league = leagueForRating(data.user.rating, leagues);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      haptic('success');
      toast.success(ok, undefined, 'check-circle');
      void qc.invalidateQueries({ queryKey: ['profile', uid.toUpperCase()] });
      void qc.invalidateQueries({ queryKey: ['friends'] });
    } catch (e) {
      toast.error(t('Something went wrong', 'কিছু একটা সমস্যা হয়েছে'), friendlyError(e));
    }
  };

  return (
    <div className="page stack">
      {authed ? (
        <PageHeader
          title={t('Player', 'প্লেয়ার')}
          back
          action={!self ? <button className="btn icon sm ghost" aria-label={t('More options', 'আরও অপশন')} onClick={() => setMore(true)}><Icon name="list" /></button> : undefined}
        />
      ) : (
        <header className="public-brand">
          <BrandMark size={36} animate={false} />
          <b>QUIZ WAR<small>BANGLADESH</small></b>
        </header>
      )}
      <section className="profile-card">
        <div className="pc-band" />
        <div className="pc-body">
          <div className="pc-avatar"><Avatar name={data.user.username} src={data.user.avatarUrl} size={100} frame={data.user.frame} status={rel?.status} /></div>
          <h1 className="name-with-badge">{data.user.username}{data.user.verified && <VerifiedBadge size={22} />}</h1>
          {data.user.title && <span className="chip accent">{data.user.title}</span>}
          <span className="uid-badge">{data.user.uid}</span>
          {rel && <p className={`xs status-text s-${rel.status}`}>{statusLabel(rel.status)}</p>}
          {data.bio && <p className="small muted pc-bio">{data.bio}</p>}
          <div className="pc-league">
            <LeagueEmblem league={league.key} size={46} />
            <div className="grow">
              <b>{league.name} {t('League', 'লীগ')}</b>
              <small>{num(data.user.rating, lang)} {t('rating', 'রেটিং')} · {t('Level', 'লেভেল')} {num(data.user.level, lang)}</small>
            </div>
          </div>
          {data.squad && (
            <Link to={`/squads/${data.squad.id}`} className="chip primary" style={{ height: 32 }}>
              <SquadLogo url={data.squad.logoUrl} size={20} /> {data.squad.name} [{data.squad.tag}]
            </Link>
          )}
        </div>
      </section>

      {!authed ? (
        <Link to={`/intro?next=${encodeURIComponent(`/u/${data.user.uid}`)}`} className="btn primary lg block">
          <Icon name="swords" /> {t(`Join QUIZ WAR to challenge ${data.user.username}`, `${data.user.username}-কে চ্যালেঞ্জ করতে QUIZ WAR-এ যোগ দিন`)}
        </Link>
      ) : (
        !self && (
          <div className="row">
            <button className="btn primary grow" disabled={!rel?.available} onClick={() => (haptic('tap'), setChallenge(true))}>
              <Icon name="swords" /> {t('Challenge', 'চ্যালেঞ্জ')}
            </button>
            {rel?.friend ? (
              <button className="btn outline grow" disabled><Icon name="user-check" /> {t('Friends', 'বন্ধু')}</button>
            ) : (
              <button className="btn soft grow" onClick={() => void act(() => api('/friends/requests', { body: { userId: data.user.id } }), t('Friend request sent', 'ফ্রেন্ড রিকোয়েস্ট পাঠানো হয়েছে'))}>
                <Icon name="user-plus" /> {t('Add friend', 'বন্ধু যোগ করুন')}
              </button>
            )}
          </div>
        )
      )}
      {authed && !self && !rel?.available && <p className="xs muted center">{t('This player isn’t available for battle right now.', 'এই প্লেয়ার এখন ব্যাটলের জন্য প্রস্তুত নন।')}</p>}

      <StatsGrid stats={data.stats} />
      {data.achievements.length > 0 && (
        <section className="card">
          <div className="card-title"><h3><Icon name="award" size={18} /> {t('Achievements', 'অ্যাচিভমেন্ট')}</h3></div>
          <div className="badges">
            {data.achievements.map((a: any) => (
              <div key={a.key} className="badge-tile unlocked" title={a.description}>
                <span className="b-medal"><Icon name={achievementIcon(a)} size={26} /></span>
                <b>{a.name}</b>
              </div>
            ))}
          </div>
        </section>
      )}

      {authed && <ChallengeSheet target={challenge ? data.user : null} onClose={() => setChallenge(false)} />}
      <Sheet open={more} onClose={() => setMore(false)} title={data.user.username}>
        <section className="menu">
          {rel?.friend && (
            <button className="menu-row" onClick={() => void act(() => api(`/friends/${data.user.id}`, { method: 'DELETE' }), t('Friend removed', 'বন্ধু তালিকা থেকে বাদ')).then(() => setMore(false))}>
              <IconTile name="user-x" tone="warning" size={40} /><span className="m-text"><b>{t('Remove friend', 'বন্ধু তালিকা থেকে বাদ দিন')}</b></span>
            </button>
          )}
          <button className="menu-row" onClick={() => (setMore(false), setReport(true))}>
            <IconTile name="flag" tone="warning" size={40} /><span className="m-text"><b>{t('Report player', 'রিপোর্ট করুন')}</b><small>{t('Cheating, abuse or inappropriate content', 'চিটিং, গালাগালি বা আপত্তিকর কিছু')}</small></span>
          </button>
          <button className="menu-row danger" onClick={() => void act(() => api('/blocks', { body: { userId: data.user.id } }), t('Player blocked', 'প্লেয়ার ব্লক করা হয়েছে')).then(() => nav('/friends'))}>
            <IconTile name="ban" tone="danger" size={40} /><span className="m-text"><b>{t('Block player', 'ব্লক করুন')}</b><small>{t('They can’t find, invite or challenge you', 'সে আপনাকে খুঁজে পাবে না বা চ্যালেঞ্জ করতে পারবে না')}</small></span>
          </button>
        </section>
      </Sheet>
      <Sheet open={report} onClose={() => setReport(false)} title={t('Report player', 'রিপোর্ট করুন')} icon="flag">
        <form
          className="col"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            await act(() => api('/reports', { body: { targetUid: data.user.uid, reason: f.get('reason'), details: String(f.get('details') || '') || undefined } }), t('Report sent — thank you', 'রিপোর্ট পাঠানো হয়েছে — ধন্যবাদ'));
            setReport(false);
          }}
        >
          <div className="field">
            <label htmlFor="r1">{t('Reason', 'কারণ')}</label>
            <select id="r1" name="reason" className="input">{REPORT_REASONS.map((r) => <option key={r} value={r}>{reasonLabel(r)}</option>)}</select>
          </div>
          <div className="field">
            <label htmlFor="r2">{t('Details (optional)', 'বিস্তারিত (ঐচ্ছিক)')}</label>
            <textarea id="r2" name="details" className="input" maxLength={1000} />
          </div>
          <button className="btn danger block"><Icon name="flag" /> {t('Send report', 'রিপোর্ট পাঠান')}</button>
        </form>
      </Sheet>
    </div>
  );
}
