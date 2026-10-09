import type { ContactType } from '@quizwar/shared';
import { useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import { PageHeader } from '../components/AppShell';
import { Icon, IconTile, type IconName } from '../components/Icon';
import { BrandMark } from '../components/Splash';
import { useConfig } from '../hooks/queries';
import { useAuth } from '../lib/auth';
import { useT } from '../lib/i18n';
import { appVersionCode, haptic, isNative, platform, PUBLIC_WEB_URL, share } from '../lib/platform';
import { toast } from '../lib/toast';

const CONTACT_ICON: Record<ContactType, IconName> = {
  whatsapp: 'whatsapp',
  facebook: 'facebook',
  messenger: 'messenger',
  telegram: 'telegram',
  youtube: 'youtube',
  website: 'website',
  phone: 'phone',
  email: 'mail',
};

/** Normalise what admins type into a link the OS can open. */
export function contactHref(type: ContactType, url: string) {
  const v = url.trim();
  if (type === 'phone') return v.startsWith('tel:') ? v : `tel:${v.replace(/[^\d+]/g, '')}`;
  if (type === 'email') return v.startsWith('mailto:') ? v : `mailto:${v}`;
  if (type === 'whatsapp' && /^\+?\d[\d\s-]{6,}$/.test(v)) return `https://wa.me/${v.replace(/\D/g, '')}`;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

export function openExternal(href: string) {
  haptic('tap');
  // In the app the WebView hands external links/mailto/tel to the right Android app.
  if (isNative || href.startsWith('mailto:') || href.startsWith('tel:')) window.location.href = href;
  else window.open(href, '_blank', 'noopener');
}

export default function About() {
  const t = useT();
  const cfg = useConfig().data;
  const me = useAuth((s) => s.user);
  const loc = useLocation();
  const support = cfg?.supportEmail ?? 'support.quizwarbd@gmail.com';
  const version = import.meta.env.VITE_APP_VERSION ?? '1.0.0';

  useEffect(() => {
    if (loc.hash === '#support') document.getElementById('support')?.scrollIntoView({ block: 'start' });
  }, [loc.hash]);

  const mailSupport = () => {
    const subject = `QUIZ WAR ${t('support', 'সাপোর্ট')} — ${me?.uid ?? ''}`;
    const body = [
      t('Write your message here:', 'এখানে আপনার সমস্যা বা মতামত লিখুন:'),
      '',
      '',
      '———',
      `UID: ${me?.uid ?? '-'}`,
      `${t('Username', 'ইউজারনেম')}: ${me?.username ?? '-'}`,
      `App: ${version}${appVersionCode() ? ` (${appVersionCode()})` : ''} · ${platform}`,
      `Device: ${navigator.userAgent}`,
    ].join('\n');
    openExternal(`mailto:${support}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  };

  return (
    <div className="page stack about">
      <PageHeader title={t('About & support', 'সম্পর্কে ও সাপোর্ট')} back />

      <section className="about-hero">
        <BrandMark size={76} />
        <h2>QUIZ WAR: Bangladesh</h2>
        <p>{t('Real-time quiz battles that help you prepare for your exams.', 'রিয়েলটাইম কুইজ ব্যাটল — খেলতে খেলতে পরীক্ষার প্রস্তুতি।')}</p>
        <span className="chip">
          {t('Version', 'ভার্সন')} {version}
          {appVersionCode() ? ` · ${appVersionCode()}` : ''}
        </span>
      </section>

      <div className="section-label" id="support">{t('Help & support', 'সাহায্য ও সাপোর্ট')}</div>
      <section className="card support-card">
        <IconTile name="headset" tone="success" size={56} anim="float" />
        <h3>{t('Need help? We’re here.', 'কোনো সমস্যা? আমরা আছি।')}</h3>
        <p className="small muted">
          {t('Report a problem, a wrong answer, or send us an idea. We usually reply within a day.', 'সমস্যা, ভুল উত্তর বা নতুন আইডিয়া — যেকোনো কিছু জানান। সাধারণত এক দিনের মধ্যে উত্তর দিই।')}
        </p>
        <button className="btn primary block" onClick={mailSupport}>
          <Icon name="mail" /> {t('Email support', 'ইমেইলে যোগাযোগ করুন')}
        </button>
        <button
          className="link-btn"
          onClick={() => {
            void navigator.clipboard?.writeText(support).then(() => toast.success(t('Email copied', 'ইমেইল কপি হয়েছে'), support, 'copy'));
          }}
        >
          <Icon name="copy" size={15} /> {support}
        </button>
      </section>

      {!!cfg?.contacts?.length && (
        <>
          <div className="section-label">{t('Find us on', 'আমাদের পাবেন')}</div>
          <section className="contact-grid">
            {cfg.contacts.map((c, i) => (
              <button key={i} className={`contact-card c-${c.type}`} onClick={() => openExternal(contactHref(c.type, c.url))}>
                <Icon name={CONTACT_ICON[c.type] ?? 'link'} size={30} />
                <b>{c.label}</b>
                <Icon name="external" size={14} className="cc-ext" />
              </button>
            ))}
          </section>
        </>
      )}

      <div className="section-label">{t('More', 'আরও')}</div>
      <section className="menu">
        <button
          className="menu-row"
          onClick={async () => {
            const r = await share({
              title: 'QUIZ WAR: Bangladesh',
              text: t('Battle me in real-time quizzes on QUIZ WAR!', 'QUIZ WAR-এ আমার সাথে কুইজ ব্যাটল খেলো!'),
              url: cfg?.playStoreUrl || PUBLIC_WEB_URL,
            });
            if (r === 'copied') toast.success(t('Link copied', 'লিংক কপি হয়েছে'), undefined, 'copy');
          }}
        >
          <IconTile name="share" tone="primary" size={40} />
          <span className="m-text"><b>{t('Share the app', 'অ্যাপ শেয়ার করুন')}</b><small>{t('Invite friends to play', 'বন্ধুদের খেলতে আমন্ত্রণ জানান')}</small></span>
          <Icon name="chevron" size={20} />
        </button>
        {cfg?.playStoreUrl && (
          <button className="menu-row" onClick={() => openExternal(cfg.playStoreUrl)}>
            <IconTile name="star" tone="warning" size={40} />
            <span className="m-text"><b>{t('Rate us on Google Play', 'Google Play-তে রেটিং দিন')}</b><small>{t('It really helps us grow', 'এতে আমরা আরও ভালো করতে পারি')}</small></span>
            <Icon name="chevron" size={20} />
          </button>
        )}
        <Link to="/legal/privacy" className="menu-row">
          <IconTile name="shield-check" tone="accent" size={40} />
          <span className="m-text"><b>{t('Privacy policy', 'প্রাইভেসি পলিসি')}</b></span>
          <Icon name="chevron" size={20} />
        </Link>
        <Link to="/legal/terms" className="menu-row">
          <IconTile name="file" tone="neutral" size={40} />
          <span className="m-text"><b>{t('Terms of service', 'ব্যবহারের শর্তাবলি')}</b></span>
          <Icon name="chevron" size={20} />
        </Link>
        <Link to="/legal/guidelines" className="menu-row">
          <IconTile name="handshake" tone="success" size={40} />
          <span className="m-text"><b>{t('Community guidelines', 'কমিউনিটি নির্দেশিকা')}</b></span>
          <Icon name="chevron" size={20} />
        </Link>
      </section>
      <p className="center xs faint">
        {t('Made with care in Bangladesh', 'যত্ন নিয়ে বাংলাদেশে তৈরি')} · © {new Date().getFullYear()} QUIZ WAR
      </p>
    </div>
  );
}
