import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { CategoryIcon } from '../../components/CategoryIcon';
import { Badge } from '../../components/ui';
import { ResourcePage } from '../components/ResourcePage';
import { Thumb } from '../components/kit';

interface Cat { id: number; parent_id: number | null; name: string; slug: string; description: string | null; icon_type: string; icon_value: string | null; image: string | null; sort_order: number; is_active: number; show_on_home: number; seo_title: string | null; seo_description: string | null; product_count: number }

export default function Categories() {
  const all = useQuery({ queryKey: ['admin-categories'], queryFn: () => api.get<Cat[]>('/api/admin/catalog/categories') });
  const parents = (all.data ?? []).filter((c) => !c.parent_id);
  return (
    <ResourcePage<Cat>
      config={{
        title: 'Categories', subtitle: 'Choose a Font Awesome icon or upload your own — no coding needed.', endpoint: '/api/admin/catalog/categories', queryKey: 'admin-categories', invalidate: ['bootstrap'],
        defaults: { name: '', slug: '', parent_id: '', description: '', icon_type: 'fa', icon_value: 'fa-solid fa-tag', image: '', sort_order: 0, is_active: true, show_on_home: true, seo_title: '', seo_description: '' },
        toBody: (f) => ({ ...f, parent_id: f.parent_id ? Number(f.parent_id) : null, icon_value: f.icon_type === 'image' ? f.icon_image || f.icon_value : f.icon_value, image: f.image || null, sort_order: Number(f.sort_order) || 0 }),
        toForm: (r) => ({ ...r, icon_image: r.icon_type === 'image' ? r.icon_value : '' }),
        fields: [
          { key: 'name', label: 'Name', type: 'text', required: true },
          { key: 'slug', label: 'Slug', type: 'text', placeholder: 'auto' },
          { key: 'parent_id', label: 'Parent category', type: 'select', options: [{ value: '', label: '— Top level —' }, ...parents.map((p) => ({ value: p.id, label: p.name }))] },
          { key: 'sort_order', label: 'Sort order', type: 'number' },
          { key: 'icon_type', label: 'Icon type', type: 'select', options: [{ value: 'fa', label: 'Font Awesome icon' }, { value: 'image', label: 'Uploaded icon/image' }, { value: 'none', label: 'None' }] },
          { key: 'icon_value', label: 'Font Awesome icon', type: 'fa-icon', show: (f) => f.icon_type === 'fa', full: true },
          { key: 'icon_image', label: 'Custom icon', type: 'icon-image', folder: 'categories', show: (f) => f.icon_type === 'image' },
          { key: 'image', label: 'Category image (cards)', type: 'image', folder: 'categories' },
          { key: 'description', label: 'Description', type: 'textarea' },
          { key: 'is_active', label: 'Active', type: 'switch' },
          { key: 'show_on_home', label: 'Show on home page', type: 'switch' },
          { key: 'seo_title', label: 'SEO title', type: 'text' },
          { key: 'seo_description', label: 'SEO description', type: 'text' },
        ],
        columns: [
          { key: 'name', label: 'Category', render: (c) => <span className="flex items-center gap-3">{c.image ? <Thumb path={c.image} /> : <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-500"><CategoryIcon type={c.icon_type} value={c.icon_value} name={c.name} className="text-[18px]" /></span>}<span><span className="font-semibold">{c.parent_id ? '↳ ' : ''}{c.name}</span><span className="block text-[12px] text-muted">/{c.slug}</span></span></span> },
          { key: 'products', label: 'Products', render: (c) => c.product_count },
          { key: 'sort', label: 'Order', render: (c) => c.sort_order },
          { key: 'status', label: 'Status', render: (c) => <Badge tone={c.is_active ? 'green' : 'gray'}>{c.is_active ? 'Active' : 'Hidden'}</Badge> },
        ],
      }}
    />
  );
}
