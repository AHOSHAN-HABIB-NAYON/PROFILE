import { Link } from 'react-router';
import { SearchX } from 'lucide-react';
import { useT } from '../../lib/i18n';
import { Button } from '../../components/ui';

export default function NotFound() {
  const t = useT();
  return (
    <div className="grid min-h-[65vh] place-items-center px-6 text-center">
      <div>
        <div className="mx-auto mb-5 grid size-20 place-items-center rounded-[28px] bg-brand-50 text-brand-500"><SearchX className="size-9" /></div>
        <p className="text-[13px] font-extrabold tracking-[0.3em] text-brand-500">404</p>
        <h1 className="mt-1 text-[24px] font-extrabold">{t('notFound')}</h1>
        <p className="mt-2 max-w-sm text-[14.5px] text-muted">{t('notFoundText')}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link to="/"><Button>{t('goHome')}</Button></Link>
          <Link to="/search"><Button variant="soft">{t('search')}</Button></Link>
        </div>
      </div>
    </div>
  );
}
