'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { get, post, errorMessage } from '@/lib/api';
import { PageHeader } from '@/components/layout/app-shell';
import { Badge, Button, Card, CopyButton, InfoBox, Input } from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';

export default function TwoFactorPage() {
  const qc = useQueryClient();
  const sec = useQuery({
    queryKey: ['security'],
    queryFn: () =>
      get<{ twoFactor: { enabled: boolean; backupCodesRemaining: number } }>('/account/security'),
  });
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  useEffect(() => {
    if (setup) QRCode.toDataURL(setup.otpauthUrl, { margin: 1, width: 200 }).then(setQr);
  }, [setup]);
  const begin = useMutation({
    mutationFn: () => post<{ secret: string; otpauthUrl: string }>('/account/2fa/setup'),
    onSuccess: setSetup,
    onError: (e) => toast.error('Could not start setup', errorMessage(e)),
  });
  const enable = useMutation({
    mutationFn: () => post<{ backupCodes: string[] }>('/account/2fa/enable', { code }),
    onSuccess: (r) => {
      setCodes(r.backupCodes);
      setSetup(null);
      setCode('');
      toast('Two-factor authentication enabled');
      qc.invalidateQueries({ queryKey: ['security'] });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toast.error('Invalid code', errorMessage(e)),
  });
  const disable = useMutation({
    mutationFn: () => post('/account/2fa/disable', { code }),
    onSuccess: () => (
      toast('2FA disabled'),
      setCode(''),
      qc.invalidateQueries({ queryKey: ['security'] }),
      qc.invalidateQueries({ queryKey: ['me'] })
    ),
    onError: (e) => toast.error('Could not disable', errorMessage(e)),
  });
  const regen = useMutation({
    mutationFn: () => post<{ backupCodes: string[] }>('/account/2fa/backup-codes', { code }),
    onSuccess: (r) => (
      setCodes(r.backupCodes),
      setCode(''),
      qc.invalidateQueries({ queryKey: ['security'] })
    ),
    onError: (e) => toast.error('Invalid code', errorMessage(e)),
  });
  const enabled = sec.data?.twoFactor.enabled;
  return (
    <div className="space-y-4 max-w-xl">
      <PageHeader title="Two-factor authentication" back="/settings/security" />
      {codes && (
        <Card className="space-y-3">
          <p className="font-semibold">Save your backup codes</p>
          <InfoBox tone="warn">
            Each code works once. Store them somewhere safe — they are the only way in if you lose your
            authenticator.
          </InfoBox>
          <div className="grid grid-cols-2 gap-2 font-mono text-[15px] bg-card-2 rounded-xl p-4">
            {codes.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <div className="flex gap-4">
            <CopyButton value={codes.join('\n')} label="Copy all" />
            <button className="text-[13px] font-semibold text-accent" onClick={() => setCodes(null)}>
              I saved them
            </button>
          </div>
        </Card>
      )}
      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="font-semibold">Authenticator app</p>
          {enabled ? <Badge tone="up">Enabled</Badge> : <Badge tone="warn">Disabled</Badge>}
        </div>
        {!enabled && !setup && (
          <>
            <p className="text-sm text-muted">
              Use Google Authenticator, 1Password, Authy or any TOTP app to generate sign-in codes.
            </p>
            <Button loading={begin.isPending} onClick={() => begin.mutate()}>
              Set up authenticator
            </Button>
          </>
        )}
        {setup && (
          <div className="space-y-4">
            <p className="text-sm text-muted">1. Scan this QR code with your authenticator app.</p>
            <div className="flex justify-center">
              <div className="bg-white p-3 rounded-2xl">
                {qr && <img src={qr} alt="2FA QR code" width={180} height={180} />}
              </div>
            </div>
            <div className="text-center text-[13px]">
              <p className="text-muted">Or enter this key manually</p>
              <p className="font-mono font-semibold break-all mt-1">
                {setup.secret.match(/.{1,4}/g)?.join(' ')}
              </p>
              <div className="mt-1">
                <CopyButton value={setup.secret} />
              </div>
            </div>
            <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), enable.mutate())}>
              <Input
                label="2. Enter the 6-digit code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
              <Button type="submit" block loading={enable.isPending} disabled={code.length !== 6}>
                Enable 2FA
              </Button>
            </form>
          </div>
        )}
        {enabled && (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              {sec.data?.twoFactor.backupCodesRemaining} backup codes remaining. Enter a current authenticator
              code to manage 2FA.
            </p>
            <Input
              label="Authenticator or backup code"
              value={code}
              onChange={(e) => setCode(e.target.value.trim())}
              maxLength={20}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                loading={regen.isPending}
                disabled={!/^\d{6}$/.test(code)}
                onClick={() => regen.mutate()}
              >
                New backup codes
              </Button>
              <Button
                variant="danger"
                loading={disable.isPending}
                disabled={code.length < 6}
                onClick={() => disable.mutate()}
              >
                Disable 2FA
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
