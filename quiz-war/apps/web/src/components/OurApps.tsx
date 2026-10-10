import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useT } from '../lib/i18n';
import { haptic } from '../lib/platform';
import { Icon } from './Icon';
import { openPromoLink } from './Promo';

type OurApp = { id: number; name: string; subtitle: string; logoUrl: string | null; linkUrl: string };

const isStore = (url: string) => /^market:|play\.google\.com\/store/i.test(url);

/** Home: the team's other apps (admin-managed; hidden when switched off or empty). */
export function HomeOurApps() {
  const t = useT();
  const { data } = useQuery({ queryKey: ['our-apps'], queryFn: async () => (await api<{ items: OurApp[] }>('/our-apps', { auth: false })).items, staleTime: 10 * 60_000 });
  if (!data?.length) return null;
  return (
    <section aria-labelledby="our-apps">
      <div className="section-head">
        <h3 id="our-apps"><Icon name="sparkles" size={18} /> {t('More apps from us', 'আমাদের আরও অ্যাপ')}</h3>
      </div>
      <div className="card list our-apps">
        {data.map((a) => {
          const store = isStore(a.linkUrl);
          return (
            <button
              key={a.id}
              type="button"
              className="list-row our-app"
              onClick={() => {
                haptic('tap');
                void api(`/our-apps/${a.id}/click`, { method: 'POST', auth: false }).catch(() => undefined);
                openPromoLink(a.linkUrl);
              }}
            >
              <span className="oa-logo">{a.logoUrl ? <img src={a.logoUrl} alt="" loading="lazy" /> : <Icon name="globe" size={26} />}</span>
              <span className="grow oa-text">
                <b>{a.name}</b>
                {a.subtitle && <small>{a.subtitle}</small>}
                <span className="oa-src">{store ? <><Icon name="download" size={12} /> Google Play</> : <><Icon name="external" size={12} /> {t('Website', 'ওয়েবসাইট')}</>}</span>
              </span>
              <span className="oa-cta">{store ? t('Install', 'ইনস্টল') : t('Open', 'ওপেন')}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
