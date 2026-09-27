'use client';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { patch, post, errorMessage } from '@/lib/api';
import { useMe } from '@/lib/hooks';
import { PageHeader } from '@/components/layout/app-shell';
import { Avatar, Badge, Button, Card, CopyButton, Input, Row, Select } from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';
import { fmtDateTime } from '@/lib/format';

const TIMEZONES = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['UTC'];

export default function ProfilePage() {
  const me = useMe().data;
  const qc = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const [f, setF] = useState({ name: '', phone: '', timezone: 'UTC', currency: 'USD', language: 'en' });
  useEffect(() => {
    if (me)
      setF({
        name: me.name,
        phone: me.phone ?? '',
        timezone: me.profile?.timezone ?? 'UTC',
        currency: me.profile?.currency ?? 'USD',
        language: me.profile?.language ?? 'en',
      });
  }, [me]);
  const save = useMutation({
    mutationFn: () =>
      patch('/account/profile', {
        name: f.name,
        phone: f.phone || null,
        timezone: f.timezone,
        currency: f.currency,
        language: f.language,
      }),
    onSuccess: () => (toast('Profile saved'), qc.invalidateQueries({ queryKey: ['me'] })),
    onError: (e) => toast.error('Could not save', errorMessage(e)),
  });
  const avatar = useMutation({
    mutationFn: async (fl: File) => {
      if (fl.size > 1_000_000) throw new Error('Image must be under 1 MB');
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = rej;
        r.readAsDataURL(fl);
      });
      return post('/account/avatar', { dataUrl });
    },
    onSuccess: () => (toast('Avatar updated'), qc.invalidateQueries({ queryKey: ['me'] })),
    onError: (e) => toast.error('Upload failed', errorMessage(e)),
  });
  if (!me) return null;
  return (
    <div className="space-y-4 max-w-2xl">
      <PageHeader title="Profile" />
      <Card>
        <div className="flex items-center gap-4">
          <Avatar name={me.name} url={me.avatarUrl} size={72} />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-lg truncate">{me.name}</p>
            <p className="text-sm text-muted truncate">{me.email}</p>
            <div className="flex gap-1.5 mt-1.5">
              {me.emailVerified ? <Badge tone="up">Verified</Badge> : <Badge tone="warn">Unverified</Badge>}
              {me.twoFactorEnabled && <Badge tone="accent">2FA</Badge>}
              {me.passkeys && <Badge tone="accent">Passkey</Badge>}
            </div>
          </div>
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => e.target.files?.[0] && avatar.mutate(e.target.files[0])}
          />
          <Button
            size="sm"
            variant="secondary"
            loading={avatar.isPending}
            onClick={() => file.current?.click()}
          >
            Change photo
          </Button>
        </div>
        <div className="mt-4 rounded-xl bg-card-2 px-4 py-2">
          <Row
            label="User ID"
            value={
              <span className="flex items-center gap-2">
                {me.uid} <CopyButton value={me.uid} />
              </span>
            }
          />
          <Row
            label="Account status"
            value={me.profile?.kycStatus === 'verified' ? 'Identity verified' : 'Standard'}
          />
          <Row label="Member since" value={fmtDateTime((me as unknown as { createdAt: string }).createdAt)} />
        </div>
      </Card>
      <Card>
        <form className="space-y-4" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
          <Input
            label="Full name"
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            required
            maxLength={100}
          />
          <Input
            label="Email"
            value={me.email}
            disabled
            hint="Contact support to change your email address."
          />
          <Input
            label="Phone (optional)"
            type="tel"
            value={f.phone}
            onChange={(e) => setF({ ...f, phone: e.target.value })}
            placeholder="+1 555 000 0000"
          />
          <div className="grid sm:grid-cols-3 gap-3">
            <Select
              label="Timezone"
              value={f.timezone}
              onChange={(e) => setF({ ...f, timezone: e.target.value })}
            >
              {['UTC', ...TIMEZONES.filter((t) => t !== 'UTC')].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
            <Select
              label="Display currency"
              value={f.currency}
              onChange={(e) => setF({ ...f, currency: e.target.value })}
            >
              {['USD', 'USDT', 'EUR', 'GBP', 'BTC'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
            <Select
              label="Language"
              value={f.language}
              onChange={(e) => setF({ ...f, language: e.target.value })}
            >
              {[
                ['en', 'English'],
                ['es', 'Español'],
                ['fr', 'Français'],
                ['de', 'Deutsch'],
                ['bn', 'বাংলা'],
                ['ar', 'العربية'],
                ['zh', '中文'],
                ['ja', '日本語'],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" loading={save.isPending}>
            Save changes
          </Button>
        </form>
      </Card>
    </div>
  );
}
