'use client';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { post, errorMessage } from '@/lib/api';
import { AdminTitle } from '@/components/admin/admin-shell';
import { Button, Card, Input, SectionTitle, Toggle } from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-fg-2 mb-1.5">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        maxLength={2000}
        className="w-full rounded-xl border border-line-strong bg-elev p-3 text-[15px] outline-none focus:border-accent"
      />
    </label>
  );
}

export default function AdminNotifications() {
  const [a, setA] = useState({ title: '', body: '' });
  const [u, setU] = useState({ user: '', title: '', body: '', email: false });
  const announce = useMutation({
    mutationFn: () => post<{ delivered: number }>('/admin/notifications/announce', a),
    onSuccess: (r) => (toast(`Announcement sent to ${r.delivered} users`), setA({ title: '', body: '' })),
    onError: (e) => toast.error('Failed', errorMessage(e)),
  });
  const direct = useMutation({
    mutationFn: () => post('/admin/notifications/user', u),
    onSuccess: () => (toast('Notification sent'), setU({ ...u, title: '', body: '' })),
    onError: (e) => toast.error('Failed', errorMessage(e)),
  });
  return (
    <div className="space-y-4 max-w-2xl">
      <AdminTitle title="Notifications" />
      <Card className="space-y-3">
        <SectionTitle>Global announcement</SectionTitle>
        <Input
          label="Title"
          value={a.title}
          maxLength={200}
          onChange={(e) => setA({ ...a, title: e.target.value })}
        />
        <TextArea label="Message" value={a.body} onChange={(v) => setA({ ...a, body: v })} />
        <Button
          loading={announce.isPending}
          disabled={!a.title || !a.body}
          onClick={() => window.confirm('Send to all active users?') && announce.mutate()}
        >
          Send to all users
        </Button>
      </Card>
      <Card className="space-y-3">
        <SectionTitle>Message a user</SectionTitle>
        <Input
          label="User email or UID"
          value={u.user}
          onChange={(e) => setU({ ...u, user: e.target.value })}
        />
        <Input
          label="Title"
          value={u.title}
          maxLength={200}
          onChange={(e) => setU({ ...u, title: e.target.value })}
        />
        <TextArea label="Message" value={u.body} onChange={(v) => setU({ ...u, body: v })} />
        <Toggle checked={u.email} onChange={(v) => setU({ ...u, email: v })} label="Also send by email" />
        <Button
          loading={direct.isPending}
          disabled={!u.user || !u.title || !u.body}
          onClick={() => direct.mutate()}
        >
          Send
        </Button>
      </Card>
    </div>
  );
}
