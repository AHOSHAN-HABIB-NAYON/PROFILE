import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '../components/AppShell';
import { Avatar } from '../components/Avatar';
import { Skeleton } from '../components/Feedback';
import { LeagueBadge, LevelBar } from '../components/Game';
import { Icon } from '../components/Icon';
import { QrCode } from '../components/Qr';
import { Sheet } from '../components/Sheet';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { share } from '../lib/platform';
import { profileLink } from '../lib/qr';
import { toast } from '../lib/toast';

export function StatsGrid({ stats }: { stats: any }) {
  const items = [
    ['Win rate', `${stats.winRate}%`],
    ['Wins', stats.wins],
    ['Losses', stats.losses],
    ['Games', stats.totalGames],
    ['Accuracy', `${stats.accuracy}%`],
    ['Best score', stats.bestScore],
    ['Win streak', stats.currentWinStreak],
    ['Best streak', stats.bestWinStreak],
    ['🔥 Days', stats.streakDays],
    ['Best days', stats.bestStreakDays],
    ['Survival best', stats.bestSurvival],
    ['Peak rating', stats.peakRating],
  ];
  return (
    <div className="stat-grid">
      {items.map(([l, v]) => <div key={l} className="stat"><b className="num">{v}</b><span>{l}</span></div>)}
    </div>
  );
}

export default function Profile({ tab: initial }: { tab?: 'stats' | 'achievements' }) {
  const me = useAuth((s) => s.user)!;
  const [tab, setTab] = useState(initial ?? 'stats');
  const [qr, setQr] = useState(false);
  const pub = useQuery({ queryKey: ['profile', me.uid], queryFn: () => api(`/users/${me.uid}`) });
  const ach = useQuery({ queryKey: ['achievements'], queryFn: async () => (await api<{ items: any[] }>('/me/achievements')).items, enabled: tab === 'achievements' });
  const stats = useQuery({ queryKey: ['my-stats'], queryFn: () => api('/me/stats'), enabled: tab === 'stats' });

  return (
    <div className="page stack">
      <PageHeader title="Profile" action={<Link to="/settings" className="btn icon sm ghost" aria-label="Settings"><Icon name="settings" /></Link>} />
      <section className="profile-head">
        <Avatar name={me.username} src={me.avatarUrl} size={96} frame={me.frame} />
        <h1>{me.username}</h1>
        {me.title && <span className="chip accent">{me.title}</span>}
        <div className="row wrap" style={{ justifyContent: 'center' }}>
          <button className="uid-badge" onClick={() => void navigator.clipboard?.writeText(me.uid).then(() => toast.success('UID copied'))} aria-label={`Copy UID ${me.uid}`}>{me.uid} <Icon name="copy" size={14} /></button>
          <LeagueBadge rating={me.rating} />
        </div>
        {pub.data?.bio && <p className="small muted">{pub.data.bio}</p>}
        <div style={{ width: '100%', maxWidth: 360 }}><LevelBar xp={me.xp} /></div>
        <div className="row">
          <Link to="/profile/edit" className="btn sm outline"><Icon name="edit" /> Edit</Link>
          <button className="btn sm outline" onClick={() => setQr(true)}><Icon name="qr" /> QR</button>
          <button className="btn sm outline" onClick={() => void share({ title: 'QUIZ WAR', text: `⚔️ Challenge me on QUIZ WAR! ${me.username} · UID ${me.uid}`, url: profileLink(me.uid) })}><Icon name="share" /> Share</button>
        </div>
        {pub.data?.squad && <Link to={`/squads/${pub.data.squad.id}`} className="chip primary">🛡️ {pub.data.squad.name} [{pub.data.squad.tag}]</Link>}
      </section>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'stats'} onClick={() => setTab('stats')}>Statistics</button>
        <button role="tab" aria-selected={tab === 'achievements'} onClick={() => setTab('achievements')}>Achievements</button>
      </div>

      {tab === 'stats' ? (
        <>
          {pub.data ? <StatsGrid stats={pub.data.stats} /> : <Skeleton kind="card" lines={1} />}
          {stats.data && stats.data.categories.length > 0 && (
            <section className="card">
              <h3 className="mb">Category accuracy (90 days)</h3>
              {stats.data.categories.map((c: any) => (
                <div key={c.id} className="mb">
                  <div className="row between small"><span>{c.icon} {c.name}</span><b className="num">{c.accuracy}%</b></div>
                  <div className="progress" style={{ height: 6 }}><span style={{ width: `${c.accuracy}%` }} /></div>
                </div>
              ))}
            </section>
          )}
          <Link to="/history" className="card row" style={{ color: 'var(--text)' }}><span style={{ fontSize: 22 }}>📜</span><b className="grow">Match history</b><Icon name="chevron" /></Link>
        </>
      ) : ach.isLoading ? (
        <Skeleton kind="card" lines={2} />
      ) : (
        <div className="badges">
          {ach.data?.map((a) => (
            <div key={a.key} className={`badge-tile ${a.unlockedAt ? '' : 'locked'}`} title={a.description}>
              <span className="b-icon" aria-hidden>{a.icon}</span>
              {a.name}
            </div>
          ))}
        </div>
      )}

      <Sheet open={qr} onClose={() => setQr(false)} title="My QR code">
        <div className="col center"><QrCode value={profileLink(me.uid)} /><span className="uid-badge" style={{ margin: '8px auto' }}>{me.uid}</span></div>
      </Sheet>
    </div>
  );
}
