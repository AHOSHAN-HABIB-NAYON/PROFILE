import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { dateOnly, money } from '../../lib/format';
import { Badge } from '../../components/ui';
import { ResourcePage } from '../components/ResourcePage';
import { SettingsForm } from '../components/SettingsForm';
import { Panel } from '../components/kit';

interface Coupon { id: number; code: string; description: string | null; type: 'percent' | 'fixed'; value: number; min_order: number; max_discount: number | null; starts_at: string | null; expires_at: string | null; usage_limit: number | null; per_customer_limit: number | null; used_count: number; applies_to: string; product_ids: number[]; category_ids: number[]; is_active: number; highlight_on_home: number }

export default function Coupons() {
  const cats = useQuery({ queryKey: ['admin-categories'], queryFn: () => api.get<Array<{ id: number; name: string }>>('/api/admin/catalog/categories') });
  const prods = useQuery({ queryKey: ['product-lookup', ''], queryFn: () => api.get<Array<{ id: number; name: string }>>('/api/admin/products/lookup?q=') });
  return (
    <div className="space-y-4">
      <ResourcePage<Coupon>
        config={{
          title: 'Coupons', endpoint: '/api/admin/marketing/coupons', queryKey: 'admin-coupons', invalidate: ['home'],
          defaults: { code: '', description: '', type: 'percent', value: 10, min_order: 0, max_discount: '', starts_at: '', expires_at: '', usage_limit: '', per_customer_limit: '', applies_to: 'all', product_ids: [], category_ids: [], is_active: true, highlight_on_home: false },
          toBody: (f) => ({ ...f, value: Number(f.value), min_order: Number(f.min_order || 0) }),
          fields: [
            { key: 'code', label: 'Code', type: 'text', required: true, placeholder: 'EID25' },
            { key: 'type', label: 'Type', type: 'select', options: [{ value: 'percent', label: 'Percentage (%)' }, { value: 'fixed', label: 'Fixed amount (৳)' }] },
            { key: 'value', label: 'Value', type: 'number', required: true },
            { key: 'max_discount', label: 'Maximum discount (৳)', type: 'number', hint: 'For percentage coupons' },
            { key: 'min_order', label: 'Minimum order (৳)', type: 'number' },
            { key: 'usage_limit', label: 'Total usage limit', type: 'number', hint: 'Empty = unlimited' },
            { key: 'per_customer_limit', label: 'Per customer (phone) limit', type: 'number' },
            { key: 'applies_to', label: 'Applies to', type: 'select', options: [{ value: 'all', label: 'Whole cart' }, { value: 'products', label: 'Specific products' }, { value: 'categories', label: 'Specific categories' }] },
            { key: 'product_ids', label: 'Products', type: 'multiselect', show: (f) => f.applies_to === 'products', options: (prods.data ?? []).map((p) => ({ value: p.id, label: p.name })) },
            { key: 'category_ids', label: 'Categories', type: 'multiselect', show: (f) => f.applies_to === 'categories', options: (cats.data ?? []).map((c) => ({ value: c.id, label: c.name })) },
            { key: 'starts_at', label: 'Starts', type: 'datetime' },
            { key: 'expires_at', label: 'Expires', type: 'datetime' },
            { key: 'description', label: 'Description (shown to customers)', type: 'text', full: true },
            { key: 'is_active', label: 'Active', type: 'switch' },
            { key: 'highlight_on_home', label: 'Highlight on home page', type: 'switch' },
          ],
          columns: [
            { key: 'code', label: 'Code', render: (c) => <span><span className="font-mono font-bold">{c.code}</span><span className="block text-[12px] text-muted">{c.description}</span></span> },
            { key: 'value', label: 'Discount', render: (c) => (c.type === 'percent' ? `${c.value}%${c.max_discount ? ` (max ${money(c.max_discount)})` : ''}` : money(c.value)) },
            { key: 'min', label: 'Min order', render: (c) => money(c.min_order) },
            { key: 'used', label: 'Used', render: (c) => `${c.used_count}${c.usage_limit ? ` / ${c.usage_limit}` : ''}` },
            { key: 'exp', label: 'Expires', render: (c) => dateOnly(c.expires_at) },
            { key: 'status', label: 'Status', render: (c) => <span className="flex gap-1"><Badge tone={c.is_active ? 'green' : 'gray'}>{c.is_active ? 'Active' : 'Off'}</Badge>{Boolean(c.highlight_on_home) && <Badge>Home</Badge>}</span> },
          ],
        }}
      />
      <Panel title="Coupon system"><SettingsForm keys={['coupons_enabled']} /></Panel>
    </div>
  );
}
