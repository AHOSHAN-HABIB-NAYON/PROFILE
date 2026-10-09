import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { Avatar } from '../components/Avatar';
import { CountUp, N, Skeleton } from '../components/Feedback';
import { LeagueBadge, LevelBar } from '../components/Game';
import { Icon, IconTile, type IconName } from '../components/Icon';
import { PullToRefresh } from '../components/PullToRefresh';
import { useMissions } from '../hooks/queries';
import { api, friendlyError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { num, useLang, useT } from '../lib/i18n';
import { haptic } from '../lib/platform';
import { useConn } from '../lib/socket';
import { sfx } from '../lib/sound';
import { toast } from '../lib/toast';

const REWARD_ICON: Record<string, IconName> = { coins: 'coin', xp: 'xp', power_up: 'bolt', mystery: 'gift' };

function DailyReward() {
  const qc = useQueryClient();
  const t = useT();
  const lang = useLang();
  const { data } = useQuery({ queryKey: ['daily-reward'], queryFn: () => api('/me/rewards/daily') });
  const claim = useMutation({
    mutationFn: () => api('/me/rewards/daily/claim', { method: 'POST' }),
    onSuccess: (r: any) => {
      sfx('reward');
      haptic('success');
      toast.success(t(`Day ${r.day} reward claimed!`, `${num(r.day)} নম্বর দিনের রিওয়ার্ড পেয়েছেন!`), `+${r.label}`, 'gift');
      void qc.invalidateQueries({ queryKey: ['daily-reward'] });
    },
    onError: (e) => toast.error(t('Could not claim', 'Claim করা যায়নি'), friendlyError(e)),
  });
  if (!data) return <Skeleton kind="card" lines={1} />;
  return (
    <section className="card" aria-labelledby="dr-title">
      <div className="card-title">
        <h3 id="dr-title"><IconTile name="gift" tone="coin" size={30} anim={data.claimedToday ? undefined : 'wiggle'} /> {t('Daily reward', 'ডেইলি রিওয়ার্ড')}</h3>
        {data.claimedToday ? (
          <span className="chip success"><Icon name="check" /> {t('Claimed', 'নেওয়া হয়েছে')}</span>
        ) : (
          <span className="chip primary">{t('Day', 'দিন')} {num(data.day, lang)}</span>
        )}
      </div>
      <div className="reward-track">
        {data.ladder.slice(0, 7).map((r: any, i: number) => {
          const d = i + 1;
          const cls = d < data.day || (data.claimedToday && d === data.day) ? 'done' : d === data.day ? 'today' : '';
          return (
            <div key={i} className={`reward-day ${cls}`}>
              {cls === 'done' ? <Icon name="check-circle" size={22} className="r-ico" /> : <Icon name={REWARD_ICON[r.type] ?? 'gift'} size={22} className="r-ico" />}
              <b>{r.type === 'power_up' ? '×' + num(r.amount, lang) : r.type === 'mystery' ? '?' : num(r.amount, lang)}</b>
              <span>{t('D', 'দিন ')}{num(d, lang)}</span>
            </div>
          );
        })}
      </div>
      {!data.claimedToday && (
        <button className="btn primary block mt claim-btn" disabled={claim.isPending} onClick={() => claim.mutate()}>
          {claim.isPending ? <span className="spinner" /> : <Icon name="gift" />} {t(`Claim day ${data.day}`, `${num(data.day, lang)} নম্বর দিনের রিওয়ার্ড নিন`)}
        </button>
      )}
    </section>
  );
}

function DailyChallengeCard() {
  const nav = useNavigate();
  const t = useT();
  const lang = useLang();
  const { data } = useQuery({ queryKey: ['daily'], queryFn: () => api('/daily') });
  if (!data?.available) return null;
  return (
    <section className="card feature-card daily">
      <IconTile name="calendar" tone="accent" size={50} anim="float" />
      <div className="grow">
        <h3>{t('Daily challenge', 'ডেইলি চ্যালেঞ্জ')}</h3>
        <p className="xs muted">
          {num(data.questionCount, lang)} {t('questions', 'প্রশ্ন')} · {num(Math.round(data.totalTimeSec / 60), lang)} {t('minutes', 'মিনিট')} · {num(data.players, lang)} {t('played today', 'জন খেলেছে')}
        </p>
      </div>
      {data.played ? (
        <span className="chip success">{t('Score', 'স্কোর')} {num(data.result?.score ?? 0, lang)}</span>
      ) : (
        <button className="btn sm accent" onClick={() => (haptic('tap'), nav('/battle?daily=1'))}>
          <Icon name="bolt" /> {t('Play', 'খেলুন')}
        </button>
      )}
    </section>
  );
}

function MissionsCard() {
  const nav = useNavigate();
  const t = useT();
  const lang = useLang();
  const { data } = useMissions();
  const items = data?.items ?? [];
  if (!items.length) return null;
  const today = items.filter((m) => m.period === 'daily');
  const done = today.filter((m) => m.completed).length;
  const claimable = data?.claimable ?? 0;
  const pct = today.length ? Math.round((done / today.length) * 100) : 0;
  return (
    <button className={`card feature-card tap ${claimable ? 'mission ready' : ''}`} onClick={() => (haptic('tap'), nav('/shop?tab=missions'))}>
      <IconTile name="target" tone="success" size={50} anim={claimable ? 'beat' : undefined} />
      <div className="grow" style={{ textAlign: 'left' }}>
        <h3>{t('Missions & rewards', 'মিশন ও রিওয়ার্ড')}</h3>
        <p className="xs muted">
          {claimable ? t(`${claimable} reward(s) ready to claim!`, `${num(claimable, lang)}টি রিওয়ার্ড Claim করার অপেক্ষায়!`) : t(`Today ${done}/${today.length} done`, `আজকের মিশন ${num(done, lang)}/${num(today.length, lang)} সম্পূর্ণ`)}
        </p>
        <div className="progress" style={{ height: 6, marginTop: 6 }}><span style={{ width: `${pct}%` }} /></div>
      </div>
      {claimable ? <span className="btn sm primary claim-btn">Claim</span> : <Icon name="chevron" size={20} />}
    </button>
  );
}

function FriendsOnline() {
  const t = useT();
  const { data } = useQuery({ queryKey: ['friends'], queryFn: async () => (await api<{ items: any[] }>('/friends')).items });
  const online = (data ?? []).filter((f) => f.status !== 'offline').slice(0, 12);
  return (
    <section className="card">
      <div className="card-title">
        <h3><IconTile name="users" tone="primary" size={30} /> {t('Friends online', 'অনলাইনে বন্ধুরা')}</h3>
        <Link to="/friends" className="small bold">{t('See all', 'সব দেখুন')}</Link>
      </div>
      {!data ? (
        <Skeleton lines={1} kind="line" />
      ) : online.length === 0 ? (
        <div className="row small muted">
          <span className="grow">{t('No friends online right now.', 'এই মুহূর্তে কোনো বন্ধু অনলাইনে নেই।')}</span>
          <Link to="/friends" className="btn sm soft"><Icon name="user-plus" /> {t('Add friends', 'বন্ধু যোগ করুন')}</Link>
        </div>
      ) : (
        <div className="friends-strip">
          {online.map((f) => (
            <Link key={f.user.id} to={`/u/${f.user.uid}`} className="fs-item">
              <Avatar name={f.user.username} src={f.user.avatarThumbUrl} status={f.status} size={54} frame={f.user.frame} />
              <span className="xs bold ellipsis">{f.user.username}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function greeting(t: (en: string, bn: string) => string) {
  const h = new Date().getHours();
  if (h < 5) return t('Good night', 'শুভ রাত্রি');
  if (h < 12) return t('Good morning', 'শুভ সকাল');
  if (h < 17) return t('Good afternoon', 'শুভ দুপুর');
  if (h < 20) return t('Good evening', 'শুভ সন্ধ্যা');
  return t('Good night', 'শুভ রাত্রি');
}

export default function Home() {
  const user = useAuth((s) => s.user)!;
  const online = useConn((s) => s.online);
  const t = useT();
  const nav = useNavigate();
  const go = (to: string) => {
    haptic('tap');
    nav(to, { viewTransition: true });
  };
  const quick = () => {
    haptic('heavy');
    sfx('tap');
    nav('/matchmaking?mode=duel&ranked=1', { viewTransition: true });
  };
  const modes: { icon: IconName; tone: 'primary' | 'cyan' | 'danger' | 'success' | 'warning' | 'accent'; title: string; sub: string; to: string }[] = [
    { icon: 'users', tone: 'primary', title: t('Duo 2 VS 2', 'ডুও ২ বনাম ২'), sub: t('Team up with a partner', 'সঙ্গীকে নিয়ে লড়ুন'), to: '/matchmaking?mode=duo&ranked=0' },
    { icon: 'bot', tone: 'cyan', title: t('VS AI', 'AI-এর সাথে'), sub: t('Easy to expert bots', 'সহজ থেকে কঠিন বট'), to: '/battle#ai' },
    { icon: 'target', tone: 'danger', title: t('Challenge', 'চ্যালেঞ্জ'), sub: t('Battle a friend', 'বন্ধুর সাথে লড়াই'), to: '/friends' },
    { icon: 'brain', tone: 'success', title: t('Solo practice', 'একা অনুশীলন'), sub: t('Learn at your pace', 'নিজের গতিতে শিখুন'), to: '/battle#solo' },
    { icon: 'heart-pulse', tone: 'warning', title: t('Survival', 'সারভাইভাল'), sub: t('One mistake ends it', 'একটা ভুলেই শেষ'), to: '/battle#survival' },
    { icon: 'bolt', tone: 'accent', title: t('Speed round', 'স্পিড রাউন্ড'), sub: t('60-second sprint', '৬০ সেকেন্ডের দৌড়'), to: '/battle#speed' },
  ];
  return (
    <PullToRefresh onRefresh={() => Promise.all([useAuth.getState().loadMe()])}>
      <div className="page stack home">
        <section className="home-head" aria-label={t('Your profile', 'আপনার প্রোফাইল')}>
          <Link to="/profile"><Avatar name={user.username} src={user.avatarThumbUrl ?? user.avatarUrl} size={54} frame={user.frame} status="online" /></Link>
          <div className="grow">
            <p className="xs faint bold">{greeting(t)}</p>
            <div className="row gap-sm"><h2 className="ellipsis">{user.username}</h2><LeagueBadge rating={user.rating} compact /></div>
            <LevelBar xp={user.xp} />
          </div>
        </section>

        <section className="hero-battle" aria-labelledby="qb">
          <div className="hb-art" aria-hidden>
            <span className="hb-ring" />
            <Icon name="swords" size={64} strokeWidth={1.6} />
          </div>
          <span className="live"><i /> <CountUp value={online} /> {t(online === 1 ? 'player online' : 'players online', 'জন অনলাইনে')}</span>
          <h2 id="qb">{t('Quick battle', 'কুইক ব্যাটল')}</h2>
          <p>{t('Ranked 1 VS 1 · same questions · fastest correct answer wins', 'র‍্যাংকড ১ বনাম ১ · একই প্রশ্ন · দ্রুত সঠিক উত্তরে জয়')}</p>
          <button className="btn white lg block" onClick={quick}>
            <Icon name="search" /> {t('Find opponent', 'প্রতিপক্ষ খুঁজুন')}
          </button>
        </section>

        <div className="mode-grid stagger">
          {modes.map((m) => (
            <button key={m.title} className="mode-card" onClick={() => go(m.to)}>
              <IconTile name={m.icon} tone={m.tone} size={44} />
              <strong>{m.title}</strong>
              <span>{m.sub}</span>
            </button>
          ))}
        </div>

        <DailyChallengeCard />
        <MissionsCard />
        <DailyReward />
        <FriendsOnline />

        <section className="quick-stats" aria-label={t('Quick stats', 'সংক্ষিপ্ত তথ্য')}>
          <Link to="/profile"><b className="row" style={{ justifyContent: 'center', gap: 4 }}><Icon name="fire" size={20} /><N v={user.streakDays} /></b><span>{t('Day streak', 'টানা দিন')}</span></Link>
          <Link to="/rank"><b><N v={user.rating} /></b><span>{t('Rating', 'রেটিং')}</span></Link>
          <Link to="/shop"><b className="row coin-text" style={{ justifyContent: 'center', gap: 4 }}><Icon name="coin" size={20} /><CountUp value={user.coins} /></b><span>{t('Coins', 'কয়েন')}</span></Link>
        </section>
      </div>
    </PullToRefresh>
  );
}
