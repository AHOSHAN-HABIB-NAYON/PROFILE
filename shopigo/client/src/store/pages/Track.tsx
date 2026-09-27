import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Check, PackageSearch, Truck } from 'lucide-react';
import { api } from '../../lib/api';
import { cx, dateTime, money } from '../../lib/format';
import { useT } from '../../lib/i18n';
import { useSettings } from '../../lib/settings';
import { Button, Field, Input } from '../../components/ui';
import { TopBar } from '../components/chrome';

interface TrackResult { orderNo: string; status: string; total: number; itemCount: number; createdAt: string; trackingCode: string | null; courier: string | null; courierStatus: string | null; history: Array<{ to_status: string; label: string; label_bn: string | null; created_at: string }>; statuses: Array<{ code: string; label: string; label_bn: string | null; is_final: number }> }

const FLOW = ['new', 'confirmed', 'processing', 'courier_sent', 'in_transit', 'delivered'];

export default function Track() {
  const t = useT();
  const s = useSettings();
  const [orderNo, setOrderNo] = useState('');
  const [phone, setPhone] = useState('');
  const m = useMutation({ mutationFn: () => api.post<TrackResult>('/api/public/track', { orderNo: orderNo.trim().replace(/^#/, ''), phone }) });
  const r = m.data;
  const reached = r ? Math.max(FLOW.indexOf(r.status), ...r.history.map((h) => FLOW.indexOf(h.to_status))) : -1;
  const bn = s.language === 'bn';
  return (
    <div>
      <TopBar title={t('trackOrder')} />
      <div className="mx-auto max-w-xl px-4 md:pt-8">
        <h1 className="mb-1 hidden text-[26px] font-extrabold md:block">{t('trackTitle')}</h1>
        <p className="mb-4 text-[14px] text-muted">{t('trackHelp')}</p>
        <form className="card space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <Field label={t('orderId')} required><Input value={orderNo} onChange={(e) => setOrderNo(e.target.value)} placeholder="SG26092712345" required /></Field>
          <Field label={t('phone')} required><Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="numeric" placeholder="01XXXXXXXXX" required /></Field>
          {m.error && <p className="text-[13px] font-semibold text-danger">{m.error.message}</p>}
          <Button block size="lg" loading={m.isPending} icon={<PackageSearch className="size-5" />}>{t('track')}</Button>
        </form>
        {r && (
          <div className="card mt-4 p-5">
            <div className="flex items-center justify-between"><span className="font-bold">#{r.orderNo}</span><span className="font-extrabold">{money(r.total, s.currency_symbol)}</span></div>
            <p className="text-[12.5px] text-muted">{dateTime(r.createdAt)} · {r.itemCount} {t('items')}</p>
            {['cancelled', 'returned'].includes(r.status) ? (
              <p className="mt-4 rounded-2xl bg-red-50 p-3 text-center font-bold text-danger">{r.statuses.find((x) => x.code === r.status)?.[bn ? 'label_bn' : 'label']}</p>
            ) : (
              <ol className="mt-5 space-y-0">
                {FLOW.map((code, i) => {
                  const st = r.statuses.find((x) => x.code === code);
                  const when = r.history.find((h) => h.to_status === code)?.created_at;
                  const done = i <= reached;
                  return (
                    <li key={code} className="relative flex gap-3 pb-5 last:pb-0">
                      {i < FLOW.length - 1 && <span className={cx('absolute top-7 left-[13px] h-[calc(100%-20px)] w-0.5', i < reached ? 'bg-brand-400' : 'bg-line')} />}
                      <span className={cx('relative z-10 grid size-7 shrink-0 place-items-center rounded-full', done ? 'bg-brand-500 text-white' : 'bg-soft text-muted')}>{done ? <Check className="size-4" /> : <span className="size-2 rounded-full bg-current" />}</span>
                      <div><p className={cx('text-[14px] font-semibold', !done && 'text-muted')}>{(bn ? st?.label_bn : st?.label) ?? code}</p>{when && <p className="text-[12px] text-muted">{dateTime(when)}</p>}</div>
                    </li>
                  );
                })}
              </ol>
            )}
            {r.courier && <p className="mt-4 flex items-center gap-2 rounded-2xl bg-soft p-3 text-[13px]"><Truck className="size-4 text-brand-500" />{r.courier}{r.trackingCode && ` · ${r.trackingCode}`}{r.courierStatus && ` · ${r.courierStatus}`}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
