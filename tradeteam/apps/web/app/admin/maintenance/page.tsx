'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, errorMessage } from '@/lib/api';
import { AdminTitle } from '@/components/admin/admin-shell';
import { Button, Card, InfoBox, Input, Toggle } from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';

export default function AdminMaintenance() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => get<{ settings: Record<string, { value: unknown }> }>('/admin/settings'),
  });
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!q.data) return;
    setEnabled(Boolean(q.data.settings['maintenance.enabled']?.value));
    setMessage(String(q.data.settings['maintenance.message']?.value ?? ''));
  }, [q.data]);
  const save = useMutation({
    mutationFn: () => post('/admin/system/maintenance', { enabled, message }),
    onSuccess: () => (
      toast(enabled ? 'Maintenance mode ON' : 'Maintenance mode OFF'),
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] }),
      qc.invalidateQueries({ queryKey: ['config'] })
    ),
    onError: (e) => toast.error('Failed', errorMessage(e)),
  });
  return (
    <div className="space-y-4 max-w-xl">
      <AdminTitle title="Maintenance" />
      <InfoBox tone="warn">
        While maintenance mode is on, new orders and withdrawals are rejected and users see a banner. Existing
        balances and orders are untouched. Admin access continues to work.
      </InfoBox>
      <Card className="space-y-4">
        <Toggle checked={enabled} onChange={setEnabled} label="Maintenance mode" />
        <Input
          label="Banner message"
          value={message}
          maxLength={500}
          onChange={(e) => setMessage(e.target.value)}
        />
        <Button loading={save.isPending} onClick={() => save.mutate()}>
          Apply
        </Button>
      </Card>
    </div>
  );
}
