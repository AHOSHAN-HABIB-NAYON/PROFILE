import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { PageHeader } from '../components/AppShell';
import { CountUp, Empty, Skeleton } from '../components/Feedback';
import { Icon, IconTile, type IconName } from '../components/Icon';
import { PullToRefresh } from '../components/PullToRefresh';
import { VerifiedBadge } from '../components/Verified';
import { useMissions, type Mission } from '../hooks/queries';
import { api, friendlyError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { num, useLang, useT } from '../lib/i18n';
import { haptic } from '../lib/platform';
import { sfx } from '../lib/sound';
import { toast } from '../lib/toast';

const TYPE_INFO: Record<string, { icon: IconName; en: string; bn: string }> = {
  power_up: { icon: 'bolt', en: 'Power-ups', bn: 'পাওয়ার-আপ' },
  frame: { icon: 'sparkles', en: 'Avatar frames', bn: 'অ্যাভাটার ফ্রেম' },
  title: { icon: 'award', en: 'Titles', bn: 'টাইটেল' },
  theme: { icon: 'sun', en: 'Themes', bn: 'থিম' },
  effect: { icon: 'party', en: 'Effects', bn: 'ইফেক্ট' },
  avatar: { icon: 'user-circle', en: 'Avatars', bn: 'অ্যাভাটার' },
};
const ITEM_ICON: Record<string, IconName> = { pu_fifty_fifty: 'divide', pu_time_boost: 'timer', pu_double_score: 'crosshair', pu_hint: 'bulb' };
const MISSION_ICON: Record<string, IconName> = { target: 'target', swords: 'swords', trophy: 'trophy', brain: 'brain', calendar: 'calendar', bolt: 'bolt', crown: 'crown', globe: 'globe', users: 'users', star: 'star', medal: 'medal', flame: 'fire', fire: 'fire', gift: 'gift' };
const PERIOD: Record<Mission['period'], { en: string; bn: string; icon: IconName }> = {
  daily: { en: 'Today’s missions', bn: 'আজকের মিশন', icon: 'calendar' },
  weekly: { en: 'This week', bn: 'সাপ্তাহিক মিশন', icon: 'trophy' },
  once: { en: 'Special missions', bn: 'বিশেষ মিশন', icon: 'star' },
};

function Missions() {
  const qc = useQueryClient();
  const t = useT();
  const lang = useLang();
  const { data, isLoading } = useMissions();
  const [busy, setBusy] = useState<number | null>(null);
  const [burst, setBurst] = useState<number | null>(null);
  const claim = async (m: Mission) => {
    setBusy(m.id);
    try {
      const r = await api<{ coins: number; xp: number }>(`/missions/${m.id}/claim`, { method: 'POST', body: {} });
      sfx('reward');
      haptic('success');
      setBurst(m.id);
      setTimeout(() => setBurst(null), 900);
      toast.success(t('Reward claimed!', 'রিওয়ার্ড পেয়েছেন!'), [r.coins ? t(`+${r.coins} coins`, `+${num(r.coins)} কয়েন`) : '', r.xp ? `+${num(r.xp)} XP` : ''].filter(Boolean).join(' · '), 'gift');
      void qc.invalidateQueries({ queryKey: ['missions'] });
    } catch (e) {
      toast.error(t('Could not claim', 'Claim করা যায়নি'), friendlyError(e));
    } finally {
      setBusy(null);
    }
  };
  if (isLoading) return <Skeleton kind="card" lines={4} />;
  const items = data?.items ?? [];
  if (!items.length) return <Empty icon="target" tone="success" title={t('No missions right now', 'এখন কোনো মিশন নেই')} body={t('Check back soon for new challenges.', 'শীঘ্রই নতুন মিশন আসবে।')} />;
  const groups = (['daily', 'weekly', 'once'] as const).map((p) => [p, items.filter((m) => m.period === p)] as const).filter(([, l]) => l.length);
  return (
    <div className="stack">
      <p className="small muted">{t('Complete a mission and you’ll get a notification — then claim your reward here. Daily missions reset at midnight, weekly ones on Monday.', 'শর্ত পূরণ করলেই নোটিফিকেশন পাবেন — তারপর এখানে এসে Claim করুন। দৈনিক মিশন রাত ১২টায়, সাপ্তাহিক মিশন সোমবার নতুন হয়।')}</p>
      {groups.map(([period, list]) => (
        <section key={period} className="stack">
          <div className="section-label"><Icon name={PERIOD[period].icon} size={14} /> {t(PERIOD[period].en, PERIOD[period].bn)}</div>
          {list.map((m) => {
            const pct = Math.round((m.progress / m.target) * 100);
            const ready = m.completed && !m.claimed;
            return (
              <article key={m.id} className={`mission ${ready ? 'ready' : ''} ${m.claimed ? 'claimed' : ''}`}>
                <IconTile name={MISSION_ICON[m.icon] ?? 'target'} tone={ready ? 'coin' : m.claimed ? 'success' : 'primary'} size={46} anim={ready ? 'wiggle' : undefined} />
                <div className="mi-body">
                  <strong>{m.title}</strong>
                  {m.description && <span className="small muted">{m.description}</span>}
                  <div className="mi-bar" role="progressbar" aria-valuemin={0} aria-valuemax={m.target} aria-valuenow={m.progress} aria-label={m.title}>
                    <span style={{ width: `${pct}%` }} />
                  </div>
                  <span className="mi-meta">
                    <span className="num">{num(m.progress, lang)} / {num(m.target, lang)}</span>
                    {!!m.rewardCoins && <span className="coin-text"><Icon name="coin" size={15} /> {num(m.rewardCoins, lang)}</span>}
                    {!!m.rewardXp && <span className="xp-text"><Icon name="xp" size={15} /> {num(m.rewardXp, lang)} XP</span>}
                  </span>
                </div>
                {m.claimed ? (
                  <span className="chip success"><Icon name="check" /> {t('Done', 'নেওয়া হয়েছে')}</span>
                ) : ready ? (
                  <button className="btn sm primary claim-btn" disabled={busy === m.id} onClick={() => void claim(m)}>
                    {busy === m.id ? <span className="spinner" /> : <Icon name="gift" />} Claim
                  </button>
                ) : (
                  <span className="mi-pct num">{num(pct, lang)}%</span>
                )}
                {burst === m.id && (
                  <span className="claim-burst" aria-hidden>
                    {Array.from({ length: 6 }, (_, i) => <Icon key={i} name="coin" size={18} style={{ ['--i' as any]: i }} />)}
                  </span>
                )}
              </article>
            );
          })}
        </section>
      ))}
    </div>
  );
}

type VerifiedStatus = {
  enabled: boolean;
  verified: boolean;
  price: number;
  eligible: boolean;
  requirements: { matches: number; winRate: number; autoTopN: number };
  progress: { played: number; won: number; winRate: number };
};

/** Verified badge: only for real top players — shows the requirements and lets eligible players claim it. */
function VerifiedCard() {
  const t = useT();
  const lang = useLang();
  const qc = useQueryClient();
  const coins = useAuth((s) => s.user?.coins ?? 0);
  const { data } = useQuery({ queryKey: ['verified'], queryFn: () => api<VerifiedStatus>('/verified') });
  const [busy, setBusy] = useState(false);
  if (!data?.enabled) return null;
  const r = data.requirements;
  const p = data.progress;
  const matchPct = Math.min(100, Math.round((p.played / r.matches) * 100));
  const ratePct = Math.min(100, Math.round((p.winRate / r.winRate) * 100));
  const claim = async () => {
    setBusy(true);
    try {
      await api('/verified/claim', { method: 'POST', body: {} });
      sfx('reward');
      haptic('success');
      toast.success(t('You are verified!', 'আপনি এখন ভেরিফায়েড!'), t('The badge now shows next to your name.', 'এখন আপনার নামের পাশে ব্যাজ দেখাবে।'), 'verified');
      void qc.invalidateQueries({ queryKey: ['verified'] });
      void useAuth.getState().loadMe();
    } catch (e) {
      toast.error(t('Could not claim', 'Claim করা যায়নি'), friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={`verified-card ${data.verified ? 'done' : ''}`}>
      <div className="vc-head">
        <VerifiedBadge size={44} />
        <div className="grow">
          <b>{t('Verified badge', 'ভেরিফায়েড ব্যাজ')}</b>
          <p className="xs">{t('Only for top players — shows next to your name everywhere.', 'শুধু সেরা প্লেয়ারদের জন্য — সব জায়গায় নামের পাশে দেখাবে।')}</p>
        </div>
      </div>
      {data.verified ? (
        <span className="chip success"><Icon name="check" /> {t('You are verified', 'আপনি ভেরিফায়েড')}</span>
      ) : (
        <>
          <div className="vc-req">
            <div>
              <span className="xs">{t('Real matches (30 days)', 'আসল ম্যাচ (৩০ দিন)')}</span>
              <b className="num">{num(p.played, lang)} / {num(r.matches, lang)}</b>
              <i><span style={{ width: `${matchPct}%` }} /></i>
            </div>
            <div>
              <span className="xs">{t('Win rate', 'জয়ের হার')}</span>
              <b className="num">{num(p.winRate, lang)}% / {num(r.winRate, lang)}%</b>
              <i><span style={{ width: `${ratePct}%` }} /></i>
            </div>
          </div>
          <p className="xs vc-note">
            {t(`The top ${r.autoTopN} eligible players of the month get it free. Eligible players can also claim it now.`, `মাসের সেরা ${num(r.autoTopN, lang)} জন যোগ্য প্লেয়ার এটা ফ্রি পান। যোগ্য হলে এখনই Claim-ও করতে পারবেন।`)}
          </p>
          <button className="btn primary block" disabled={!data.eligible || busy || coins < data.price} onClick={() => void claim()}>
            {busy ? <span className="spinner" /> : <Icon name="coin" size={18} />}{' '}
            {data.eligible
              ? coins >= data.price
                ? t(`Claim for ${data.price.toLocaleString()} coins`, `${num(data.price, lang)} কয়েনে Claim করুন`)
                : t(`Need ${data.price.toLocaleString()} coins`, `${num(data.price, lang)} কয়েন লাগবে`)
              : t('Locked — reach the targets above', 'লক — উপরের লক্ষ্য পূরণ করুন')}
          </button>
        </>
      )}
    </section>
  );
}

export default function Shop() {
  const t = useT();
  const lang = useLang();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'missions' ? 'missions' : 'items';
  const missions = useMissions();
  const claimable = missions.data?.claimable ?? 0;
  const coins = useAuth((s) => s.user?.coins ?? 0);
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({ queryKey: ['shop'], queryFn: async () => (await api<{ items: any[] }>('/shop')).items });
  const [buying, setBuying] = useState<string | null>(null);
  const buy = async (key: string, price: number) => {
    if (price > coins) {
      haptic('error');
      return toast.error(t('Not enough coins', 'যথেষ্ট কয়েন নেই'), t('Win battles, complete missions and claim daily rewards to earn more.', 'ব্যাটল জিতে, মিশন শেষ করে আর ডেইলি রিওয়ার্ড নিয়ে কয়েন জমান।'));
    }
    setBuying(key);
    try {
      await api('/shop/purchase', { body: { itemKey: key } });
      sfx('reward');
      haptic('success');
      toast.success(t('Purchased!', 'কেনা হয়েছে!'), undefined, 'shop');
      void qc.invalidateQueries({ queryKey: ['shop'] });
      void qc.invalidateQueries({ queryKey: ['power-ups'] });
    } catch (e) {
      toast.error(t('Purchase failed', 'কেনা যায়নি'), friendlyError(e));
    } finally {
      setBuying(null);
    }
  };
  const groups = new Map<string, any[]>();
  for (const i of data ?? []) groups.set(i.type, [...(groups.get(i.type) ?? []), i]);
  return (
    <PullToRefresh onRefresh={() => Promise.all([refetch(), missions.refetch()])}>
      <div className="page stack">
        <PageHeader
          title={t('Shop & missions', 'শপ ও মিশন')}
          back
          action={
            <span className="pill coin">
              <Icon name="coin" size={20} /> <CountUp value={coins} />
            </span>
          }
        />
        <div className="tabs" role="tablist" aria-label={t('Shop', 'শপ')}>
          <button role="tab" aria-selected={tab === 'items'} onClick={() => setParams({}, { replace: true })}><Icon name="shop" /> {t('Items', 'আইটেম')}</button>
          <button role="tab" aria-selected={tab === 'missions'} onClick={() => setParams({ tab: 'missions' }, { replace: true })}>
            <Icon name="target" /> {t('Missions & rewards', 'মিশন ও রিওয়ার্ড')}
            {claimable > 0 && <span className="tab-badge">{num(claimable, lang)}</span>}
          </button>
        </div>
        {tab === 'missions' ? (
          <Missions />
        ) : (
          <>
            <VerifiedCard />
            <p className="small muted row top gap-sm">
              <Icon name="shield-check" size={18} style={{ color: 'var(--success)', marginTop: 1 }} />
              {t('Cosmetics and practice power-ups, bought only with coins you earn by playing. Ranked battles stay fair — power-ups are disabled there.', 'শুধু খেলে অর্জিত কয়েন দিয়ে কেনা যায় এমন সাজসজ্জা আর অনুশীলনের পাওয়ার-আপ। র‍্যাংকড ব্যাটলে পাওয়ার-আপ বন্ধ থাকে, তাই খেলা সবসময় ন্যায্য।')}
            </p>
            {isLoading ? (
              <Skeleton kind="card" lines={3} />
            ) : (
              [...groups].map(([type, items]) => (
                <section key={type}>
                  <div className="section-label"><Icon name={TYPE_INFO[type]?.icon ?? 'shop'} size={14} /> {t(TYPE_INFO[type]?.en ?? type, TYPE_INFO[type]?.bn ?? type)}</div>
                  <div className="shop-grid">
                    {items.map((i) => {
                      const owned = type !== 'power_up' && i.owned > 0;
                      return (
                        <div key={i.key} className={`shop-item ${owned ? 'owned' : ''}`}>
                          <div className={`si-art type-${type} ${type === 'frame' ? `frame-${i.data?.css}` : ''}`}>
                            <Icon name={ITEM_ICON[i.key] ?? TYPE_INFO[type]?.icon ?? 'gift'} size={28} />
                          </div>
                          <strong>{i.name}</strong>
                          <span className="xs muted">{i.description}</span>
                          {owned ? (
                            <span className="chip success"><Icon name="check" /> {t('Owned', 'আছে')}</span>
                          ) : (
                            <button className="btn sm soft price-btn" disabled={buying === i.key} onClick={() => void buy(i.key, i.price)}>
                              {buying === i.key ? <span className="spinner" /> : <Icon name="coin" size={16} />} {num(i.price, lang)}
                              {type === 'power_up' && i.owned ? <span className="xs faint"> · {t('have', 'আছে')} {num(i.owned, lang)}</span> : null}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))
            )}
          </>
        )}
      </div>
    </PullToRefresh>
  );
}
