'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, patch, del, errorMessage } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { PageHeader } from '@/components/layout/app-shell';
import { Badge, Button, Card, Empty, InfoBox, Input, Skeleton } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icons';
import { Sheet } from '@/components/ui/sheet';
import { toast } from '@/components/ui/toast';
import { defaultPasskeyName, passkeyCapabilities, registerPasskey } from '@/components/auth/passkey';
import { useStepUp } from '@/components/auth/step-up';

interface PK {
  id: string;
  name: string;
  device_type: string | null;
  backedUp: boolean;
  device_info: string | null;
  last_used_at: string | null;
  created_at: string;
}

export default function PasskeysPage() {
  const qc = useQueryClient();
  const [caps, setCaps] = useState<{ supported: boolean; platform: boolean } | null>(null);
  const [rename, setRename] = useState<PK | null>(null);
  const [name, setName] = useState('');
  const { guard, dialog } = useStepUp();
  useEffect(() => {
    passkeyCapabilities().then(setCaps);
  }, []);
  const q = useQuery({ queryKey: ['security'], queryFn: () => get<{ passkeys: PK[] }>('/account/security') });
  const add = useMutation({
    mutationFn: () => registerPasskey(defaultPasskeyName()),
    onSuccess: () => (
      toast('Passkey added'),
      qc.invalidateQueries({ queryKey: ['security'] }),
      qc.invalidateQueries({ queryKey: ['me'] })
    ),
    onError: (e) =>
      toast.error(
        'Passkey not added',
        (e as Error).name === 'NotAllowedError' ? 'The request was cancelled or timed out.' : errorMessage(e),
      ),
  });
  const save = useMutation({
    mutationFn: () => patch(`/account/passkeys/${rename!.id}`, { name }),
    onSuccess: () => (setRename(null), qc.invalidateQueries({ queryKey: ['security'] })),
  });
  const remove = useMutation({
    mutationFn: (id: string) => guard(() => del(`/account/passkeys/${id}`)),
    onSuccess: () => (toast('Passkey removed'), qc.invalidateQueries({ queryKey: ['security'] })),
    onError: (e) =>
      (e as { code?: string }).code !== 'cancelled' && toast.error('Could not remove', errorMessage(e)),
  });
  return (
    <div className="space-y-4 max-w-2xl">
      <PageHeader
        title="Passkeys"
        back="/settings/security"
        actions={
          <Button
            icon="plus"
            loading={add.isPending}
            disabled={!caps?.supported}
            onClick={() => add.mutate()}
          >
            Add passkey
          </Button>
        }
      />
      {dialog}
      {caps && !caps.supported && (
        <InfoBox tone="warn">
          This browser does not support passkeys. Try a recent version of Safari, Chrome, Edge or Firefox.
        </InfoBox>
      )}
      {caps?.supported && (
        <InfoBox>
          {caps.platform
            ? 'This device can create a passkey using Face ID, Touch ID or Windows Hello.'
            : 'Use a phone or a hardware security key to create a passkey.'}
        </InfoBox>
      )}
      <Card padded={false}>
        {q.isLoading ? (
          <div className="p-4">
            <Skeleton className="h-32" />
          </div>
        ) : !q.data?.passkeys.length ? (
          <Empty
            icon="key"
            title="No passkeys yet"
            description="Passkeys are phishing-resistant and replace passwords with your device's biometrics."
          />
        ) : (
          <div className="divide-y divide-line">
            {q.data.passkeys.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3.5">
                <span className="w-10 h-10 rounded-xl bg-accent-soft text-accent flex items-center justify-center">
                  <Icon name="key" size={19} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">
                    {p.name} {p.backedUp && <Badge tone="accent">Synced</Badge>}
                  </p>
                  <p className="text-[12px] text-muted truncate">
                    {p.device_info ?? p.device_type ?? 'Passkey'} · Added {fmtDateTime(p.created_at)} ·{' '}
                    {p.last_used_at ? `Last used ${fmtDateTime(p.last_used_at)}` : 'Never used'}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => (setRename(p), setName(p.name))}>
                  Rename
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  loading={remove.isPending && remove.variables === p.id}
                  onClick={() => remove.mutate(p.id)}
                >
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Sheet open={rename !== null} onClose={() => setRename(null)} title="Rename passkey">
        <form className="space-y-4" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
          <Input label="Name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" block loading={save.isPending}>
            Save
          </Button>
        </form>
      </Sheet>
    </div>
  );
}
