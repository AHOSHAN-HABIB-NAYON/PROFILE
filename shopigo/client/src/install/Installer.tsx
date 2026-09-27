import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, CircleAlert, Database, Globe, KeyRound, LoaderCircle, PartyPopper, Rocket, ServerCog, ShieldCheck, Store, TriangleAlert, UserCog } from 'lucide-react';
import { cx } from '../lib/format';
import { Button, Field, Input, Select, Switch } from '../components/ui';

interface Check { key: string; label: string; status: 'pass' | 'warn' | 'fail'; detail: string }
const STEPS = [
  { title: 'Requirements', icon: ServerCog },
  { title: 'Database', icon: Database },
  { title: 'Website', icon: Globe },
  { title: 'Admin', icon: UserCog },
  { title: 'Install', icon: Rocket },
];

async function call<T>(url: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...(init.token ? { 'x-install-token': init.token } : {}) };
  if (init.body && typeof init.body === 'string') headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message ?? `HTTP ${res.status}`), { status: res.status, data });
  return data as T;
}

const TIMEZONES = ['Asia/Dhaka', 'Asia/Kolkata', 'Asia/Karachi', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'UTC'];

export default function Installer() {
  const status = useQuery({ queryKey: ['install-status'], queryFn: () => call<{ installed: boolean; version: string; tokenRequired: boolean }>('/api/install/status') });
  const [step, setStep] = useState(0);
  const [token, setToken] = useState('');
  const [db, setDb] = useState({ host: 'localhost', port: '3306', database: '', user: '', password: '' });
  const [dbState, setDbState] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [site, setSite] = useState({ name: 'ShopiGo', url: typeof location !== 'undefined' ? location.origin : '', currency: 'BDT', timezone: 'Asia/Dhaka', whatsapp: '', phone: '', email: '', createCategories: true });
  const [admin, setAdmin] = useState({ name: '', email: '', phone: '', password: '', confirmPassword: '' });
  const [logo, setLogo] = useState<File | null>(null);
  const [favicon, setFavicon] = useState<File | null>(null);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ steps: string[]; siteUrl: string } | null>(null);
  const req = useQuery({ queryKey: ['install-req', token], queryFn: () => call<{ checks: Check[]; ok: boolean }>('/api/install/requirements', { token }), enabled: Boolean(status.data && !status.data.installed && (!status.data.tokenRequired || token)) , retry: false });

  useEffect(() => { document.title = 'Install ShopiGo'; }, []);

  if (status.isLoading) return <Shell><div className="grid h-60 place-items-center"><LoaderCircle className="size-8 animate-spin text-brand-500" /></div></Shell>;
  if (status.data?.installed && !result) {
    return (
      <Shell>
        <div className="py-8 text-center">
          <div className="mx-auto mb-4 grid size-16 place-items-center rounded-3xl bg-green-50 text-green-600"><ShieldCheck className="size-8" /></div>
          <h1 className="text-[24px] font-extrabold">ShopiGo is already installed.</h1>
          <p className="mt-2 text-[14px] text-muted">The installer is permanently disabled. Maintenance tools are available to Super Admins inside the admin panel.</p>
          <div className="mt-6 flex justify-center gap-3"><a href="/"><Button variant="soft">Open Website</Button></a><a href="/admin"><Button>Open Admin</Button></a></div>
        </div>
      </Shell>
    );
  }

  const pwIssues = [admin.password.length >= 10 ? null : 'at least 10 characters', /[A-Z]/.test(admin.password) && /[a-z]/.test(admin.password) ? null : 'upper & lower case', /\d/.test(admin.password) ? null : 'a number'].filter(Boolean);
  const canNext = [
    Boolean(req.data?.ok),
    Boolean(dbState?.ok),
    site.name.trim().length >= 2 && /^https?:\/\//.test(site.url),
    admin.name.trim().length >= 2 && /\S+@\S+\.\S+/.test(admin.email) && pwIssues.length === 0 && admin.password === admin.confirmPassword,
    true,
  ][step];

  const testDb = async () => {
    setTesting(true);
    setDbState(null);
    try {
      const r = await call<{ ok: boolean; message: string }>('/api/install/test-db', { method: 'POST', body: JSON.stringify({ ...db, port: Number(db.port) }), token });
      setDbState(r);
    } catch (e) {
      setDbState({ ok: false, message: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const install = async () => {
    setInstalling(true);
    setError(null);
    const fd = new FormData();
    fd.set('payload', JSON.stringify({ db: { ...db, port: Number(db.port) }, site: { ...site, email: site.email || admin.email }, admin }));
    if (logo) fd.set('logo', logo);
    if (favicon) fd.set('favicon', favicon);
    try {
      const res = await fetch('/api/install/run', { method: 'POST', body: fd, headers: token ? { 'x-install-token': token } : {} });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Installation failed');
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setInstalling(false);
    }
  };

  if (result) {
    return (
      <Shell>
        <div className="py-6 text-center">
          <div className="mx-auto mb-4 grid size-16 animate-[var(--animate-pop)] place-items-center rounded-3xl bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-[var(--shadow-float)]"><PartyPopper className="size-8" /></div>
          <h1 className="text-[24px] font-extrabold">Installation Completed Successfully</h1>
          <ul className="mx-auto mt-5 max-w-md space-y-2 text-left text-[14px]">
            {result.steps.map((s) => <li key={s} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-green-600" />{s}</li>)}
          </ul>
          <div className="mt-7 flex justify-center gap-3"><a href="/"><Button variant="soft" size="lg">Open Website</Button></a><a href="/admin/login"><Button size="lg">Open Admin</Button></a></div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-6 text-center">
        <p className="text-[13px] font-bold tracking-wide text-brand-600 uppercase">Version {status.data?.version}</p>
        <h1 className="mt-1 text-[26px] font-extrabold tracking-tight">Welcome to ShopiGo</h1>
        <p className="text-[14px] text-muted">Let's set up your store. This only happens once.</p>
      </div>
      <ol className="mb-6 grid grid-cols-5 gap-1">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex flex-col items-center gap-1.5 text-center">
            <span className={cx('grid size-10 place-items-center rounded-2xl transition', i < step ? 'bg-green-500 text-white' : i === step ? 'bg-brand-500 text-white shadow-[var(--shadow-float)]' : 'bg-soft text-muted')}>{i < step ? <Check className="size-5" /> : <s.icon className="size-5" />}</span>
            <span className={cx('text-[11px] font-semibold', i === step ? 'text-ink' : 'text-muted')}>{s.title}</span>
          </li>
        ))}
      </ol>

      {status.data?.tokenRequired && (
        <Field label="Installation token" hint="Set via the INSTALL_TOKEN environment variable" className="mb-4"><Input value={token} onChange={(e) => setToken(e.target.value)} type="password" /></Field>
      )}

      {step === 0 && (
        <div>
          <h2 className="mb-3 text-[16px] font-bold">Step 1 · System requirements</h2>
          {req.isLoading && <LoaderCircle className="mx-auto size-6 animate-spin text-brand-500" />}
          {req.error && <p className="rounded-2xl bg-red-50 p-3 text-[13px] text-danger">{(req.error as Error).message}</p>}
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {req.data?.checks.map((c) => (
              <li key={c.key} className="flex items-center gap-3 px-4 py-2.5 text-[13.5px]">
                {c.status === 'pass' ? <Check className="size-4 shrink-0 text-green-600" /> : c.status === 'warn' ? <TriangleAlert className="size-4 shrink-0 text-amber-500" /> : <CircleAlert className="size-4 shrink-0 text-danger" />}
                <span className="flex-1 font-semibold">{c.label}</span>
                <span className="text-right text-[12px] text-muted">{c.detail}</span>
              </li>
            ))}
          </ul>
          {req.data && !req.data.ok && <p className="mt-3 text-[13px] text-danger">Fix the failed checks above, then reload this page.</p>}
          {req.data && <Button variant="ghost" size="sm" className="mt-2" onClick={() => void req.refetch()}>Re-check</Button>}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-[16px] font-bold">Step 2 · Database setup</h2>
          <p className="text-[13px] text-muted">Create an empty MySQL/MariaDB database and user in your hosting panel, then enter the details here.</p>
          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <Field label="Database Host" required><Input value={db.host} onChange={(e) => { setDb({ ...db, host: e.target.value }); setDbState(null); }} /></Field>
            <Field label="Port" required><Input value={db.port} inputMode="numeric" onChange={(e) => { setDb({ ...db, port: e.target.value }); setDbState(null); }} /></Field>
          </div>
          <Field label="Database Name" required><Input value={db.database} onChange={(e) => { setDb({ ...db, database: e.target.value }); setDbState(null); }} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Database Username" required><Input value={db.user} autoComplete="off" onChange={(e) => { setDb({ ...db, user: e.target.value }); setDbState(null); }} /></Field>
            <Field label="Database Password"><Input type="password" value={db.password} autoComplete="new-password" onChange={(e) => { setDb({ ...db, password: e.target.value }); setDbState(null); }} /></Field>
          </div>
          <Button variant="dark" loading={testing} onClick={() => void testDb()} disabled={!db.host || !db.database || !db.user}>Test Database Connection</Button>
          {dbState && <p className={cx('rounded-2xl p-3 text-[13px] font-semibold', dbState.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-danger')}>{dbState.ok ? '✓ ' : '✕ '}{dbState.message}</p>}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-[16px] font-bold">Step 3 · Website setup</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Website Name" required><Input value={site.name} onChange={(e) => setSite({ ...site, name: e.target.value })} /></Field>
            <Field label="Website URL" required><Input value={site.url} onChange={(e) => setSite({ ...site, url: e.target.value })} /></Field>
            <Field label="Logo" hint="PNG/WebP/JPG — optimised automatically"><Input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} /></Field>
            <Field label="Favicon / App icon" hint="Square image, 512×512 recommended"><Input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFavicon(e.target.files?.[0] ?? null)} /></Field>
            <Field label="Phone"><Input value={site.phone} onChange={(e) => setSite({ ...site, phone: e.target.value })} placeholder="01XXXXXXXXX" /></Field>
            <Field label="WhatsApp Number" hint="With country code, e.g. 8801XXXXXXXXX"><Input value={site.whatsapp} onChange={(e) => setSite({ ...site, whatsapp: e.target.value.replace(/[^\d+]/g, '') })} placeholder="8801XXXXXXXXX" /></Field>
            <Field label="Currency"><Select value={site.currency} onChange={(e) => setSite({ ...site, currency: e.target.value })}><option>BDT</option><option>USD</option><option>INR</option></Select></Field>
            <Field label="Timezone"><Select value={site.timezone} onChange={(e) => setSite({ ...site, timezone: e.target.value })}>{TIMEZONES.map((z) => <option key={z}>{z}</option>)}</Select></Field>
          </div>
          <Switch checked={site.createCategories} onChange={(v) => setSite({ ...site, createCategories: v })} label="Create starter categories" description="Electronics, Fashion, Home & Living, Beauty… (you can edit or delete them later)" />
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h2 className="text-[16px] font-bold">Step 4 · Super administrator</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required><Input value={admin.name} onChange={(e) => setAdmin({ ...admin, name: e.target.value })} autoComplete="name" /></Field>
            <Field label="Email" required><Input type="email" value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} autoComplete="email" /></Field>
            <Field label="Admin Phone"><Input value={admin.phone} onChange={(e) => setAdmin({ ...admin, phone: e.target.value })} placeholder="01XXXXXXXXX" /></Field>
            <div />
            <Field label="Password" required error={admin.password && pwIssues.length ? `Needs ${pwIssues.join(', ')}` : null}><Input type="password" value={admin.password} onChange={(e) => setAdmin({ ...admin, password: e.target.value })} autoComplete="new-password" /></Field>
            <Field label="Confirm Password" required error={admin.confirmPassword && admin.confirmPassword !== admin.password ? 'Passwords do not match' : null}><Input type="password" value={admin.confirmPassword} onChange={(e) => setAdmin({ ...admin, confirmPassword: e.target.value })} autoComplete="new-password" /></Field>
          </div>
          <p className="flex items-center gap-2 rounded-2xl bg-soft p-3 text-[12.5px] text-muted"><KeyRound className="size-4 shrink-0" /> Passwords are hashed with Argon2id. After installing you can add a passkey (Face ID / fingerprint) and 2FA from Admin → Security.</p>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3 text-[14px]">
          <h2 className="text-[16px] font-bold">Step 5 · Ready to install</h2>
          <Summary icon={<Database className="size-4" />} label="Database" value={`${db.user}@${db.host}:${db.port}/${db.database}`} />
          <Summary icon={<Store className="size-4" />} label="Store" value={`${site.name} · ${site.url}`} />
          <Summary icon={<Globe className="size-4" />} label="Locale" value={`${site.currency} · ${site.timezone}`} />
          <Summary icon={<UserCog className="size-4" />} label="Super admin" value={`${admin.name} <${admin.email}>`} />
          <p className="rounded-2xl bg-brand-50 p-3 text-[12.5px] text-brand-800">The installer will create tables & indexes, default roles, order statuses, delivery & security settings and pages, generate secret keys, and then lock itself permanently.</p>
          {error && <p className="rounded-2xl bg-red-50 p-3 text-[13px] font-semibold text-danger">{error}</p>}
        </div>
      )}

      <div className="mt-7 flex items-center justify-between gap-3">
        <Button variant="ghost" disabled={step === 0 || installing} onClick={() => setStep(step - 1)}>Back</Button>
        {step < 4 ? (
          <Button onClick={() => setStep(step + 1)} disabled={!canNext}>Continue</Button>
        ) : (
          <Button size="lg" className="cta-glow" loading={installing} onClick={() => void install()} icon={<Rocket className="size-5" />}>Install ShopiGo</Button>
        )}
      </div>
    </Shell>
  );
}

function Summary({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3"><span className="text-brand-500">{icon}</span><span className="w-28 shrink-0 font-semibold">{label}</span><span className="min-w-0 truncate text-muted">{value}</span></div>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,#ffe6d6,transparent_60%)] px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <img src="/icons/icon-192.png" alt="" className="size-10 rounded-2xl" />
          <span className="text-[22px] font-extrabold tracking-tight">ShopiGo</span>
        </div>
        <div className="card p-6 sm:p-8">{children}</div>
      </div>
    </div>
  );
}
