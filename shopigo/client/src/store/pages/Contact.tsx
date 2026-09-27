import { Clock, Mail, MapPin, Phone } from 'lucide-react';
import { useT } from '../../lib/i18n';
import { useSettings } from '../../lib/settings';
import { FaIcon } from '../../components/CategoryIcon';
import { TopBar, whatsappLink } from '../components/chrome';

export default function Contact() {
  const t = useT();
  const s = useSettings();
  const cards = [
    s.whatsapp_number && { href: whatsappLink(s.whatsapp_number, s.whatsapp_default_message), icon: <FaIcon name="fa-brands fa-whatsapp" className="text-[22px]" />, title: 'WhatsApp', text: `+${s.whatsapp_number.replace(/^\+/, '')}`, tone: 'bg-[#25D366] text-white' },
    s.contact_phone && { href: `tel:${s.contact_phone}`, icon: <Phone className="size-5" />, title: t('callUs'), text: s.contact_phone, tone: 'bg-brand-500 text-white' },
    s.facebook_url && { href: s.facebook_url, icon: <FaIcon name="fa-brands fa-facebook-f" className="text-[20px]" />, title: 'Facebook', text: s.facebook_url.replace(/^https?:\/\/(www\.)?/, ''), tone: 'bg-[#1877F2] text-white' },
    s.contact_email && { href: `mailto:${s.contact_email}`, icon: <Mail className="size-5" />, title: t('emailUs'), text: s.contact_email, tone: 'bg-ink text-white' },
  ].filter(Boolean) as Array<{ href: string; icon: React.ReactNode; title: string; text: string; tone: string }>;
  const mapOk = /^https:\/\/(www\.)?google\.com\/maps\/embed\?/.test(s.map_embed_url);
  return (
    <div>
      <TopBar title={t('contact')} />
      <div className="px-4 md:px-0 md:pt-6">
        <h1 className="mb-1 hidden text-[26px] font-extrabold md:block">{t('contact')}</h1>
        <p className="mb-5 text-[14px] text-muted">{s.site_tagline}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {cards.map((c) => (
            <a key={c.title} href={c.href} target={c.href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className="card press flex items-center gap-4 p-4">
              <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${c.tone}`}>{c.icon}</span>
              <span className="min-w-0"><span className="block font-bold">{c.title}</span><span className="block truncate text-[13px] text-muted">{c.text}</span></span>
            </a>
          ))}
        </div>
        {(s.contact_address || s.business_hours) && (
          <div className="card mt-3 space-y-3 p-5 text-[14px]">
            {s.contact_address && <p className="flex gap-3"><MapPin className="size-5 shrink-0 text-brand-500" />{s.contact_address}</p>}
            {s.business_hours && <p className="flex gap-3"><Clock className="size-5 shrink-0 text-brand-500" />{s.business_hours}</p>}
          </div>
        )}
        {mapOk && <iframe title="Map" src={s.map_embed_url} className="card mt-3 h-72 w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />}
      </div>
    </div>
  );
}
