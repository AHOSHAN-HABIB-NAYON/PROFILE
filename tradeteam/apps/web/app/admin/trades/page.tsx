'use client';
import { useState } from 'react';
import { fmtDateTime, fmtNum } from '@/lib/format';
import { AdminTitle } from '@/components/admin/admin-shell';
import { AdminList } from '@/components/admin/list';
import { Input, Row, cx } from '@/components/ui/primitives';
import { Sheet } from '@/components/ui/sheet';

interface T {
  id: number;
  symbol: string;
  price: string;
  qty: string;
  quoteQty: string;
  takerSide: string;
  makerOrderId: number | null;
  takerOrderId: number;
  makerUserId: number | null;
  takerUserId: number;
  makerFee: string;
  takerFee: string;
  externalRef: string | null;
  createdAt: string;
}

export default function AdminTrades() {
  const [f, setF] = useState({ id: '', symbol: '', user: '' });
  const [sel, setSel] = useState<T | null>(null);
  return (
    <div>
      <AdminTitle title="Trades" />
      <AdminList<T>
        path="/admin/trades"
        filters={Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v || undefined]))}
        rowKey={(t) => String(t.id)}
        onRowClick={setSel}
        mobileTitle={(t) => `#${t.id} ${t.symbol}`}
        toolbar={
          <div className="grid sm:grid-cols-3 gap-2">
            <Input
              placeholder="Trade ID"
              value={f.id}
              onChange={(e) => setF({ ...f, id: e.target.value.replace(/\D/g, '') })}
            />
            <Input
              placeholder="Symbol"
              value={f.symbol}
              onChange={(e) => setF({ ...f, symbol: e.target.value })}
            />
            <Input
              placeholder="User email / UID"
              value={f.user}
              onChange={(e) => setF({ ...f, user: e.target.value })}
            />
          </div>
        }
        columns={[
          { key: 'id', header: 'ID', render: (t) => `#${t.id}` },
          { key: 'time', header: 'Time', render: (t) => fmtDateTime(t.createdAt) },
          { key: 'm', header: 'Market', render: (t) => <span className="font-semibold">{t.symbol}</span> },
          {
            key: 's',
            header: 'Taker',
            render: (t) => (
              <span className={cx('font-semibold', t.takerSide === 'buy' ? 'text-up' : 'text-down')}>
                {t.takerSide}
              </span>
            ),
          },
          { key: 'p', header: 'Price', align: 'right', render: (t) => fmtNum(t.price, 8) },
          { key: 'q', header: 'Qty', align: 'right', render: (t) => fmtNum(t.qty, 8) },
          { key: 'v', header: 'Value', align: 'right', render: (t) => fmtNum(t.quoteQty, 8) },
          {
            key: 'f',
            header: 'Fees (m/t)',
            align: 'right',
            render: (t) => `${fmtNum(t.makerFee, 8)} / ${fmtNum(t.takerFee, 8)}`,
          },
        ]}
      />
      <Sheet open={sel !== null} onClose={() => setSel(null)} title={`Trade #${sel?.id}`}>
        {sel &&
          Object.entries(sel).map(([k, v]) => (
            <Row key={k} label={k} value={k === 'createdAt' ? fmtDateTime(String(v)) : String(v ?? '—')} />
          ))}
      </Sheet>
    </div>
  );
}
