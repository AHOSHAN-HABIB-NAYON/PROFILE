'use client';
import { useEffect, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { post, get, errorMessage } from '@/lib/api';
import { Logo } from '@/components/layout/brand';
import { ThemeToggle } from '@/components/layout/app-shell';
import { Button, Card, ErrorBox, InfoBox, Input, Select, Toggle, cx } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icons';

interface Req {
  checks: { key: string; label: string; ok: boolean; required: boolean }[];
  ok: boolean;
}
interface Step {
  step: string;
  ok: boolean;
  detail?: string;
}

const STEPS = ['Requirements', 'Database', 'Administrator', 'Application', 'Services', 'Install', 'Done'];
const TIMEZONES = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['UTC'];

function Check({ ok, children }: { ok: boolean | null; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span
        className={cx(
          'w-6 h-6 rounded-full flex items-center justify-center shrink-0',
          ok === null ? 'bg-card-2 text-muted' : ok ? 'bg-up-soft text-up' : 'bg-down-soft text-down',
        )}
      >
        <Icon name={ok === false ? 'close' : 'check'} size={14} />
      </span>
      <span className="text-sm">{children}</span>
    </div>
  );
}

/**
 * First-run installation wizard. Only reachable until storage/install.lock exists — afterwards
 * the server redirects /install to /login and the API returns 404 for every installer route.
 */
export default function Installer() {
  const [step, setStep] = useState(0);
  const [req, setReq] = useState<Req | null>(null);
  const [token, setToken] = useState('');
  const [tokenOk, setTokenOk] = useState(false);
  const [db, setDb] = useState({
    host: '127.0.0.1',
    port: 3306,
    database: 'tradeteam',
    user: '',
    password: '',
  });
  const [dbCheck, setDbCheck] = useState<{
    ok: boolean;
    version?: string;
    existingInstall?: boolean;
    databaseExists?: boolean;
    error?: string;
  } | null>(null);
  const [redisUrl, setRedisUrl] = useState('');
  const [redisCheck, setRedisCheck] = useState<{ ok: boolean; version?: string; error?: string } | null>(
    null,
  );
  const [admin, setAdmin] = useState({ name: '', email: '', password: '', password2: '', totpCode: '' });
  const [totp, setTotp] = useState<{ secret: string; qr: string } | null>(null);
  const [app, setApp] = useState({
    siteName: 'TradeTeam',
    logoUrl: '',
    currency: 'USDT',
    timezone: 'UTC',
    appUrl: '',
  });
  const [smtpOn, setSmtpOn] = useState(false);
  const [smtp, setSmtp] = useState({ host: '', port: 587, secure: false, user: '', password: '', from: '' });
  const [smtpCheck, setSmtpCheck] = useState<{ ok: boolean; error?: string } | null>(null);
  const [googleOn, setGoogleOn] = useState(false);
  const [google, setGoogle] = useState({ clientId: '', clientSecret: '' });
  const [market, setMarket] = useState({
    provider: 'binance' as 'binance' | 'internal',
    restUrl: 'https://api.binance.com',
    wsUrl: 'wss://stream.binance.com:9443',
    defaultEngine: 'external' as 'external' | 'internal',
  });
  const [exchange, setExchange] = useState({ apiKey: '', apiSecret: '' });
  const [ws, setWs] = useState({ maxChannelsPerSocket: 200, compressionThreshold: 1024 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [log, setLog] = useState<Step[]>([]);

  useEffect(() => {
    get<{ requirements: Req }>('/install/status')
      .then((r) => setReq(r.requirements))
      .catch((e) => setErr(errorMessage(e)));
    setApp((a) => ({ ...a, appUrl: window.location.origin }));
  }, []);

  const wrap = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const pwOk =
    admin.password.length >= 10 &&
    /[a-z]/.test(admin.password) &&
    /[A-Z]/.test(admin.password) &&
    /\d/.test(admin.password) &&
    admin.password === admin.password2;
  const canNext = [
    Boolean(req?.ok && tokenOk),
    Boolean(dbCheck?.ok && (!redisUrl.trim() || redisCheck?.ok)),
    Boolean(admin.name && /\S+@\S+\.\S+/.test(admin.email) && pwOk && (!totp || admin.totpCode.length === 6)),
    Boolean(app.siteName && app.appUrl),
    true,
  ][step];

  const run = () =>
    wrap(async () => {
      setLog([]);
      const body = {
        token,
        appUrl: app.appUrl,
        db,
        redisUrl: redisUrl.trim(),
        admin: {
          name: admin.name,
          email: admin.email,
          password: admin.password,
          totpCode: totp && admin.totpCode ? admin.totpCode : undefined,
        },
        app: { siteName: app.siteName, logoUrl: app.logoUrl, currency: app.currency, timezone: app.timezone },
        services: {
          smtp: smtpOn ? smtp : undefined,
          google: googleOn ? google : undefined,
          market: {
            provider: market.provider,
            restUrl: market.restUrl,
            wsUrl: market.wsUrl,
            defaultEngine: market.defaultEngine,
          },
          ws,
          exchange: exchange.apiKey ? exchange : undefined,
        },
      };
      const res = await fetch('/api/install/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { ok: boolean; log: Step[]; error?: string };
      setLog(j.log ?? []);
      if (!j.ok) throw new Error(j.error ?? 'Installation failed');
      setStep(6);
    });

  return (
    <div className="min-h-dvh pt-safe">
      <header className="max-w-3xl mx-auto px-5 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5 font-bold text-lg">
          <Logo /> Installation
        </div>
        <ThemeToggle />
      </header>
      <main className="max-w-3xl mx-auto px-4 pb-16">
        <ol className="flex gap-1 overflow-x-auto no-scrollbar mb-5">
          {STEPS.map((s, i) => (
            <li
              key={s}
              className={cx(
                'shrink-0 h-8 px-3 rounded-full text-[12px] font-semibold flex items-center gap-1.5',
                i === step
                  ? 'bg-accent text-accent-fg'
                  : i < step
                    ? 'bg-up-soft text-up'
                    : 'bg-card-2 text-muted',
              )}
            >
              {i < step && <Icon name="check" size={13} />} {i + 1}. {s}
            </li>
          ))}
        </ol>
        <Card className="space-y-4 page-enter" key={step}>
          {step === 0 && (
            <>
              <h1 className="text-xl font-bold">System requirements</h1>
              {!req ? (
                <p className="text-sm text-muted">Checking…</p>
              ) : (
                req.checks.map((c) => (
                  <Check key={c.key} ok={c.ok}>
                    {c.label}
                    {!c.required && <span className="text-muted"> (recommended)</span>}
                  </Check>
                ))
              )}
              <InfoBox>
                For security, enter the one-time setup token printed in the server log (also saved to{' '}
                <code>storage/install-token.txt</code>).
              </InfoBox>
              <div className="flex gap-2 items-end">
                <Input
                  className="flex-1"
                  label="Setup token"
                  value={token}
                  onChange={(e) => (setToken(e.target.value.trim()), setTokenOk(false))}
                  autoComplete="off"
                />
                <Button
                  variant="secondary"
                  loading={busy}
                  disabled={!token}
                  onClick={() =>
                    wrap(async () => (await post('/install/verify-token', { token }), setTokenOk(true)))
                  }
                >
                  {tokenOk ? 'Verified' : 'Verify'}
                </Button>
              </div>
            </>
          )}
          {step === 1 && (
            <>
              <h1 className="text-xl font-bold">Database & cache</h1>
              <div className="grid sm:grid-cols-3 gap-3">
                <Input
                  className="sm:col-span-2"
                  label="MySQL host"
                  value={db.host}
                  onChange={(e) => (setDb({ ...db, host: e.target.value }), setDbCheck(null))}
                />
                <Input
                  label="Port"
                  inputMode="numeric"
                  value={String(db.port)}
                  onChange={(e) => (setDb({ ...db, port: Number(e.target.value) || 3306 }), setDbCheck(null))}
                />
                <Input
                  label="Database name"
                  value={db.database}
                  onChange={(e) => (setDb({ ...db, database: e.target.value }), setDbCheck(null))}
                  hint="Created if it does not exist"
                />
                <Input
                  label="Username"
                  value={db.user}
                  onChange={(e) => (setDb({ ...db, user: e.target.value }), setDbCheck(null))}
                  autoComplete="off"
                />
                <Input
                  label="Password"
                  type="password"
                  value={db.password}
                  onChange={(e) => (setDb({ ...db, password: e.target.value }), setDbCheck(null))}
                  autoComplete="new-password"
                />
              </div>
              <Button
                variant="secondary"
                loading={busy}
                onClick={() => wrap(async () => setDbCheck(await post('/install/check-db', { token, db })))}
              >
                Test database connection
              </Button>
              {dbCheck &&
                (dbCheck.error ? (
                  <ErrorBox message={dbCheck.error} />
                ) : (
                  <Check ok={dbCheck.ok}>
                    {dbCheck.existingInstall
                      ? 'An existing installation was found in this database — it will not be touched. Choose an empty database.'
                      : `Connected to MySQL ${dbCheck.version}${dbCheck.databaseExists ? '' : ' · database will be created'}`}
                  </Check>
                ))}
              <div className="flex gap-2 items-end pt-2 border-t border-line">
                <Input
                  className="flex-1"
                  label="Redis URL"
                  value={redisUrl}
                  onChange={(e) => (setRedisUrl(e.target.value), setRedisCheck(null))}
                  hint="Optional. Leave empty on single-server hosting (e.g. Hostinger) to use the built-in memory mode. Use redis:// or rediss:// for multi-server scaling."
                />
                <Button
                  variant="secondary"
                  loading={busy}
                  disabled={!redisUrl.trim()}
                  onClick={() =>
                    wrap(async () =>
                      setRedisCheck(await post('/install/check-redis', { token, url: redisUrl })),
                    )
                  }
                >
                  Test
                </Button>
              </div>
              {redisCheck &&
                (redisCheck.error ? (
                  <ErrorBox message={redisCheck.error} />
                ) : (
                  <Check ok={redisCheck.ok}>Connected to Redis {redisCheck.version}</Check>
                ))}
            </>
          )}
          {step === 2 && (
            <>
              <h1 className="text-xl font-bold">Super administrator</h1>
              <Input
                label="Name"
                value={admin.name}
                onChange={(e) => setAdmin({ ...admin, name: e.target.value })}
              />
              <Input
                label="Email"
                type="email"
                value={admin.email}
                onChange={(e) => setAdmin({ ...admin, email: e.target.value })}
              />
              <div className="grid sm:grid-cols-2 gap-3">
                <Input
                  label="Password"
                  type="password"
                  autoComplete="new-password"
                  value={admin.password}
                  onChange={(e) => setAdmin({ ...admin, password: e.target.value })}
                  hint="10+ chars, upper & lower case, number"
                />
                <Input
                  label="Confirm password"
                  type="password"
                  autoComplete="new-password"
                  value={admin.password2}
                  onChange={(e) => setAdmin({ ...admin, password2: e.target.value })}
                  error={
                    admin.password2 && admin.password !== admin.password2 ? 'Passwords do not match' : null
                  }
                />
              </div>
              <div className="rounded-2xl bg-card-2 p-4 space-y-3">
                <p className="font-semibold text-sm">Two-factor authentication</p>
                {!totp ? (
                  <>
                    <p className="text-[13px] text-muted">
                      Set up an authenticator now, or add a passkey/2FA at your first admin sign-in (a second
                      factor is mandatory for admins either way).
                    </p>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!admin.email}
                      loading={busy}
                      onClick={() =>
                        wrap(async () => {
                          const r = await post<{ secret: string; otpauthUrl: string }>(
                            '/install/admin-totp',
                            { token, email: admin.email },
                          );
                          setTotp({
                            secret: r.secret,
                            qr: await QRCode.toDataURL(r.otpauthUrl, { margin: 1, width: 180 }),
                          });
                        })
                      }
                    >
                      Set up authenticator
                    </Button>
                  </>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-4 items-center">
                    <div className="bg-white p-2 rounded-xl">
                      <img src={totp.qr} alt="Admin 2FA QR" width={160} height={160} />
                    </div>
                    <div className="flex-1 w-full space-y-2">
                      <p className="font-mono text-[13px] break-all">{totp.secret}</p>
                      <Input
                        label="Code from your app"
                        inputMode="numeric"
                        maxLength={6}
                        value={admin.totpCode}
                        onChange={(e) => setAdmin({ ...admin, totpCode: e.target.value.replace(/\D/g, '') })}
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <h1 className="text-xl font-bold">Application</h1>
              <Input
                label="Site name"
                value={app.siteName}
                onChange={(e) => setApp({ ...app, siteName: e.target.value })}
              />
              <Input
                label="Public URL"
                value={app.appUrl}
                onChange={(e) => setApp({ ...app, appUrl: e.target.value })}
                hint="Must be the exact https:// origin users open. Used for cookies, passkeys, OAuth and emails."
              />
              <Input
                label="Logo URL (optional)"
                value={app.logoUrl}
                onChange={(e) => setApp({ ...app, logoUrl: e.target.value })}
              />
              <div className="grid sm:grid-cols-2 gap-3">
                <Select
                  label="Reference currency"
                  value={app.currency}
                  onChange={(e) => setApp({ ...app, currency: e.target.value })}
                >
                  {['USDT', 'USD', 'USDC', 'EUR'].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
                <Select
                  label="Timezone"
                  value={app.timezone}
                  onChange={(e) => setApp({ ...app, timezone: e.target.value })}
                >
                  {['UTC', ...TIMEZONES.filter((t) => t !== 'UTC')].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Select>
              </div>
              {app.appUrl.startsWith('http://') && !/localhost|127\.0\.0\.1/.test(app.appUrl) && (
                <InfoBox tone="warn">
                  Production deployments must use HTTPS. Passkeys, secure cookies and Google sign-in require
                  it.
                </InfoBox>
              )}
            </>
          )}
          {step === 4 && (
            <>
              <h1 className="text-xl font-bold">Services</h1>
              <div className="space-y-3">
                <p className="font-semibold text-sm">Market data provider</p>
                <Select
                  label="Provider"
                  value={market.provider}
                  onChange={(e) =>
                    setMarket({
                      ...market,
                      provider: e.target.value as 'binance' | 'internal',
                      defaultEngine: e.target.value === 'internal' ? 'internal' : market.defaultEngine,
                    })
                  }
                >
                  <option value="binance">Binance (all spot pairs, live WebSocket feed)</option>
                  <option value="internal">
                    Internal only (markets you create; data from the matching engine)
                  </option>
                </Select>
                {market.provider === 'binance' && (
                  <>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <Input
                        label="REST base URL"
                        value={market.restUrl}
                        onChange={(e) => setMarket({ ...market, restUrl: e.target.value })}
                      />
                      <Input
                        label="WebSocket base URL"
                        value={market.wsUrl}
                        onChange={(e) => setMarket({ ...market, wsUrl: e.target.value })}
                      />
                    </div>
                    <Select
                      label="Order execution for synced markets"
                      value={market.defaultEngine}
                      onChange={(e) =>
                        setMarket({ ...market, defaultEngine: e.target.value as 'external' | 'internal' })
                      }
                    >
                      <option value="external">Route orders to the exchange (requires API keys)</option>
                    </Select>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <Input
                        label="Exchange API key (optional)"
                        value={exchange.apiKey}
                        onChange={(e) => setExchange({ ...exchange, apiKey: e.target.value })}
                        autoComplete="off"
                      />
                      <Input
                        label="Exchange API secret"
                        type="password"
                        value={exchange.apiSecret}
                        onChange={(e) => setExchange({ ...exchange, apiSecret: e.target.value })}
                        autoComplete="new-password"
                      />
                    </div>
                    <p className="text-[12px] text-muted">
                      Without exchange keys, provider markets are view-only (live data) and orders are
                      politely rejected. Internal markets always trade.
                    </p>
                  </>
                )}
              </div>
              <div className="pt-3 border-t border-line space-y-3">
                <Toggle
                  checked={smtpOn}
                  onChange={setSmtpOn}
                  label="Email (SMTP)"
                  description="Required for email verification, password resets and alerts. Email verification is disabled if skipped."
                />
                {smtpOn && (
                  <>
                    <div className="grid sm:grid-cols-3 gap-3">
                      <Input
                        className="sm:col-span-2"
                        label="Host"
                        value={smtp.host}
                        onChange={(e) => setSmtp({ ...smtp, host: e.target.value })}
                      />
                      <Input
                        label="Port"
                        inputMode="numeric"
                        value={String(smtp.port)}
                        onChange={(e) => setSmtp({ ...smtp, port: Number(e.target.value) || 587 })}
                      />
                      <Input
                        label="Username"
                        value={smtp.user}
                        onChange={(e) => setSmtp({ ...smtp, user: e.target.value })}
                      />
                      <Input
                        label="Password"
                        type="password"
                        value={smtp.password}
                        onChange={(e) => setSmtp({ ...smtp, password: e.target.value })}
                      />
                      <Input
                        label="From"
                        value={smtp.from}
                        onChange={(e) => setSmtp({ ...smtp, from: e.target.value })}
                        placeholder="TradeTeam <no-reply@example.com>"
                      />
                    </div>
                    <Toggle
                      checked={smtp.secure}
                      onChange={(v) => setSmtp({ ...smtp, secure: v })}
                      label="Use TLS (port 465)"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy}
                      onClick={() =>
                        wrap(async () => setSmtpCheck(await post('/install/check-smtp', { token, smtp })))
                      }
                    >
                      Test SMTP
                    </Button>
                    {smtpCheck &&
                      (smtpCheck.error ? (
                        <ErrorBox message={smtpCheck.error} />
                      ) : (
                        <Check ok>SMTP connection verified</Check>
                      ))}
                  </>
                )}
              </div>
              <div className="pt-3 border-t border-line space-y-3">
                <Toggle
                  checked={googleOn}
                  onChange={setGoogleOn}
                  label="Google sign-in"
                  description={`Authorized redirect URI: ${app.appUrl}/api/auth/google/callback`}
                />
                {googleOn && (
                  <div className="grid sm:grid-cols-2 gap-3">
                    <Input
                      label="OAuth client ID"
                      value={google.clientId}
                      onChange={(e) => setGoogle({ ...google, clientId: e.target.value })}
                    />
                    <Input
                      label="OAuth client secret"
                      type="password"
                      value={google.clientSecret}
                      onChange={(e) => setGoogle({ ...google, clientSecret: e.target.value })}
                    />
                  </div>
                )}
              </div>
              <div className="pt-3 border-t border-line grid sm:grid-cols-2 gap-3">
                <Input
                  label="Max channels per WebSocket"
                  inputMode="numeric"
                  value={String(ws.maxChannelsPerSocket)}
                  onChange={(e) => setWs({ ...ws, maxChannelsPerSocket: Number(e.target.value) || 200 })}
                />
                <Input
                  label="Compress messages above (bytes)"
                  inputMode="numeric"
                  value={String(ws.compressionThreshold)}
                  onChange={(e) => setWs({ ...ws, compressionThreshold: Number(e.target.value) || 0 })}
                />
              </div>
            </>
          )}
          {step === 5 && (
            <>
              <h1 className="text-xl font-bold">Install</h1>
              <p className="text-sm text-muted">
                The installer will create the database, run migrations, create the administrator and settings,
                generate secure secrets, verify services and lock itself permanently.
              </p>
              {log.map((l) => (
                <Check key={l.step} ok={l.ok}>
                  {l.step}
                  {l.detail && <span className="text-muted"> — {l.detail}</span>}
                </Check>
              ))}
              {!log.length && !busy && (
                <Button size="lg" onClick={run}>
                  Install now
                </Button>
              )}
              {busy && <p className="text-sm text-muted">Installing… this can take a few seconds.</p>}
            </>
          )}
          {step === 6 && (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 mx-auto rounded-3xl bg-up-soft text-up flex items-center justify-center">
                <Icon name="check" size={32} />
              </div>
              <h1 className="text-2xl font-bold">Installation complete</h1>
              <p className="text-sm text-muted max-w-md mx-auto">
                The installer is now permanently disabled. Sign in to the admin console to review settings
                {market.provider === 'binance'
                  ? ' — the full market list is syncing from the provider now'
                  : ' and create your first markets'}
                .
              </p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <a href="/admin/login">
                  <Button size="lg">Open admin console</Button>
                </a>
                <a href="/login">
                  <Button size="lg" variant="outline">
                    Go to login
                  </Button>
                </a>
              </div>
            </div>
          )}
          {err && <ErrorBox message={err} />}
          {step < 5 && (
            <div className="flex justify-between pt-2">
              <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>
                Back
              </Button>
              <Button disabled={!canNext} onClick={() => setStep(step + 1)}>
                Continue
              </Button>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
