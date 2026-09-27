import { Badge } from '../../components/ui';
import { ResourcePage } from '../components/ResourcePage';

interface PageRow { id: number; slug: string; title: string; content: string | null; seo_title: string | null; seo_description: string | null; is_active: number; show_in_footer: number }

export default function Pages() {
  return (
    <ResourcePage<PageRow>
      config={{
        title: 'Pages', subtitle: 'About, policies and other content pages.', endpoint: '/api/admin/marketing/pages', queryKey: 'admin-pages', deleteLabel: 'Page deleted', invalidate: ['bootstrap'],
        defaults: { slug: '', title: '', content: '', seo_title: '', seo_description: '', is_active: true, show_in_footer: true },
        fields: [
          { key: 'title', label: 'Title', type: 'text', required: true },
          { key: 'slug', label: 'Slug', type: 'text', required: true, placeholder: 'about-us' },
          { key: 'content', label: 'Content', type: 'richtext' },
          { key: 'seo_title', label: 'SEO title', type: 'text' },
          { key: 'seo_description', label: 'SEO description', type: 'text' },
          { key: 'is_active', label: 'Published', type: 'switch' },
          { key: 'show_in_footer', label: 'Show in footer', type: 'switch' },
        ],
        columns: [
          { key: 't', label: 'Page', render: (p) => <span><span className="font-semibold">{p.title}</span><span className="block text-[12px] text-muted">/page/{p.slug}</span></span> },
          { key: 's', label: 'Status', render: (p) => <Badge tone={p.is_active ? 'green' : 'gray'}>{p.is_active ? 'Published' : 'Hidden'}</Badge> },
        ],
      }}
    />
  );
}
