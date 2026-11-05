import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import { useT } from '../lib/i18n';
import { haptic } from '../lib/platform';
import { Icon } from './Icon';
import { openPromoLink } from './Promo';
import { Sheet } from './Sheet';

type OurApp = { id: number; name: string; subtitle: string; logoUrl: string | null; linkUrl: string };

const isStore = (url: string) => /^market:|play\.google\.com\/store/i.test(url);

const GRAD = ['linear-gradient(130deg,#2563eb,#7c3aed)', 'linear-gradient(130deg,#16a34a,#0d9488)', 'linear-gradient(130deg,#f59e0b,#ea580c)', 'linear-gradient(130deg,#db2777,#9333ea)', 'linear-gradient(130deg,#0ea5e9,#2563eb)'];
const SOLID = ['#2563eb', '#16a34a', '#f59e0b', '#db2777', '#0ea5e9'];

function open(a: OurApp) {
  haptic('tap');
  void api(`/our-apps/${a.id}/click`, { method: 'POST', auth: false }).catch(() => undefined);
  openPromoLink(a.linkUrl);
}

function Logo({ a, i, size }: { a: OurApp; i: number; size: number }) {
  return (
    <span className="oa2-logo" style={{ width: size, height: size, background: a.logoUrl ? '#fff' : SOLID[i % SOLID.length] }}>
      {a.logoUrl ? <img src={a.logoUrl} alt="" loading="lazy" /> : <b style={{ fontSize: size * 0.45 }}>{(a.name.trim()[0] ?? '?').toUpperCase()}</b>}
    </span>
  );
}

/** Home: the team's other apps (admin-managed; hidden when switched off or empty). */
export function HomeOurApps() {
  const t = useT();
  const [all, setAll] = useState(false);
  const { data } = useQuery({ queryKey: ['our-apps'], queryFn: async () => (await api<{ items: OurApp[] }>('/our-apps', { auth: false })).items, staleTime: 10 * 60_000 });
  if (!data?.length) return null;
  const [top, ...rest] = data;
  const cta = (a: OurApp) => (isStore(a.linkUrl) ? t('Install', 'ইনস্টল') : t('Open', 'ওপেন'));
  return (
    <section aria-labelledby="our-apps" className="oa2">
      <div className="section-head">
        <h3 id="our-apps"><Icon name="sparkles" size={18} /> {t('More apps from us', 'আমাদের আরও অ্যাপ')}</h3>
        {data.length > 1 && <button type="button" className="oa2-all" onClick={() => (haptic('tap'), setAll(true))}>{t('See all', 'সব দেখুন')}</button>}
      </div>
      <button type="button" className="oa2-feat" style={{ background: GRAD[0] }} onClick={() => open(top!)}>
        <span className="oa2-tag"><Icon name="star" size={13} /> {t('Our best app', 'আমাদের সেরা অ্যাপ')}</span>
        <span className="oa2-fr">
          <Logo a={top!} i={0} size={64} />
          <span className="grow">
            <b>{top!.name}</b>
            {top!.subtitle && <small>{top!.subtitle}</small>}
          </span>
        </span>
        <span className="oa2-fbtn"><Icon name={isStore(top!.linkUrl) ? 'download' : 'external'} size={18} /> {isStore(top!.linkUrl) ? t('Install', 'ইনস্টল করুন') : t('Open', 'ওপেন করুন')}</span>
      </button>
      {rest.length > 0 && (
        <div className="oa2-row">
          {rest.map((a, i) => (
            <button key={a.id} type="button" className="oa2-card" onClick={() => open(a)}>
              <Logo a={a} i={i + 1} size={52} />
              <b className="ellipsis">{a.name}</b>
              <small className="ellipsis">{a.subtitle || (isStore(a.linkUrl) ? 'Google Play' : t('Website', 'ওয়েবসাইট'))}</small>
              <span className="oa2-btn">{cta(a)}</span>
            </button>
          ))}
        </div>
      )}
      <Sheet open={all} onClose={() => setAll(false)} title={t('Our apps', 'আমাদের অ্যাপ')} icon="sparkles">
        <div className="oa2-list">
          {data.map((a, i) => (
            <button key={a.id} type="button" className="oa2-li" onClick={() => open(a)}>
              <Logo a={a} i={i} size={48} />
              <span className="grow"><b>{a.name}</b>{a.subtitle && <small>{a.subtitle}</small>}</span>
              <span className="oa2-btn">{cta(a)}</span>
            </button>
          ))}
        </div>
      </Sheet>
    </section>
  );
}
