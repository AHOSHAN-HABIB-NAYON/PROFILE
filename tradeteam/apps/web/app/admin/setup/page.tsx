'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { post, errorMessage } from '@/lib/api';
import { Button, CopyButton, ErrorBox, InfoBox, Input } from '@/components/ui/primitives';
import { registerPasskey, defaultPasskeyName } from '@/components/auth/passkey';
import { Logo } from '@/components/layout/brand';

/** Mandatory second-factor enrolment for admins without 2FA/passkey. */
export default function AdminSetup() {
  const router = useRouter();
  const qc = useQueryClient();
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (setup) QRCode.toDataURL(setup.otpauthUrl, { margin: 1, width: 200 }).then(setQr);
  }, [setup]);
  const finish = async () => {
    await qc.invalidateQueries({ queryKey: ['admin-me'] });
    router.replace('/admin');
  };
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
  return (
    <div className="min-h-dvh flex items-center justify-center px-4">
      <div className="w-full max-w-[440px] bg-card border border-line rounded-3xl shadow-card p-7 space-y-4">
        <div className="flex items-center gap-2.5">
          <Logo /> <span className="font-bold text-lg">Secure your admin account</span>
        </div>
        <InfoBox>A second factor is required for every administrator before the console can be used.</InfoBox>
        {codes ? (
          <>
            <p className="font-semibold">Backup codes</p>
            <div className="grid grid-cols-2 gap-2 font-mono bg-card-2 rounded-xl p-4">
              {codes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <CopyButton value={codes.join('\n')} label="Copy all" />
            <Button block size="lg" onClick={finish}>
              Continue to dashboard
            </Button>
          </>
        ) : !setup ? (
          <div className="space-y-2">
            <Button
              block
              size="lg"
              icon="key"
              loading={busy}
              onClick={() =>
                wrap(
                  async () => (
                    await registerPasskey(defaultPasskeyName(), '/admin/auth/passkey/register'),
                    await finish()
                  ),
                )
              }
            >
              Add a passkey
            </Button>
            <Button
              block
              size="lg"
              variant="outline"
              loading={busy}
              onClick={() => wrap(async () => setSetup(await post('/admin/auth/2fa/setup')))}
            >
              Use an authenticator app
            </Button>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => (
              e.preventDefault(),
              wrap(async () =>
                setCodes(
                  (await post<{ backupCodes: string[] }>('/admin/auth/2fa/enable', { code })).backupCodes,
                ),
              )
            )}
          >
            <div className="flex justify-center">
              <div className="bg-white p-3 rounded-2xl">
                {qr && <img src={qr} alt="QR" width={180} height={180} />}
              </div>
            </div>
            <p className="text-center font-mono text-sm break-all">{setup.secret}</p>
            <Input
              label="6-digit code"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
            <Button type="submit" block size="lg" loading={busy} disabled={code.length !== 6}>
              Enable
            </Button>
          </form>
        )}
        {err && <ErrorBox message={err} />}
      </div>
    </div>
  );
}
