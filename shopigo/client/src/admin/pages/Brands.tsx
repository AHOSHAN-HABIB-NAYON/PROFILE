import { img } from '../../lib/image';
import { Badge } from '../../components/ui';
import { ResourcePage } from '../components/ResourcePage';

interface Brand { id: number; name: string; slug: string; logo: string | null; is_active: number; sort_order: number }

export default function Brands() {
  return (
    <ResourcePage<Brand>
      config={{
        title: 'Brands', endpoint: '/api/admin/catalog/brands', queryKey: 'admin-brands',
        defaults: { name: '', slug: '', logo: '', is_active: true, sort_order: 0 },
        toBody: (f) => ({ ...f, logo: f.logo || null, sort_order: Number(f.sort_order) || 0 }),
        fields: [
          { key: 'name', label: 'Name', type: 'text', required: true },
          { key: 'slug', label: 'Slug', type: 'text', placeholder: 'auto' },
          { key: 'logo', label: 'Logo', type: 'image', folder: 'brands' },
          { key: 'sort_order', label: 'Sort order', type: 'number' },
          { key: 'is_active', label: 'Active', type: 'switch' },
        ],
        columns: [
          { key: 'name', label: 'Brand', render: (b) => <span className="flex items-center gap-3">{b.logo ? <img src={img(b.logo, 'thumb')} alt="" className="size-10 rounded-lg object-contain" /> : <span className="grid size-10 place-items-center rounded-lg bg-soft font-bold">{b.name[0]}</span>}<span className="font-semibold">{b.name}</span></span> },
          { key: 'status', label: 'Status', render: (b) => <Badge tone={b.is_active ? 'green' : 'gray'}>{b.is_active ? 'Active' : 'Hidden'}</Badge> },
        ],
      }}
    />
  );
}
