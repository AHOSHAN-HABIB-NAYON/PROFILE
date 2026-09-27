import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, CloudDownload, RefreshCw, RotateCcw, ShieldCheck, Upload } from 'lucide-react';
import { api } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { Badge, Button, Field, Input, Sheet, Switch, toast } from '../../components/ui';
import { PageHeader, Panel } from '../components/kit';

interface Manifest { version: string; releaseDate: string; changelog: string[]; migrations?: string[]; minVersion?: string }
interface Job { running: boolean; version: string | null; log: string[]; status: 'idle' | 'running' | 'success' | 'failed'; startedAt: string | null }
interface U { currentVersion: string; databaseVersion: string; installedAt: string; staged: Array<{ version: string; manifest: Manifest }>; job: Job; history: Array<{ id: number; from_version: string; to_version: string; status: string; backup_file: string | null; started_at: string; finished_at: string | null; log: string | null }>; lastCheck: { at: string; latest: string | null } | null; pendingMigrations: string[] }

export default function Updates() {
  const qc = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const { data } = useQuery({ queryKey: ['updates'], queryFn: () => api.get<U>('/api/admin/system/updates'), refetchInterval: (q) => (q.state.data?.job.running ? 2000 : false) });
  const [check, setCheck] = useState<{ latest: { version: string; changelog?: string[]; releaseDate?: string } | null; available: boolean } | null>(null);
  const [rollbackFor, setRollbackFor] = useState<{ id: number; password: string; restoreDatabase: boolean } | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['updates'] });
  const doCheck = useMutation({ mutationFn: () => api.post<typeof check>('/api/admin/system/updates/check'), onSuccess: (r) => setCheck(r), onError: (e: Error) => toast.error(e.message) });
  const download = useMutation({ mutationFn: () => api.post<{ version: string }>('/api/admin/system/updates/download'), onSuccess: (r) => { toast.success(`Version ${r.version} downloaded & verified`); refresh(); }, onError: (e: Error) => toast.error(e.message) });
  const upload = useMutation({ mutationFn: (f: File) => { const fd = new FormData(); fd.set('package', f); return api.upload<{ version: string; signed: boolean }>('/api/admin/system/updates/upload', fd); }, onSuccess: (r) => { toast.success(`Package ${r.version} verified${r.signed ? ' (signature OK)' : ''}`); refresh(); }, onError: (e: Error) => toast.error(e.message) });
  const apply = useMutation({ mutationFn: (version: string) => api.post('/api/admin/system/updates/apply', { version, confirm: true }), onSuccess: () => { toast.info('Update started — the store is in maintenance mode'); refresh(); }, onError: (e: Error) => toast.error(e.message) });
  const rollback = useMutation({ mutationFn: () => api.post<{ version: string }>(`/api/admin/system/updates/rollback/${rollbackFor!.id}`, { password: rollbackFor!.password, restoreDatabase: rollbackFor!.restoreDatabase }), onSuccess: (r) => { toast.success(`Rolled back to ${r.version}. Restarting…`); setRollbackFor(null); setTimeout(() => location.reload(), 5000); }, onError: (e: Error) => toast.error(e.message) });
  const job = data?.job;
  if (job?.status === 'success' && !job.running) setTimeout(() => location.reload(), 6000);

  return (
    <div>
      <PageHeader title="Updates" subtitle="Safe, versioned updates: automatic backup → maintenance → verify → migrate → health check → switch. Your products, orders, customers and settings are never touched." />
      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <div className="space-y-4">
          <Panel title="Version">
            <dl className="grid grid-cols-2 gap-3 text-[14px]">
              <div className="rounded-2xl bg-soft p-3"><dt className="text-[12px] text-muted">Current version</dt><dd className="text-[22px] font-extrabold">{data?.currentVersion}</dd></div>
              <div className="rounded-2xl bg-soft p-3"><dt className="text-[12px] text-muted">Latest version</dt><dd className="text-[22px] font-extrabold">{check?.latest?.version ?? data?.lastCheck?.latest ?? '—'}</dd></div>
            </dl>
            <p className="mt-2 text-[12px] text-muted">Installed {dateTime(data?.installedAt)} · Database schema up to date: {data?.pendingMigrations.length ? <b className="text-danger">no ({data.pendingMigrations.length} pending)</b> : 'yes'}</p>
            {check && (check.available ? <div className="mt-3 rounded-2xl bg-green-50 p-3 text-[13px] text-green-900"><p className="font-bold">Update available: {check.latest?.version}</p><ul className="mt-1 list-disc pl-5">{check.latest?.changelog?.map((c) => <li key={c}>{c}</li>)}</ul><Button className="mt-2" size="sm" icon={<CloudDownload className="size-4" />} loading={download.isPending} onClick={() => download.mutate()}>Download & verify</Button></div> : <p className="mt-3 flex items-center gap-2 text-[13px] text-green-700"><CircleCheck className="size-4" />You're on the latest version.</p>)}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="soft" icon={<RefreshCw className="size-4" />} loading={doCheck.isPending} onClick={() => doCheck.mutate()}>Check for Updates</Button>
              <Button variant="ghost" icon={<Upload className="size-4" />} loading={upload.isPending} onClick={() => file.current?.click()}>Upload package</Button>
              <input ref={file} type="file" hidden accept=".gz,.tgz" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload.mutate(f); }} />
            </div>
          </Panel>
          {Boolean(data?.staged.length) && (
            <Panel title="Ready to install">
              {data!.staged.map((s) => (
                <div key={s.version} className="rounded-2xl border border-line p-4">
                  <p className="flex items-center gap-2 font-bold">Version {s.version} <Badge tone="green"><ShieldCheck className="size-3" />Verified</Badge></p>
                  <p className="text-[12px] text-muted">Released {s.manifest.releaseDate}{s.manifest.minVersion ? ` · requires ${s.manifest.minVersion}+` : ''} · {s.manifest.migrations?.length ?? 0} migration file(s)</p>
                  <ul className="mt-2 list-disc pl-5 text-[13px]">{s.manifest.changelog.map((c) => <li key={c}>{c}</li>)}</ul>
                  <Button className="mt-3" loading={apply.isPending} disabled={job?.running} onClick={() => { if (confirm(`Install ${s.version}? The store enters maintenance mode for a few minutes. A database & configuration backup is taken first.`)) apply.mutate(s.version); }}>Backup & Update</Button>
                </div>
              ))}
            </Panel>
          )}
        </div>
        <div className="space-y-4">
          {job && job.status !== 'idle' && (
            <Panel title={<span className="flex items-center gap-2">Update {job.version} {job.running ? <Badge tone="blue">Running…</Badge> : job.status === 'success' ? <Badge tone="green">Success — reloading</Badge> : <Badge tone="red">Failed — previous version kept</Badge>}</span>}>
              <pre className="max-h-80 overflow-auto rounded-xl bg-ink p-3 text-[11.5px] leading-relaxed whitespace-pre-wrap text-green-200">{job.log.join('\n')}</pre>
            </Panel>
          )}
          <Panel title="Update history" pad={false}>
            <ul className="divide-y divide-line">
              {data?.history.map((h, i) => (
                <li key={h.id} className="flex items-center gap-3 px-5 py-3 text-[13px]">
                  <span className="flex-1"><b>{h.from_version} → {h.to_version}</b><span className="block text-[12px] text-muted">{dateTime(h.started_at)}{h.backup_file ? ` · backup ${h.backup_file}` : ''}</span></span>
                  <Badge tone={h.status === 'success' ? 'green' : h.status === 'running' ? 'blue' : h.status === 'failed' ? 'red' : 'gray'}>{h.status}</Badge>
                  {i === 0 && h.status === 'success' && h.to_version === data.currentVersion && <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => setRollbackFor({ id: h.id, password: '', restoreDatabase: false })}>Rollback</Button>}
                </li>
              ))}
              {!data?.history.length && <li className="px-5 py-8 text-center text-[13px] text-muted">No updates installed yet.</li>}
            </ul>
          </Panel>
        </div>
      </div>
      <Sheet open={Boolean(rollbackFor)} onClose={() => setRollbackFor(null)} title="Roll back update" footer={<Button variant="danger" block loading={rollback.isPending} disabled={!rollbackFor?.password} onClick={() => rollback.mutate()}>Roll back</Button>}>
        {rollbackFor && <div className="space-y-3 text-[13.5px]">
          <p>Switches the code back to the previous version. By default your data is kept exactly as it is (migrations are additive).</p>
          <Switch checked={rollbackFor.restoreDatabase} onChange={(v) => setRollbackFor({ ...rollbackFor, restoreDatabase: v })} label="Also restore the pre-update database" description="Discards every order/change made since the update. Use only if the update corrupted data." />
          <Field label="Your password"><Input type="password" value={rollbackFor.password} onChange={(e) => setRollbackFor({ ...rollbackFor, password: e.target.value })} /></Field>
        </div>}
      </Sheet>
    </div>
  );
}
