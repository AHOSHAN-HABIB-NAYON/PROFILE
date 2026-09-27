'use client';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, put, post, errorMessage } from '@/lib/api';
import { AdminTitle } from '@/components/admin/admin-shell';
import { Badge, Button, Card, Input, Select, Skeleton, Tabs, Toggle } from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';

type S = Record<string, { value: unknown; secret: boolean; isSet?: boolean }>;

const GROUPS: { id: string; label: string; keys: string[] }[] = [
  {
    id: 'general',
    label: 'General',
    keys: [
      'site.name',
      'site.tagline',
      'site.logo_url',
      'site.favicon_url',
      'site.currency',
      'site.timezone',
      'site.default_theme',
    ],
  },
  {
    id: 'auth',
    label: 'Authentication',
    keys: [
      'auth.registration_enabled',
      'auth.email_verification_required',
      'auth.google_enabled',
      'google.client_id',
      'google.client_secret',
      'auth.passkey_enabled',
      'auth.twofa_enabled',
      'auth.max_login_attempts',
      'auth.lockout_minutes',
      'auth.session_days',
      'auth.session_idle_hours',
    ],
  },
  {
    id: 'withdrawals',
    label: 'Withdrawal security',
    keys: ['withdrawal.require_verification', 'withdrawal.manual_review_all', 'withdrawal.daily_limit_usd'],
  },
  {
    id: 'market',
    label: 'Market data & API',
    keys: [
      'market.provider',
      'market.binance_rest_url',
      'market.binance_ws_url',
      'market.sync_minutes',
      'market.enrichment_enabled',
      'market.default_engine',
      'market.futures_enabled',
      'exchange.api_key',
      'exchange.api_secret',
    ],
  },
  {
    id: 'ws',
    label: 'WebSocket',
    keys: ['ws.max_channels_per_socket', 'ws.compression_threshold', 'push.enabled'],
  },
  {
    id: 'email',
    label: 'Email (SMTP)',
    keys: ['smtp.host', 'smtp.port', 'smtp.secure', 'smtp.user', 'smtp.password', 'smtp.from'],
  },
  { id: 'storage', label: 'Storage', keys: ['storage.driver'] },
];
const ENUMS: Record<string, string[]> = {
  'site.default_theme': ['light', 'dark'],
  'market.provider': ['binance', 'internal'],
  'market.default_engine': ['external', 'internal'],
  'storage.driver': ['local'],
};
const label = (k: string) =>
  k
    .split('.')[1]!
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());

export default function AdminSettings() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('general');
  const q = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => get<{ settings: S }>('/admin/settings'),
  });
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [testTo, setTestTo] = useState('');
  useEffect(() => setDraft({}), [tab]);
  const s = q.data?.settings;
  const group = GROUPS.find((g) => g.id === tab)!;
  const dirty = Object.keys(draft).length > 0;
  const save = useMutation({
    mutationFn: () => put('/admin/settings', draft),
    onSuccess: () => (
      toast('Settings saved'),
      setDraft({}),
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] }),
      qc.invalidateQueries({ queryKey: ['config'] })
    ),
    onError: (e) => toast.error('Not saved', errorMessage(e)),
  });
  const test = useMutation({
    mutationFn: () => post('/admin/settings/test-smtp', { to: testTo }),
    onSuccess: () => toast('Test email sent'),
    onError: (e) => toast.error('SMTP test failed', errorMessage(e)),
  });
  const fields = useMemo(() => group.keys.filter((k) => s?.[k]), [group, s]);
  if (!s) return <Skeleton className="h-96" />;
  return (
    <div className="space-y-4 max-w-3xl">
      <AdminTitle
        title="System settings"
        actions={
          <Button disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
            Save changes
          </Button>
        }
      />
      <Tabs value={tab} onChange={setTab} items={GROUPS.map((g) => ({ value: g.id, label: g.label }))} />
      <Card className="space-y-4">
        {fields.map((k) => {
          const def = s[k]!;
          const cur = k in draft ? draft[k] : def.value;
          const set = (v: unknown) => setDraft({ ...draft, [k]: v });
          if (typeof def.value === 'boolean')
            return <Toggle key={k} checked={Boolean(cur)} onChange={set} label={label(k)} description={k} />;
          if (ENUMS[k])
            return (
              <Select key={k} label={label(k)} value={String(cur)} onChange={(e) => set(e.target.value)}>
                {ENUMS[k]!.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </Select>
            );
          if (def.secret)
            return (
              <Input
                key={k}
                label={
                  <>
                    {label(k)} {def.isSet ? <Badge tone="up">set</Badge> : <Badge tone="warn">not set</Badge>}
                  </>
                }
                type="password"
                autoComplete="new-password"
                placeholder={def.isSet ? '•••••••• (leave empty to keep)' : ''}
                value={String(cur ?? '')}
                onChange={(e) => set(e.target.value)}
                hint="Stored encrypted. Never displayed after saving."
              />
            );
          if (typeof def.value === 'number')
            return (
              <Input
                key={k}
                label={label(k)}
                inputMode="numeric"
                value={String(cur)}
                onChange={(e) => set(e.target.value === '' ? '' : Number(e.target.value))}
              />
            );
          return (
            <Input
              key={k}
              label={label(k)}
              value={String(cur ?? '')}
              onChange={(e) => set(e.target.value)}
              hint={k}
            />
          );
        })}
        {tab === 'email' && (
          <div className="flex gap-2 items-end pt-2 border-t border-line">
            <Input
              className="flex-1"
              label="Send test email to"
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
            />
            <Button
              variant="secondary"
              loading={test.isPending}
              disabled={!testTo}
              onClick={() => test.mutate()}
            >
              Send test
            </Button>
          </div>
        )}
        {tab === 'market' && (
          <p className="text-[12px] text-muted">
            Changing the provider or URLs takes effect on the next market-data leader restart; the market list
            re-synchronises automatically.
          </p>
        )}
      </Card>
    </div>
  );
}
