import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { money } from '../../lib/format';
import type { District } from '../../lib/types';
import { Badge } from '../../components/ui';
import { Panel } from '../components/kit';
import { ResourcePage } from '../components/ResourcePage';
import { SettingsForm } from '../components/SettingsForm';

interface Rule { id: number; name: string; type: string; district: string | null; charge: number; min_order: number | null; priority: number; is_active: number }

export default function Delivery() {
  const geo = useQuery({ queryKey: ['geo'], queryFn: () => api.get<District[]>('/api/public/geo'), staleTime: Infinity });
  return (
    <div className="space-y-4">
      <Panel title="Delivery charges & Cash on Delivery">
        <SettingsForm groups={['delivery', 'cod']} />
      </Panel>
      <ResourcePage<Rule>
        config={{
          title: 'Delivery rules', subtitle: 'Override the default charges: per-district prices, free delivery above an amount, or a flat rate. Higher priority wins.', endpoint: '/api/admin/marketing/delivery-rules', queryKey: 'admin-delivery-rules', deleteLabel: 'Rule deleted',
          defaults: { name: '', type: 'district', district: '', charge: 0, min_order: '', priority: 0, is_active: true },
          toBody: (f) => ({ ...f, charge: Number(f.charge || 0), priority: Number(f.priority || 0), district: f.district || null }),
          fields: [
            { key: 'name', label: 'Rule name', type: 'text', required: true, placeholder: 'Gazipur same-day' },
            { key: 'type', label: 'Type', type: 'select', options: [{ value: 'district', label: 'District-based charge' }, { value: 'min_order_free', label: 'Free delivery above minimum order' }, { value: 'flat', label: 'Flat charge everywhere' }] },
            { key: 'district', label: 'District', type: 'select', show: (f) => f.type !== 'flat', options: [{ value: '', label: '— Any district —' }, ...(geo.data ?? []).map((d) => ({ value: d.name, label: d.name }))] },
            { key: 'charge', label: 'Charge (৳)', type: 'number', show: (f) => f.type !== 'min_order_free' },
            { key: 'min_order', label: 'Minimum order (৳)', type: 'number', show: (f) => f.type === 'min_order_free' },
            { key: 'priority', label: 'Priority', type: 'number' },
            { key: 'is_active', label: 'Active', type: 'switch' },
          ],
          columns: [
            { key: 'n', label: 'Rule', render: (r) => <span className="font-semibold">{r.name}</span> },
            { key: 't', label: 'Type', render: (r) => (r.type === 'district' ? `District: ${r.district}` : r.type === 'flat' ? 'Flat' : `Free over ${money(r.min_order)}${r.district ? ` (${r.district})` : ''}`) },
            { key: 'c', label: 'Charge', render: (r) => (r.type === 'min_order_free' ? 'Free' : money(r.charge)) },
            { key: 'p', label: 'Priority', render: (r) => r.priority },
            { key: 's', label: 'Status', render: (r) => <Badge tone={r.is_active ? 'green' : 'gray'}>{r.is_active ? 'Active' : 'Off'}</Badge> },
          ],
        }}
      />
    </div>
  );
}
