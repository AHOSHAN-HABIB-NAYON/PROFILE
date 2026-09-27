'use client';
import { useState } from 'react';
import { Button, Input, Tabs } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icons';
import { errorMessage } from '@/lib/api';
import { passkeyAssertion } from './passkey';

export type MfaMethods = { totp: boolean; backupCode: boolean; passkey: boolean };
export type MfaSubmit = (
  b:
    | { method: 'totp' | 'backup'; code: string }
    | { method: 'passkey'; challengeId: string; response: unknown },
) => Promise<void>;

/** Second-factor UI shared by login, step-up and admin sign-in. */
export function MfaForm({
  methods,
  onSubmit,
  passkeyOptionsPath,
  passkeyBody,
}: {
  methods: MfaMethods;
  onSubmit: MfaSubmit;
  passkeyOptionsPath: string;
  passkeyBody?: Record<string, unknown>;
}) {
  const initial = methods.passkey ? 'passkey' : methods.totp ? 'totp' : 'backup';
  const [tab, setTab] = useState<'passkey' | 'totp' | 'backup'>(initial);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const items = [
    ...(methods.passkey ? [{ value: 'passkey' as const, label: 'Passkey' }] : []),
    ...(methods.totp ? [{ value: 'totp' as const, label: 'Authenticator' }] : []),
    ...(methods.backupCode || methods.totp ? [{ value: 'backup' as const, label: 'Backup code' }] : []),
  ];
  const run = async (fn: () => Promise<void>) => {
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
    <div className="space-y-4">
      {items.length > 1 && <Tabs value={tab} onChange={setTab} items={items} />}
      {tab === 'passkey' ? (
        <div className="text-center py-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-accent-soft text-accent flex items-center justify-center mb-3">
            <Icon name="key" size={26} />
          </div>
          <p className="text-sm text-muted mb-4">
            Use Face ID, Touch ID, Windows Hello or your security key.
          </p>
          <Button
            block
            size="lg"
            loading={busy}
            onClick={() =>
              run(async () =>
                onSubmit({ method: 'passkey', ...(await passkeyAssertion(passkeyOptionsPath, passkeyBody)) }),
              )
            }
          >
            Verify with passkey
          </Button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => onSubmit({ method: tab, code: code.trim() }));
          }}
          className="space-y-4"
        >
          <Input
            autoFocus
            label={tab === 'totp' ? '6-digit code from your authenticator app' : 'Backup recovery code'}
            inputMode={tab === 'totp' ? 'numeric' : 'text'}
            autoComplete="one-time-code"
            maxLength={tab === 'totp' ? 6 : 20}
            value={code}
            onChange={(e) => setCode(tab === 'totp' ? e.target.value.replace(/\D/g, '') : e.target.value)}
            placeholder={tab === 'totp' ? '000000' : 'XXXXX-XXXXX'}
          />
          <Button
            type="submit"
            block
            size="lg"
            loading={busy}
            disabled={tab === 'totp' ? code.length !== 6 : code.length < 8}
          >
            Verify
          </Button>
        </form>
      )}
      {err && <p className="text-sm text-down text-center">{err}</p>}
    </div>
  );
}
