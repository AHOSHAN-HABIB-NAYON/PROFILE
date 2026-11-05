import { leagueForRating } from '@quizwar/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Avatar } from '../components/Avatar';
import { Empty, N, Skeleton } from '../components/Feedback';
import { LevelBar, useLeagues } from '../components/Game';
import { Icon, IconTile, type IconName } from '../components/Icon';
import { LeagueEmblem } from '../components/LeagueEmblem';
import { ProfileCover } from '../components/ProfileCover';
import { AchievementGrid, CategoryBars, ProfileNumbers, ProfileTabs, PxSection, SeasonList, StatsNumbers } from '../components/ProfileParts';
import { PullToRefresh } from '../components/PullToRefresh';
import { QrCode } from '../components/Qr';
import { Sheet } from '../components/Sheet';
import { NameBadges } from '../components/Verified';
import { useConfig } from '../hooks/queries';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { num, useLang, useT } from '../lib/i18n';
import { modeIcon, modeLabel } from '../lib/labels';
import { haptic, share } from '../lib/platform';
import { profileLink } from '../lib/qr';
import { toast } from '../lib/toast';
import { localLudoHistory } from '../lib/ludoHistory';
import { greeting } from '../lib/greeting';

/** Old box grid, kept for any screen that still wants it. */
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
    ['gamepad', 'accent', t('Ludo wins', 'লুডুতে জয়'), `${stats.ludoWins ?? 0}/${stats.ludoGames ?? 0}`],
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

const RESULT: Record<string, [string, string, string]> = {
  win: ['Win', 'জয়', 'w'],
  loss: ['Loss', 'হার', 'l'],
  draw: ['Draw', 'ড্র', 'd'],
  abandoned: ['Left', 'ছাড়া', 'l'],
  completed: ['Done', 'শেষ', 'd'],
};

/** Last few matches as clean full-width rows. */
export function RecentMatches({ items }: { items: any[] }) {
  const t = useT();
  const lang = useLang();
  return (
    <div className="px-list">
      {items.map((m) => {
        const [en, bn, cls] = RESULT[m.result ?? 'completed'] ?? ['—', '—', 'd'];
        const opp = m.players.filter((p: any) => p.team !== m.team).map((p: any) => p.name).join(', ');
        return (
          <Link key={m.id} to={`/review/${m.id}`} className="px-row link">
            <span className={`px-res ${cls}`}>{t(en, bn)}</span>
            <IconTile name={modeIcon(m.mode, m.type)} tone="neutral" size={36} />
            <div className="grow" style={{ minWidth: 0 }}>
              <b className="small ellipsis" style={{ display: 'block' }}>{opp ? t(`vs ${opp}`, `বনাম ${opp}`) : modeLabel(m.mode)}</b>
              <span className="xs muted">
                {modeLabel(m.mode)}{m.type === 'ai' ? ' · AI' : ''} · {new Date(m.createdAt).toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'short' })}
              </span>
            </div>
            <b className="num">{num(m.score, lang)}</b>
          </Link>
        );
      })}
    </div>
  );
}

type LudoRow = { id: string; mode: string; place: number; won: boolean; at: string; players: { uid: string; name: string; avatar: string | null; place: number }[]; local?: boolean };

/** Ludo games: online (from the server) + against the computer (kept on this phone), newest first. */
export function LudoMatches() {
  const t = useT();
  const lang = useLang();
  const [pages, setPages] = useState(1);
  const online = useQuery({ queryKey: ['ludo-matches', pages], queryFn: async () => {
    const all: LudoRow[] = [];
    let more = false;
    for (let p = 0; p < pages; p++) {
      const r = await api<{ items: LudoRow[]; more: boolean }>(`/me/ludo-matches?page=${p}`);
      all.push(...r.items);
      more = r.more;
      if (!r.more) break;
    }
    return { items: all, more };
  } });
  const local: LudoRow[] = localLudoHistory().map((g, i) => ({ id: `l${i}`, mode: 'ai', place: g.place, won: g.place === 1, at: g.at, players: [], local: true }));
  const items = [...(online.data?.items ?? []), ...local].sort((a, b) => b.at.localeCompare(a.at)).slice(0, pages * 10);
  const levels = [t('Easy', 'সহজ'), t('Normal', 'নরমাল'), t('Hard', 'কঠিন')];
  const raw = localLudoHistory();
  if (online.isLoading) return <Skeleton kind="line" lines={3} />;
  if (!items.length)
    return <Empty icon="gamepad" tone="accent" title={t('No Ludo games yet', 'এখনো কোনো লুডু খেলা নেই')} body={t('Your Ludo games will show up here.', 'আপনার লুডু খেলাগুলো এখানে দেখাবে।')} action={<Link to="/ludo" className="btn primary"><Icon name="gamepad" /> {t('Play Ludo', 'লুডু খেলুন')}</Link>} />;
  const modeText = (m: string) => (m === '2v2' ? t('2 VS 2', '২ বনাম ২') : m === '1v1' ? t('1 VS 1', '১ বনাম ১') : m === '4p' ? t('4 players', '৪ জন') : t('vs computer', 'কম্পিউটারের সাথে'));
  return (
    <>
      <div className="px-list">
        {items.map((m) => {
          const lg = m.local ? raw[Number(m.id.slice(1))] : null;
          const opp = m.players.map((p) => p.name).join(', ');
          const place = m.won ? null : m.place;
          return (
            <div key={m.id} className="px-row">
              <span className={`px-res ${m.won ? 'w' : 'l'}`}>{m.won ? t('Win', 'জয়') : t('Loss', 'হার')}</span>
              <IconTile name="gamepad" tone={m.won ? 'success' : 'neutral'} size={36} />
              <div className="grow" style={{ minWidth: 0 }}>
                <b className="small ellipsis" style={{ display: 'block' }}>
                  {m.local ? t(`vs Computer · ${levels[lg?.level ?? 1]}`, `কম্পিউটার · ${levels[lg?.level ?? 1]}`) : opp ? t(`vs ${opp}`, `বনাম ${opp}`) : t('Ludo', 'লুডু')}
                </b>
                <span className="xs muted">
                  {t('Ludo', 'লুডু')} · {m.local ? t(`${lg?.players ?? 2} players`, `${num(lg?.players ?? 2, lang)} জন`) : modeText(m.mode)} · {new Date(m.at).toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'short' })}
                </span>
              </div>
              <b className="num">{place ? t(`#${place}`, ['', '১ম', '২য়', '৩য়', '৪র্থ'][place] ?? `${num(place, lang)}`) : <Icon name="crown" size={18} className="coin-text" />}</b>
            </div>
          );
        })}
      </div>
      {(online.data?.more || local.length + (online.data?.items.length ?? 0) > pages * 10) && (
        <button type="button" className="px-more" onClick={() => setPages((p) => p + 1)}>{t('See 10 more', 'আরও ১০টি দেখুন')} <Icon name="chevron-down" size={16} /></button>
      )}
    </>
  );
}

type Tab = 'matches' | 'stats' | 'achievements';

export default function Profile({ tab: initial }: { tab?: 'stats' | 'achievements' }) {
  const me = useAuth((s) => s.user)!;
  const t = useT();
  const lang = useLang();
  const leagues = useLeagues();
  const [tab, setTab] = useState<Tab>(initial === 'achievements' ? 'achievements' : initial === 'stats' ? 'stats' : 'matches');
  const [qr, setQr] = useState(false);
  const [game, setGame] = useState<'quiz' | 'ludo'>('quiz');
  const pub = useQuery({ queryKey: ['profile', me.uid], queryFn: () => api(`/users/${me.uid}`) });
  const ach = useQuery({ queryKey: ['achievements'], queryFn: async () => (await api<{ items: any[] }>('/me/achievements')).items });
  const recent = useQuery({ queryKey: ['history-recent'], queryFn: async () => (await api<{ items: any[] }>('/me/matches?page=1&pageSize=6')).items, enabled: tab === 'matches' && game === 'quiz' });
  const stats = useQuery({ queryKey: ['my-stats'], queryFn: () => api('/me/stats'), enabled: tab === 'stats' });
  const seasons = useQuery({ queryKey: ['my-seasons'], queryFn: async () => (await api<{ items: any[] }>('/me/seasons')).items, enabled: tab === 'stats' });
  const friends = useQuery({ queryKey: ['friends'], queryFn: async () => (await api<{ items: any[] }>('/friends')).items });
  const league = leagueForRating(me.rating, leagues);
  const premiumOn = !!useConfig().data?.premiumEnabled;
  const s = pub.data?.stats;
  const copyUid = () => void navigator.clipboard?.writeText(me.uid).then(() => (haptic('tap'), toast.success(t('UID copied', 'UID কপি হয়েছে'), me.uid, 'copy')));

  return (
    <PullToRefresh onRefresh={() => Promise.all([pub.refetch(), useAuth.getState().loadMe(), ach.refetch(), tab === 'matches' ? recent.refetch() : stats.refetch()])}>
      <div className="page px">
        <div className="px-cover">
          <ProfileCover />
          <div className="px-cover-actions">
            <button className="px-cbtn" onClick={() => (haptic('tap'), setQr(true))} aria-label={t('Share profile', 'প্রোফাইল শেয়ার')}>
              <Icon name="share" size={19} />
            </button>
            <Link to="/settings" className="px-cbtn" aria-label={t('Settings', 'সেটিংস')}>
              <Icon name="settings" size={20} />
            </Link>
          </div>
        </div>

        <section className="px-head">
          <div className="px-avrow">
            <div className="px-av">
              <Avatar name={me.username} src={me.avatarUrl} size={92} frame={me.frame} />
              <Link to="/profile/edit" className="pc-edit" aria-label={t('Change photo', 'ছবি বদলান')}>
                <Icon name="camera" size={15} />
              </Link>
            </div>
            <Link to="/profile/edit" className="btn px-edit">{t('Edit profile', 'প্রোফাইল এডিট')}</Link>
          </div>
          <p className="px-greet">{greeting(t)}</p>
          <h1 className="px-name">{me.username}<NameBadges user={me} size={20} /></h1>
          <div className="px-handle">
            <button onClick={copyUid} aria-label={t(`Copy UID ${me.uid}`, `UID কপি করুন ${me.uid}`)}>
              UID {me.uid} <Icon name="copy" size={13} />
            </button>
            {me.title && <span className="px-title">· {me.title}</span>}
          </div>
          {pub.data?.bio && <p className="px-bio">{pub.data.bio}</p>}
          <div className="px-meta">
            <Link to="/rank"><LeagueEmblem league={league.key} size={20} /> {league.name} · {num(me.rating, lang)}</Link>
            {pub.data?.squad && (
              <Link to={`/squads/${pub.data.squad.id}`}><Icon name="shield" size={15} /> {pub.data.squad.name}</Link>
            )}
          </div>
          <div className="px-level"><LevelBar xp={me.xp} /></div>
          {premiumOn && (
            <Link to="/premium" className="premium-entry px-premium" onClick={() => haptic('tap')}>
              <span className="pe-ic"><Icon name="crown" size={22} /></span>
              <span className="grow"><b>{me.premium ? t('Premium is on', 'প্রিমিয়াম চালু আছে') : t('Get Premium', 'প্রিমিয়াম নিন')}</b><small>{me.premium && me.premiumUntil ? t(`Until ${new Date(me.premiumUntil).toLocaleDateString('en-GB')}`, `${new Date(me.premiumUntil).toLocaleDateString('bn-BD')} পর্যন্ত`) : t('Calls, voice, photos, live talk', 'কল, ভয়েস, ছবি, লাইভ কথা')}</small></span>
              <Icon name="chevron" size={18} />
            </Link>
          )}
          {s ? (
            <ProfileNumbers
              items={[
                { value: s.totalGames, label: t('Matches', 'ম্যাচ') },
                { value: s.wins, label: t('Wins', 'জয়') },
                { value: `${s.winRate}%`, label: t('Win rate', 'জয়ের হার') },
                { value: friends.data?.length ?? 0, label: t('Friends', 'বন্ধু'), to: '/friends?tab=friends' },
              ]}
            />
          ) : (
            <Skeleton kind="line" lines={1} />
          )}
        </section>

        <ProfileTabs<Tab>
          value={tab}
          onChange={(k) => (haptic('tap'), setTab(k))}
          tabs={[
            { key: 'matches', label: t('Matches', 'ম্যাচ') },
            { key: 'stats', label: t('Statistics', 'পরিসংখ্যান') },
            { key: 'achievements', label: t('Achievements', 'অ্যাচিভমেন্ট') },
          ]}
        />

        {tab === 'matches' && (
          <div className="px-game-switch" role="tablist">
            <button type="button" role="tab" aria-selected={game === 'quiz'} className={game === 'quiz' ? 'on' : ''} onClick={() => (haptic('tap'), setGame('quiz'))}><Icon name="swords" size={15} /> {t('Quiz', 'কুইজ')}</button>
            <button type="button" role="tab" aria-selected={game === 'ludo'} className={game === 'ludo' ? 'on' : ''} onClick={() => (haptic('tap'), setGame('ludo'))}><Icon name="gamepad" size={15} /> {t('Ludo', 'লুডু')}</button>
          </div>
        )}
        {tab === 'matches' && game === 'ludo' && <LudoMatches />}
        {tab === 'matches' && game === 'quiz' &&
          (recent.isLoading ? (
            <Skeleton kind="line" lines={3} />
          ) : !recent.data?.length ? (
            <Empty icon="history" tone="accent" title={t('No matches yet', 'এখনো কোনো ম্যাচ নেই')} body={t('Your battles will show up here.', 'আপনার খেলা ম্যাচগুলো এখানে দেখাবে।')} action={<Link to="/battle" className="btn primary"><Icon name="swords" /> {t('Play now', 'এখনই খেলুন')}</Link>} />
          ) : (
            <>
              <RecentMatches items={recent.data} />
              <Link to="/history" className="px-more">{t('See full match history', 'সব ম্যাচ হিস্টোরি দেখুন')} <Icon name="chevron" size={16} /></Link>
            </>
          ))}

        {tab === 'stats' && (
          <>
            {s ? <StatsNumbers stats={s} /> : <Skeleton kind="card" lines={1} />}
            {stats.data && stats.data.categories.length > 0 && (
              <PxSection title={t('Category accuracy (90 days)', 'ক্যাটাগরি অনুযায়ী সঠিকতা (৯০ দিন)')}>
                <CategoryBars categories={stats.data.categories} />
              </PxSection>
            )}
            {!!seasons.data?.length && (
              <PxSection title={t('Season history', 'সিজন হিস্ট্রি')}>
                <SeasonList seasons={seasons.data} />
              </PxSection>
            )}
          </>
        )}

        {tab === 'achievements' &&
          (ach.isLoading ? (
            <Skeleton kind="card" lines={2} />
          ) : !ach.data?.length ? (
            <Empty icon="award" title={t('No achievements yet', 'এখনো কোনো অ্যাচিভমেন্ট নেই')} body={t('Win battles to unlock your first badge.', 'ব্যাটল জিতে প্রথম ব্যাজ আনলক করুন।')} />
          ) : (
            <AchievementGrid items={ach.data} />
          ))}

        <Sheet open={qr} onClose={() => setQr(false)} title={t('Share my profile', 'আমার প্রোফাইল শেয়ার')} icon="qr">
          <div className="col center">
            <QrCode value={profileLink(me.uid)} />
            <span className="uid-badge" style={{ margin: '8px auto' }}>{me.uid}</span>
            <p className="small muted">{t('Friends can scan this to add you instantly.', 'বন্ধুরা এটি স্ক্যান করলেই আপনাকে অ্যাড করতে পারবে।')}</p>
            <button
              className="btn primary block mt"
              onClick={() => void share({ title: 'QUIZ WAR', text: t(`Challenge me on QUIZ WAR! ${me.username} · UID ${me.uid}`, `QUIZ WAR-এ আমাকে চ্যালেঞ্জ করো! ${me.username} · UID ${me.uid}`), url: profileLink(me.uid) })}
            >
              <Icon name="share" /> {t('Share link', 'লিংক শেয়ার করুন')}
            </button>
          </div>
        </Sheet>
      </div>
    </PullToRefresh>
  );
}
