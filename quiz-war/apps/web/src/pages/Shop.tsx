import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { PageHeader } from '../components/AppShell';
import { CountUp, Skeleton } from '../components/Feedback';
import { useMissions, type Mission } from '../hooks/queries';
import { api, friendlyError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { haptic } from '../lib/platform';
import { sfx } from '../lib/sound';
import { toast } from '../lib/toast';

const TYPE_LABEL: Record<string, string> = { power_up: '⚡ Power-ups', frame: '🖼️ Frames', title: '🏷️ Titles', theme: '🎨 Themes', effect: '✨ Effects', avatar: '🙂 Avatars' };
const PREVIEW: Record<string, string> = { pu_fifty_fifty: '½', pu_time_boost: '⏱️', pu_double_score: '×2', pu_hint: '💡' };
const MISSION_ICON: Record<string, string> = { target: '🎯', swords: '⚔️', trophy: '🏆', brain: '🧠', calendar: '📅', bolt: '⚡', crown: '👑', globe: '🌐', users: '👥', star: '⭐', medal: '🏅', flame: '🔥', gift: '🎁' };
const PERIOD_LABEL: Record<string, string> = { daily: 'আজকের মিশন', weekly: 'সাপ্তাহিক মিশন', once: 'বিশেষ মিশন' };

function Missions() {
  const qc = useQueryClient();
  const { data, isLoading } = useMissions();
  const [busy, setBusy] = useState<number | null>(null);
  const claim = async (m: Mission) => {
    setBusy(m.id);
    try {
      const r = await api<{ coins: number; xp: number }>(`/missions/${m.id}/claim`, { method: 'POST', body: {} });
      sfx('reward');
      haptic('success');
      toast.success('রিওয়ার্ড পেয়েছেন!', [r.coins ? `+${r.coins} কয়েন` : '', r.xp ? `+${r.xp} XP` : ''].filter(Boolean).join(' · '), '🎁');
      void qc.invalidateQueries({ queryKey: ['missions'] });
    } catch (e) {
      toast.error('Claim করা যায়নি', friendlyError(e));
    } finally {
      setBusy(null);
    }
  };
  if (isLoading) return <Skeleton kind="card" lines={4} />;
  const items = data?.items ?? [];
  const groups = (['daily', 'weekly', 'once'] as const).map((p) => [p, items.filter((m) => m.period === p)] as const).filter(([, l]) => l.length);
  return (
    <div className="stack">
      <p className="small muted">শর্ত পূরণ করলেই নোটিফিকেশন পাবেন — তারপর এখানে এসে Claim করুন। দৈনিক মিশন রাত ১২টায়, সাপ্তাহিক মিশন সোমবার নতুন হয়।</p>
      {groups.map(([period, list]) => (
        <section key={period} className="stack">
          <div className="section-label">{PERIOD_LABEL[period]}</div>
          {list.map((m) => {
            const pct = Math.round((m.progress / m.target) * 100);
            const ready = m.completed && !m.claimed;
            return (
              <article key={m.id} className={`mission ${ready ? 'ready' : ''} ${m.claimed ? 'claimed' : ''}`}>
                <span className="mi-icon" aria-hidden>{MISSION_ICON[m.icon] ?? '🎯'}</span>
                <div className="mi-body">
                  <strong>{m.title}</strong>
                  {m.description && <span className="small muted">{m.description}</span>}
                  <div className="mi-bar" role="progressbar" aria-valuemin={0} aria-valuemax={m.target} aria-valuenow={m.progress} aria-label={m.title}><span style={{ width: `${pct}%` }} /></div>
                  <span className="small faint">{m.progress} / {m.target} · {[m.rewardCoins ? `🪙 ${m.rewardCoins}` : '', m.rewardXp ? `⭐ ${m.rewardXp} XP` : ''].filter(Boolean).join('  ')}</span>
                </div>
                {m.claimed ? <span className="chip success">নেওয়া হয়েছে ✓</span>
                  : ready ? <button className="btn sm primary claim-btn" disabled={busy === m.id} onClick={() => void claim(m)}>{busy === m.id ? '…' : 'Claim'}</button>
                  : <span className="chip">{pct}%</span>}
              </article>
            );
          })}
        </section>
      ))}
      {!items.length && <p className="muted center">এখন কোনো মিশন নেই।</p>}
    </div>
  );
}

export default function Shop() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'missions' ? 'missions' : 'items';
  const missions = useMissions();
  const claimable = missions.data?.claimable ?? 0;
  const coins = useAuth((s) => s.user?.coins ?? 0);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['shop'], queryFn: async () => (await api<{ items: any[] }>('/shop')).items });
  const buy = async (key: string, price: number) => {
    if (price > coins) return toast.error('Not enough coins', 'Win battles and claim daily rewards to earn more.');
    try {
      await api('/shop/purchase', { body: { itemKey: key } });
      sfx('reward');
      haptic('success');
      toast.success('Purchased!', undefined, '🛍️');
      void qc.invalidateQueries({ queryKey: ['shop'] });
      void qc.invalidateQueries({ queryKey: ['power-ups'] });
    } catch (e) {
      toast.error('Purchase failed', friendlyError(e));
    }
  };
  const groups = new Map<string, any[]>();
  for (const i of data ?? []) groups.set(i.type, [...(groups.get(i.type) ?? []), i]);
  return (
    <div className="page stack">
      <PageHeader title="Shop" back action={<span className="pill coin">🪙 <CountUp value={coins} /></span>} />
      <div className="tabs" role="tablist" aria-label="Shop">
        <button role="tab" aria-selected={tab === 'items'} onClick={() => setParams({}, { replace: true })}>🛍️ আইটেম</button>
        <button role="tab" aria-selected={tab === 'missions'} onClick={() => setParams({ tab: 'missions' }, { replace: true })}>
          🎯 মিশন ও রিওয়ার্ড{claimable > 0 && <span className="tab-badge">{claimable}</span>}
        </button>
      </div>
      {tab === 'missions' ? <Missions /> : <>
      <p className="small muted">Cosmetics and practice power-ups. Ranked battles are always fair — power-ups are disabled there and nothing here affects your rating.</p>
      {isLoading ? <Skeleton kind="card" lines={3} /> : [...groups].map(([type, items]) => (
        <section key={type}>
          <div className="section-label">{TYPE_LABEL[type] ?? type}</div>
          <div className="mode-grid">
            {items.map((i) => (
              <div key={i.key} className="mode-card">
                <span className="m-icon">{PREVIEW[i.key] ?? (type === 'frame' ? '🖼️' : type === 'title' ? '🏷️' : type === 'theme' ? '🎨' : '✨')}</span>
                <strong>{i.name}</strong>
                <span>{i.description}</span>
                {type !== 'power_up' && i.owned > 0 ? (
                  <span className="chip success">Owned ✓</span>
                ) : (
                  <button className="btn sm soft" onClick={() => void buy(i.key, i.price)}>🪙 {i.price}{type === 'power_up' && i.owned ? ` · have ${i.owned}` : ''}</button>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
      </>}
    </div>
  );
}
