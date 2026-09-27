import { useState } from 'react';
import { Tabs } from '../../components/ui';
import { PageHeader, Panel } from '../components/kit';
import { SettingsForm, useSettingsData } from '../components/SettingsForm';

const LABELS: Record<string, string> = { general: 'General', branding: 'Branding', contact: 'Contact', seo: 'SEO', delivery: 'Delivery', cod: 'COD', coupons: 'Coupons', flash_sale: 'Flash Sale', combo: 'Combo', products: 'Products', courier: 'Courier', fraud: 'Fraud', security: 'Security', meta: 'Meta Pixel & CAPI', google: 'Google', whatsapp: 'WhatsApp', pwa: 'PWA / App', notifications: 'Notifications', performance: 'Performance & Cache', backup: 'Backup', updates: 'Updates', maintenance: 'Maintenance' };
const HELP: Record<string, string> = {
  meta: 'Pixel runs in the browser; the Conversions API access token stays on the server and is sent server-to-server only (events are de-duplicated by event ID).',
  google: 'GA4 / Google Ads tags load only when an ID is set. The Measurement Protocol API secret is used server-side for reliable Purchase events.',
  pwa: 'Customers can install the store as an app. For a Play Store app, use the Trusted Web Activity config in android-twa/ and paste your signing fingerprint here.',
  updates: 'Updates are verified with an Ed25519 signature. Paste the vendor public key, or ship server/update-public-key.pem.',
};

export default function Settings() {
  const { data } = useSettingsData();
  const [group, setGroup] = useState('general');
  return (
    <div>
      <PageHeader title="Settings" subtitle="Everything is configurable here — no code editing required." />
      <Tabs value={group} onChange={setGroup} className="mb-4 -mx-1" tabs={(data?.groups ?? []).map((g) => ({ value: g, label: LABELS[g] ?? g }))} />
      <Panel title={LABELS[group] ?? group}>
        {HELP[group] && <p className="mb-4 rounded-2xl bg-soft p-3 text-[13px] text-ink-2">{HELP[group]}</p>}
        <SettingsForm key={group} groups={[group]} />
      </Panel>
    </div>
  );
}
