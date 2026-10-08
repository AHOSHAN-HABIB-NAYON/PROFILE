import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Loading } from '../components/ui';
import { api, errMsg } from '../lib/api';

const BOOLS: [string, string][] = [
  ['maintenanceMode', 'Maintenance mode (players see the maintenance message)'],
  ['registrationEnabled', 'Allow new registrations'],
  ['googleLoginEnabled', 'Google login'],
  ['passkeyEnabled', 'Passkey login'],
  ['notificationsEnabled', 'Notifications'],
  ['forceUpdate', 'Force Android update below the minimum version'],
];
const TEXTS: [string, string, string?][] = [
  ['appName', 'App name'],
  ['logoUrl', 'Logo URL'],
  ['faviconUrl', 'Favicon URL'],
  ['primaryColor', 'Primary color', 'color'],
  ['accentColor', 'Accent color', 'color'],
  ['maintenanceMessage', 'Maintenance message'],
  ['minAppVersionCode', 'Minimum Android versionCode', 'number'],
  ['latestAppVersionCode', 'Latest Android versionCode', 'number'],
  ['playStoreUrl', 'Play Store URL'],
  ['privacyUrl', 'Privacy Policy URL'],
  ['termsUrl', 'Terms URL'],
];

export default function AppSettings() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['settings'], queryFn: () => api('/settings') });
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  if (isLoading) return <Loading rows={10} />;
  const a = data.app;
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body: any = {};
    for (const [k] of BOOLS) body[k] = f.get(k) === 'on';
    for (const [k, , t] of TEXTS) {
      const v = String(f.get(k) ?? '');
      body[k] = t === 'number' ? Number(v) : (k === 'logoUrl' || k === 'faviconUrl') && !v ? null : v;
    }
    try {
      await api('/settings/app', { method: 'PUT', body });
      setMsg({ ok: 'App settings saved.' });
      void qc.invalidateQueries({ queryKey: ['settings'] });
    } catch (e2) {
      setMsg({ err: errMsg(e2) });
    }
  };
  return (
    <>
      <div className="head"><h1>App settings</h1></div>
      <form className="card form" onSubmit={submit}>
        {msg.ok && <p className="ok">{msg.ok}</p>}
        {msg.err && <p className="err">{msg.err}</p>}
        {BOOLS.map(([k, l]) => <label key={k} className="row"><input type="checkbox" name={k} defaultChecked={a[k]} /> {l}</label>)}
        <div className="cols">
          {TEXTS.map(([k, l, t]) => <div key={k} className="field"><label htmlFor={k}>{l}</label><input id={k} name={k} type={t ?? 'text'} className="input" defaultValue={a[k] ?? ''} /></div>)}
        </div>
        <button className="btn primary">Save app settings</button>
      </form>
    </>
  );
}
