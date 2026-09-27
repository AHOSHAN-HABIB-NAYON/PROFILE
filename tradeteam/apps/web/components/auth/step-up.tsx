'use client';
import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/primitives';
import { ApiError, post } from '@/lib/api';
import { MfaForm, type MfaMethods } from './mfa-form';

/**
 * Step-up verification for sensitive actions. Wrap an action with `guard(fn)`: if the server
 * answers `mfa_required`, the user verifies with a passkey / 2FA code and the action re-runs once.
 */
export function useStepUp() {
  const [methods, setMethods] = useState<MfaMethods | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const pending = useRef<{
    fn: () => Promise<unknown>;
    resolve: (v: unknown) => void;
    reject: (e: unknown) => void;
  } | null>(null);

  const guard = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    return fn().catch((e) => {
      if (e instanceof ApiError && e.code === 'mfa_required') {
        const d = (e.details as { methods?: MfaMethods } | undefined)?.methods ?? {
          totp: true,
          passkey: false,
          backupCode: true,
        };
        setMethods(d);
        return new Promise<T>((resolve, reject) => {
          pending.current = { fn, resolve: resolve as (v: unknown) => void, reject };
        });
      }
      if (e instanceof ApiError && e.status === 403 && /two-factor|passkey/i.test(e.message))
        setNeedsSetup(true);
      throw e;
    });
  }, []);

  const dialog = (
    <>
      <Sheet
        open={methods !== null}
        onClose={() => {
          setMethods(null);
          pending.current?.reject(new ApiError(0, 'cancelled', 'Verification cancelled'));
          pending.current = null;
        }}
        title="Confirm it's you"
      >
        <p className="text-sm text-muted mb-4">
          For your security, verify this action with your passkey or authenticator.
        </p>
        {methods && (
          <MfaForm
            methods={methods}
            passkeyOptionsPath="/auth/step-up/passkey/options"
            onSubmit={async (b) => {
              await post('/auth/step-up', b);
              setMethods(null);
              const p = pending.current;
              pending.current = null;
              if (p) p.fn().then(p.resolve, p.reject);
            }}
          />
        )}
      </Sheet>
      <Sheet open={needsSetup} onClose={() => setNeedsSetup(false)} title="Secure your account first">
        <p className="text-sm text-muted mb-4">
          Withdrawals and transfers require two-factor authentication or a passkey on your account.
        </p>
        <Link href="/settings/security">
          <Button block size="lg">
            Set up security
          </Button>
        </Link>
      </Sheet>
    </>
  );
  return { guard, dialog };
}
