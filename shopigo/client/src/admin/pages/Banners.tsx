import { dateOnly } from '../../lib/format';
import { img } from '../../lib/image';
import { Badge } from '../../components/ui';
import { ResourcePage } from '../components/ResourcePage';

interface Banner { id: number; title: string | null; subtitle: string | null; button_text: string | null; image: string; mobile_image: string | null; link_type: string; link_value: string | null; starts_at: string | null; ends_at: string | null; sort_order: number; is_active: number }

export default function Banners() {
  return (
    <ResourcePage<Banner>
      config={{
        title: 'Banners', subtitle: 'Recommended size 1600×700 (mobile 1080×1080). Images are resized & compressed automatically.', endpoint: '/api/admin/marketing/banners', queryKey: 'admin-banners', invalidate: ['home'],
        defaults: { title: '', subtitle: '', button_text: 'Shop Now', image: '', mobile_image: '', link_type: 'none', link_value: '', starts_at: '', ends_at: '', sort_order: 0, is_active: true },
        toBody: (f) => ({ ...f, mobile_image: f.mobile_image || null, link_value: f.link_value || null, sort_order: Number(f.sort_order) || 0 }),
        fields: [
          { key: 'image', label: 'Banner image', type: 'image', folder: 'banners', required: true },
          { key: 'mobile_image', label: 'Mobile image (optional)', type: 'image', folder: 'banners' },
          { key: 'title', label: 'Title', type: 'text' },
          { key: 'subtitle', label: 'Subtitle', type: 'text' },
          { key: 'button_text', label: 'Button text', type: 'text' },
          { key: 'link_type', label: 'Link to', type: 'select', options: [{ value: 'none', label: 'Nothing' }, { value: 'product', label: 'Product (slug)' }, { value: 'category', label: 'Category (slug)' }, { value: 'url', label: 'URL' }] },
          { key: 'link_value', label: 'Link value', type: 'text', show: (f) => f.link_type !== 'none', placeholder: 'e.g. wireless-earbuds-pro or /combos' },
          { key: 'sort_order', label: 'Sort order', type: 'number' },
          { key: 'starts_at', label: 'Start date', type: 'datetime' },
          { key: 'ends_at', label: 'End date', type: 'datetime' },
          { key: 'is_active', label: 'Active', type: 'switch' },
        ],
        columns: [
          { key: 'img', label: 'Banner', render: (b) => <span className="flex items-center gap-3"><img src={img(b.image, 'thumb')} alt="" className="h-12 w-24 rounded-xl object-cover" /><span><span className="font-semibold">{b.title || 'Untitled'}</span><span className="block text-[12px] text-muted">{b.link_type !== 'none' ? `${b.link_type}: ${b.link_value}` : 'No link'}</span></span></span> },
          { key: 'sched', label: 'Schedule', render: (b) => <span className="text-[12.5px]">{b.starts_at || b.ends_at ? `${dateOnly(b.starts_at)} → ${dateOnly(b.ends_at)}` : 'Always'}</span> },
          { key: 'sort', label: 'Order', render: (b) => b.sort_order },
          { key: 'status', label: 'Status', render: (b) => <Badge tone={b.is_active ? 'green' : 'gray'}>{b.is_active ? 'Active' : 'Off'}</Badge> },
        ],
      }}
    />
  );
}
