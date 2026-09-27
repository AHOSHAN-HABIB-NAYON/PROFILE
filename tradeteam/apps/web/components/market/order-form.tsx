'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { D, floorTo, type MarketDTO, type OrderDTO, type OrderType } from '@tradeteam/shared';
import { createValueStore } from '@/lib/store';
import { post, errorMessage } from '@/lib/api';
import { useWallets, ownOrderIds } from '@/lib/hooks';
import { fmtNum } from '@/lib/format';
import { Button, Row, Select, cx } from '@/components/ui/primitives';
import { Sheet } from '@/components/ui/sheet';
import { toast } from '@/components/ui/toast';
import { useLivePrice } from './live';

/** Clicking an order-book level publishes its price here; the form picks it up. */
export const orderFormPrice = createValueStore<{ price: string; t: number } | null>(null);

const TYPES: { v: OrderType; l: string }[] = [
  { v: 'limit', l: 'Limit' },
  { v: 'market', l: 'Market' },
  { v: 'stop_limit', l: 'Stop-Limit' },
  { v: 'stop_market', l: 'Stop-Market' },
  { v: 'take_profit', l: 'Take Profit' },
  { v: 'stop_loss', l: 'Stop Loss' },
];

function isNum(s: string) {
  return /^\d*\.?\d*$/.test(s);
}

function NumField({
  label,
  value,
  onChange,
  unit,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit: string;
  placeholder?: string;
}) {
  return (
    <label className="flex items-center h-12 rounded-xl bg-card-2 px-3.5 gap-2 focus-within:ring-2 focus-within:ring-accent/30">
      <span className="text-[13px] text-muted w-16 shrink-0">{label}</span>
      <input
        inputMode="decimal"
        autoComplete="off"
        value={value}
        placeholder={placeholder ?? '0'}
        onChange={(e) => isNum(e.target.value) && onChange(e.target.value)}
        className="flex-1 min-w-0 bg-transparent outline-none text-right text-[15px] font-semibold num"
      />
      <span className="text-[13px] text-muted w-12 text-right shrink-0">{unit}</span>
    </label>
  );
}

export function OrderForm({
  market,
  authed,
  initialSide = 'buy',
  compact,
}: {
  market: MarketDTO;
  authed: boolean;
  initialSide?: 'buy' | 'sell';
  compact?: boolean;
}) {
  const [side, setSide] = useState<'buy' | 'sell'>(initialSide);
  const [type, setType] = useState<OrderType>('limit');
  const [price, setPrice] = useState('');
  const [stop, setStop] = useState('');
  const [amount, setAmount] = useState('');
  const [total, setTotal] = useState('');
  const [byTotal, setByTotal] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const qc = useQueryClient();
  const wallets = useWallets(authed).data;
  const { price: last } = useLivePrice(market.symbol, market.ticker?.c);
  const clicked = orderFormPrice.use();
  useEffect(() => setSide(initialSide), [initialSide]);
  useEffect(() => {
    if (clicked) setPrice(clicked.price);
  }, [clicked]);
  useEffect(() => {
    if (!price && last && type !== 'market') setPrice(last);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last, type]);

  const needsPrice = type === 'limit' || type === 'stop_limit';
  const needsStop = type !== 'limit' && type !== 'market';
  const marketBuyByTotal = type === 'market' && side === 'buy' && byTotal;
  const spendAsset = side === 'buy' ? market.quote : market.base;
  const avail = wallets?.items.find((b) => b.asset === spendAsset)?.available ?? '0';
  const feeRate = useMemo(() => new D(market.takerFee || '0.001'), [market.takerFee]);

  const refPrice = needsPrice && price ? price : needsStop && stop ? stop : (last ?? '0');
  const calc = useMemo(() => {
    try {
      const p = new D(refPrice || '0');
      if (marketBuyByTotal) {
        const t = new D(total || '0');
        const q = p.gt(0) ? floorTo(t.div(p), market.qtyPrecision) : new D(0);
        return { qty: q, total: t, fee: q.times(feeRate) };
      }
      const q = new D(amount || '0');
      const t = q.times(p);
      return { qty: q, total: t, fee: side === 'buy' ? q.times(feeRate) : t.times(feeRate) };
    } catch {
      return { qty: new D(0), total: new D(0), fee: new D(0) };
    }
  }, [refPrice, amount, total, marketBuyByTotal, side, feeRate, market.qtyPrecision]);

  const pct = (p: number) => {
    const a = new D(avail).times(p).div(100);
    if (marketBuyByTotal) return setTotal(floorTo(a, market.pricePrecision).toFixed());
    if (side === 'sell') return setAmount(floorTo(a, market.qtyPrecision).toFixed());
    const px = new D(refPrice || '0');
    if (px.lte(0)) return;
    // leave room for price improvement rounding; server re-validates everything
    setAmount(floorTo(a.div(px), market.qtyPrecision).toFixed());
  };

  const mut = useMutation({
    mutationFn: () => {
      const clientOrderId = `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
      ownOrderIds.add(clientOrderId); // before sending: the WS fill event can beat the HTTP response
      return post<{ order: OrderDTO }>('/orders', {
        symbol: market.symbol,
        side,
        type,
        ...(needsPrice ? { price } : {}),
        ...(needsStop ? { stopPrice: stop } : {}),
        ...(marketBuyByTotal ? { quoteQuantity: total } : { quantity: amount }),
        clientOrderId,
      });
    },
    onSuccess: ({ order }) => {
      setConfirm(false);
      const st = order.status;
      if (st === 'rejected' || st === 'expired')
        toast.error(`Order ${st}`, order.rejectReason?.replace(/_/g, ' ') ?? undefined);
      else
        toast(st === 'filled' ? 'Order filled' : 'Order placed', {
          body: `${side === 'buy' ? 'Buy' : 'Sell'} ${order.quantity ?? order.filledQty} ${market.base} · ${st.replace('_', ' ')}`,
        });
      setAmount('');
      setTotal('');
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (e) => {
      setConfirm(false);
      toast.error('Order not placed', errorMessage(e));
    },
  });

  const valid =
    (needsPrice ? Number(price) > 0 : true) &&
    (needsStop ? Number(stop) > 0 : true) &&
    (marketBuyByTotal ? Number(total) > 0 : Number(amount) > 0);

  return (
    <div
      className={cx(
        'bg-card rounded-2xl border border-line shadow-card p-3 sm:p-4',
        compact && 'shadow-none border-0 p-0 bg-transparent',
      )}
    >
      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-card-2 mb-3">
        {(['buy', 'sell'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={cx(
              'h-10 rounded-lg font-bold text-sm transition capitalize',
              side === s
                ? s === 'buy'
                  ? 'bg-up text-white shadow-sm'
                  : 'bg-down text-white shadow-sm'
                : 'text-muted',
            )}
          >
            {s}
          </button>
        ))}
      </div>
      <Select
        value={type}
        onChange={(e) => setType(e.target.value as OrderType)}
        aria-label="Order type"
        className="mb-3"
      >
        {TYPES.map((t) => (
          <option key={t.v} value={t.v}>
            {t.l}
          </option>
        ))}
      </Select>
      <div className="flex items-center justify-between text-[12px] mb-2">
        <span className="text-muted">Available</span>
        <span className="font-semibold num">
          {authed ? fmtNum(avail, 8) : '—'} {spendAsset}
        </span>
      </div>
      <div className="space-y-2">
        {needsStop && <NumField label="Trigger" value={stop} onChange={setStop} unit={market.quote} />}
        {needsPrice && <NumField label="Price" value={price} onChange={setPrice} unit={market.quote} />}
        {type === 'market' && side === 'buy' && (
          <div className="flex gap-1 text-[12px]">
            <button
              onClick={() => setByTotal(false)}
              className={cx(
                'px-2 h-7 rounded-md font-semibold',
                !byTotal ? 'bg-accent-soft text-accent' : 'text-muted',
              )}
            >
              Amount
            </button>
            <button
              onClick={() => setByTotal(true)}
              className={cx(
                'px-2 h-7 rounded-md font-semibold',
                byTotal ? 'bg-accent-soft text-accent' : 'text-muted',
              )}
            >
              Total
            </button>
          </div>
        )}
        {marketBuyByTotal ? (
          <NumField label="Total" value={total} onChange={setTotal} unit={market.quote} />
        ) : (
          <NumField label="Amount" value={amount} onChange={setAmount} unit={market.base} />
        )}
        <div className="grid grid-cols-4 gap-1.5">
          {[25, 50, 75, 100].map((p) => (
            <button
              key={p}
              disabled={!authed}
              onClick={() => pct(p)}
              className="h-8 rounded-lg bg-card-2 text-[12px] font-semibold text-fg-2 hover:bg-line disabled:opacity-50"
            >
              {p}%
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 space-y-0.5">
        {!marketBuyByTotal && (
          <Row
            label="Total"
            value={`${fmtNum(calc.total.toFixed(), market.pricePrecision)} ${market.quote}`}
          />
        )}
        <Row
          label={`Est. fee (${feeRate.times(100).toFixed()}%)`}
          value={`${fmtNum(calc.fee.toFixed(), 8)} ${side === 'buy' ? market.base : market.quote}`}
        />
        <Row
          label="You will receive"
          value={
            side === 'buy'
              ? `≈ ${fmtNum(calc.qty.minus(calc.fee).toFixed(), market.qtyPrecision)} ${market.base}`
              : `≈ ${fmtNum(calc.total.minus(calc.fee).toFixed(), 8)} ${market.quote}`
          }
        />
      </div>
      <div className="mt-3">
        {authed ? (
          <Button
            variant={side === 'buy' ? 'buy' : 'sell'}
            size="lg"
            block
            disabled={!valid || market.status !== 'trading'}
            onClick={() => setConfirm(true)}
          >
            {market.status !== 'trading'
              ? `Market ${market.status}`
              : `${side === 'buy' ? 'Buy' : 'Sell'} ${market.base}`}
          </Button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Link href={`/login?next=/trade/${market.symbol}`}>
              <Button variant="primary" block>
                Log in
              </Button>
            </Link>
            <Link href="/register">
              <Button variant="outline" block>
                Sign up
              </Button>
            </Link>
          </div>
        )}
      </div>
      <Sheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Confirm order"
        footer={
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant={side === 'buy' ? 'buy' : 'sell'}
              loading={mut.isPending}
              onClick={() => mut.mutate()}
            >
              Confirm {side}
            </Button>
          </div>
        }
      >
        <div className="space-y-1">
          <Row label="Market" value={`${market.base}/${market.quote}`} />
          <Row
            label="Side"
            value={<span className={side === 'buy' ? 'text-up' : 'text-down'}>{side.toUpperCase()}</span>}
          />
          <Row label="Type" value={TYPES.find((t) => t.v === type)?.l} />
          {needsStop && <Row label="Trigger price" value={`${stop} ${market.quote}`} />}
          {needsPrice && <Row label="Limit price" value={`${price} ${market.quote}`} />}
          {type === 'market' && (
            <Row label="Price" value={`Market (≈ ${fmtNum(last ?? '0', market.pricePrecision)})`} />
          )}
          <Row
            label={marketBuyByTotal ? 'Spend' : 'Amount'}
            value={marketBuyByTotal ? `${total} ${market.quote}` : `${amount} ${market.base}`}
          />
          <Row
            label="Estimated total"
            value={`${fmtNum(calc.total.toFixed(), market.pricePrecision)} ${market.quote}`}
          />
          <Row
            label="Estimated fee"
            value={`${fmtNum(calc.fee.toFixed(), 8)} ${side === 'buy' ? market.base : market.quote}`}
          />
          <p className="text-[12px] text-muted pt-2">
            Final price, fees and fills are determined by the server at execution time.
          </p>
        </div>
      </Sheet>
    </div>
  );
}
