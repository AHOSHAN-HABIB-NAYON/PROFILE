import { leagueForRating } from '@quizwar/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '../components/AppShell';
import { Avatar } from '../components/Avatar';
import { Empty, N, Skeleton } from '../components/Feedback';
import { LevelBar, useLeagues } from '../components/Game';
import { achievementIcon, categoryIcon, Icon, IconTile, type IconName } from '../components/Icon';
import { LeagueEmblem } from '../components/LeagueEmblem';
import { ProfileCover } from '../components/ProfileCover';
import { PullToRefresh } from '../components/PullToRefresh';
import { QrCode } from '../components/Qr';
import { Sheet } from '../components/Sheet';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { num, useLang, useT } from '../lib/i18n';
import { haptic, share } from '../lib/platform';
import { profileLink } from '../lib/qr';
import { toast } from '../lib/toast';
import { VerifiedBadge } from '../components/Verified';

export function StatsGrid({ stats }: { stats: any }) {
  const t = useT();
  const items: [IconName, 'primary' | 'success' | 'danger' | 'accent' | 'warning' | 'cyan' | 'coin', string, string | number][] = [
    ['gamepad', 'primary', t('Games', 'ম্যাচ'), stats.totalGames],
    ['trophy', 'success', t('Wins', 'জয়'), stats.wins],
    ['x-circle', 'danger', t('Losses', 'হার'), stats.losses],
    ['target', 'accent', t('Accuracy', 'সঠিকতা'), `${stats.accuracy}%`],
    ['star', 'warning', t('Best score', 'সেরা স্কোর'), stats.bestScore],
    ['fire', 'warning', t('Win streak', 'টানা জয়'), stats.currentWinStreak],
    ['medal', 'coin', t('Best streak', 'সেরা টানা জয়'), stats.bestWinStreak],
    ['calendar', 'cyan', t('Best days', 'সেরা টানা দিন'), stats.bestStreakDays],
    ['heart-pulse', 'danger', t('Survival best', 'সারভাইভাল সেরা'), stats.bestSurvival],
  ];
  return (
    <div className="stat-tiles">
      {items.map(([icon, tone, label, value]) => (
        <div key={label} className="stat-tile">
          <IconTile name={icon} tone={tone} size={34} />
          <b><N v={value} /></b>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

export default function Profile({ tab: initial }: { tab?: 'stats' | 'achievements' }) {
  const me = useAuth((s) => s.user)!;
  const t = useT();
  const lang = useLang();
  const leagues = useLeagues();
  const [tab, setTab] = useState(initial ?? 'stats');
  const [qr, setQr] = useState(false);
  const pub = useQuery({ queryKey: ['profile', me.uid], queryFn: () => api(`/users/${me.uid}`) });
  const ach = useQuery({ queryKey: ['achievements'], queryFn: async () => (await api<{ items: any[] }>('/me/achievements')).items, enabled: tab === 'achievements' });
  const stats = useQuery({ queryKey: ['my-stats'], queryFn: () => api('/me/stats'), enabled: tab === 'stats' });
  const seasons = useQuery({ queryKey: ['my-seasons'], queryFn: async () => (await api<{ items: any[] }>('/me/seasons')).items, enabled: tab === 'stats' });
  const league = leagueForRating(me.rating, leagues);
  const s = pub.data?.stats;

  return (
    <PullToRefresh onRefresh={() => Promise.all([pub.refetch(), useAuth.getState().loadMe(), tab === 'stats' ? stats.refetch() : ach.refetch()])}>
      <div className="page stack">
        <PageHeader
          title={t('Profile', 'প্রোফাইল')}
          action={
            <Link to="/settings" className="header-action" aria-label={t('Settings', 'সেটিংস')}>
              <Icon name="settings" size={20} />
              <span>{t('Settings', 'সেটিংস')}</span>
            </Link>
          }
        />
        <section className="profile-card">
          <div className="pc-band"><ProfileCover /></div>
          <div className="pc-body">
            <div className="pc-avatar">
              <Avatar name={me.username} src={me.avatarUrl} size={100} frame={me.frame} />
              <Link to="/profile/edit" className="pc-edit" aria-label={t('Edit profile', 'প্রোফাইল এডিট')}>
                <Icon name="camera" size={16} />
              </Link>
            </div>
            <h1 className="name-with-badge">{me.username}{me.verified && <VerifiedBadge size={22} />}</h1>
            {me.title && <span className="chip accent">{me.title}</span>}
            <button
              className="uid-badge"
              onClick={() => void navigator.clipboard?.writeText(me.uid).then(() => (haptic('tap'), toast.success(t('UID copied', 'UID কপি হয়েছে'), me.uid, 'copy')))}
              aria-label={t(`Copy UID ${me.uid}`, `UID কপি করুন ${me.uid}`)}
            >
              {me.uid} <Icon name="copy" size={14} />
            </button>
            {pub.data?.bio && <p className="small muted pc-bio">{pub.data.bio}</p>}
            <div className="pc-league">
              <LeagueEmblem league={league.key} size={46} />
              <div className="grow">
                <b>{league.name} {t('League', 'লীগ')}</b>
                <small><N v={me.rating} /> {t('rating', 'রেটিং')}</small>
              </div>
              <Link to="/rank" className="btn sm soft">{t('Ranks', 'র‍্যাংক')}</Link>
            </div>
            <div style={{ width: '100%' }}><LevelBar xp={me.xp} /></div>
            <div className="pc-actions">
              <Link to="/profile/edit" className="btn sm outline"><Icon name="edit" /> {t('Edit', 'এডিট')}</Link>
              <button className="btn sm outline" onClick={() => setQr(true)}><Icon name="qr" /> {t('My QR', 'আমার QR')}</button>
              <button
                className="btn sm outline"
                onClick={() => void share({ title: 'QUIZ WAR', text: t(`Challenge me on QUIZ WAR! ${me.username} · UID ${me.uid}`, `QUIZ WAR-এ আমাকে চ্যালেঞ্জ করো! ${me.username} · UID ${me.uid}`), url: profileLink(me.uid) })}
              >
                <Icon name="share" /> {t('Share', 'শেয়ার')}
              </button>
            </div>
          </div>
        </section>

        {s && (
          <section className="quick-stats">
            <div><b><N v={`${s.winRate}%`} /></b><span>{t('Win rate', 'জয়ের হার')}</span></div>
            <div><b><N v={s.wins} /></b><span>{t('Wins', 'জয়')}</span></div>
            <div><b className="row" style={{ justifyContent: 'center', gap: 4 }}><Icon name="fire" size={20} /><N v={s.streakDays} /></b><span>{t('Day streak', 'টানা দিন')}</span></div>
          </section>
        )}

        {pub.data?.squad && (
          <Link to={`/squads/${pub.data.squad.id}`} className="card tap row" style={{ color: 'var(--text)' }}>
            <IconTile name="shield" tone="cyan" size={42} />
            <div className="grow"><b>{pub.data.squad.name}</b><p className="xs muted">[{pub.data.squad.tag}] · {t('My squad', 'আমার স্কোয়াড')}</p></div>
            <Icon name="chevron" size={20} />
          </Link>
        )}

        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'stats'} onClick={() => setTab('stats')}><Icon name="chart" /> {t('Statistics', 'পরিসংখ্যান')}</button>
          <button role="tab" aria-selected={tab === 'achievements'} onClick={() => setTab('achievements')}><Icon name="award" /> {t('Achievements', 'অ্যাচিভমেন্ট')}</button>
        </div>

        {tab === 'stats' ? (
          <>
            {s ? <StatsGrid stats={s} /> : <Skeleton kind="card" lines={1} />}
            {stats.data && stats.data.categories.length > 0 && (
              <section className="card">
                <div className="card-title"><h3><Icon name="target" size={18} /> {t('Category accuracy (90 days)', 'ক্যাটাগরি অনুযায়ী সঠিকতা (৯০ দিন)')}</h3></div>
                {stats.data.categories.map((c: any) => (
                  <div key={c.id} className="cat-acc">
                    <IconTile name={categoryIcon(c)} color={c.color} size={34} />
                    <div className="grow">
                      <div className="row between small"><span className="bold">{lang === 'bn' ? (c.nameBn ?? c.name) : c.name}</span><b className="num">{num(c.accuracy, lang)}%</b></div>
                      <div className="progress" style={{ height: 6, marginTop: 4 }}><span style={{ width: `${c.accuracy}%` }} /></div>
                    </div>
                  </div>
                ))}
              </section>
            )}
            {!!seasons.data?.length && (
              <section className="card">
                <div className="card-title"><h3><Icon name="trophy" size={18} /> {t('Season history', 'সিজন হিস্ট্রি')}</h3></div>
                <div className="list">
                  {seasons.data.map((x: any) => (
                    <div key={x.id} className="list-row">
                      <LeagueEmblem league={x.league ?? 'bronze'} size={38} />
                      <div className="grow" style={{ minWidth: 0 }}>
                        <b className="small ellipsis" style={{ display: 'block' }}>
                          {x.name} {x.status === 'active' && <span className="chip primary xs-chip">{t('Current', 'চলমান')}</span>}
                        </b>
                        <span className="xs muted">
                          {t('Won', 'জয়')} {num(x.wins ?? 0, lang)} · {t('Lost', 'পরাজয়')} {num(x.losses ?? 0, lang)} · {t('Peak', 'সর্বোচ্চ')} {num(x.peakRating ?? x.rating ?? 0, lang)}
                        </span>
                      </div>
                      {x.finalRank ? <b className="num">#{num(x.finalRank, lang)}</b> : <b className="num">{num(x.rating ?? 0, lang)}</b>}
                    </div>
                  ))}
                </div>
              </section>
            )}
            <Link to="/history" className="card tap row" style={{ color: 'var(--text)' }}>
              <IconTile name="history" tone="accent" size={42} />
              <b className="grow">{t('Match history', 'ম্যাচ হিস্টোরি')}</b>
              <Icon name="chevron" size={20} />
            </Link>
          </>
        ) : ach.isLoading ? (
          <Skeleton kind="card" lines={2} />
        ) : !ach.data?.length ? (
          <Empty icon="award" title={t('No achievements yet', 'এখনো কোনো অ্যাচিভমেন্ট নেই')} body={t('Win battles to unlock your first badge.', 'ব্যাটল জিতে প্রথম ব্যাজ আনলক করুন।')} />
        ) : (
          <div className="badges stagger">
            {ach.data.map((a) => (
              <div key={a.key} className={`badge-tile ${a.unlockedAt ? 'unlocked' : 'locked'}`} title={a.description}>
                <span className="b-medal">
                  <Icon name={achievementIcon(a)} size={26} />
                  {!a.unlockedAt && <span className="b-lock"><Icon name="lock" size={12} /></span>}
                </span>
                <b>{a.name}</b>
                <small>{a.description}</small>
              </div>
            ))}
          </div>
        )}

        <Sheet open={qr} onClose={() => setQr(false)} title={t('My QR code', 'আমার QR কোড')} icon="qr">
          <div className="col center">
            <QrCode value={profileLink(me.uid)} />
            <span className="uid-badge" style={{ margin: '8px auto' }}>{me.uid}</span>
            <p className="small muted">{t('Friends can scan this to add you instantly.', 'বন্ধুরা এটি স্ক্যান করলেই আপনাকে অ্যাড করতে পারবে।')}</p>
          </div>
        </Sheet>
      </div>
    </PullToRefresh>
  );
}
