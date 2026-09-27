import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { api } from '../../lib/api';
import { PageSpinner } from '../../components/ui';
import { TopBar } from '../components/chrome';
import NotFound from './NotFound';

export default function Page() {
  const { slug = '' } = useParams();
  const { data, isLoading } = useQuery({ queryKey: ['page', slug], queryFn: () => api.get<{ title: string; content: string | null }>(`/api/public/pages/${slug}`) });
  if (isLoading) return <PageSpinner />;
  if (!data) return <NotFound />;
  return (
    <div>
      <TopBar title={data.title} />
      <article className="mx-auto max-w-3xl px-4 md:pt-8">
        <h1 className="mb-4 hidden text-[28px] font-extrabold md:block">{data.title}</h1>
        {/* Content is sanitised server-side (allow-list) before it is stored. */}
        <div className="card prose-shop p-6" dangerouslySetInnerHTML={{ __html: data.content ?? '' }} />
      </article>
    </div>
  );
}
