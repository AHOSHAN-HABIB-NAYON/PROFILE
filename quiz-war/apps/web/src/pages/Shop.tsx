import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../components/AppShell';
import { CountUp, Skeleton } from '../components/Feedback';
import { api, friendlyError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { haptic } from '../lib/platform';
import { sfx } from '../lib/sound';
import { toast } from '../lib/toast';

const TYPE_LABEL: Record<string, string> = { power_up: '⚡ Power-ups', frame: '🖼️ Frames', title: '🏷️ Titles', theme: '🎨 Themes', effect: '✨ Effects', avatar: '🙂 Avatars' };
const PREVIEW: Record<string, string> = { pu_fifty_fifty: '½', pu_time_boost: '⏱️', pu_double_score: '×2', pu_hint: '💡' };

export default function Shop() {
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
    </div>
  );
}
