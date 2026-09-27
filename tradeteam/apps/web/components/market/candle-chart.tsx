'use client';
import { useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import {
  channelName,
  type Candle,
  type Interval,
  sma,
  ema,
  rsi,
  macd,
  bollinger,
  vwap,
  type OHLCV,
} from '@tradeteam/shared';
import { get } from '@/lib/api';
import { onCandle, subscribe } from '@/lib/realtime';
import { theme } from '@/lib/theme';
import { Icon } from '@/components/ui/icons';
import { Spinner, cx } from '@/components/ui/primitives';

const TIMEFRAMES: { v: Interval; l: string }[] = [
  { v: '1s', l: '1s' },
  { v: '1m', l: '1m' },
  { v: '3m', l: '3m' },
  { v: '5m', l: '5m' },
  { v: '15m', l: '15m' },
  { v: '30m', l: '30m' },
  { v: '1h', l: '1H' },
  { v: '4h', l: '4H' },
  { v: '1d', l: '1D' },
  { v: '1w', l: '1W' },
];
type Ind = 'MA' | 'EMA' | 'BOLL' | 'VWAP' | 'RSI' | 'MACD';
const INDICATORS: Ind[] = ['MA', 'EMA', 'BOLL', 'VWAP', 'RSI', 'MACD'];

function css(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const toBar = (c: Candle): OHLCV => ({
  time: Math.floor(c.t / 1000),
  open: +c.o,
  high: +c.h,
  low: +c.l,
  close: +c.c,
  volume: +c.v,
});

/**
 * Real-time candlestick chart.
 *  - history via REST in pages of 500 (older pages lazy-loaded when scrolling left)
 *  - live candle updates from the candles:<symbol>:<interval> channel applied with series.update()
 *    — O(1) incremental updates, no full redraw, no React re-render per tick
 *  - out-of-order updates (older than the last bar) are ignored
 *  - indicators recomputed on a throttle, in panes where appropriate
 */
export function CandleChart({
  symbol,
  pricePrecision = 2,
  height = 420,
  defaultInterval = '15m',
}: {
  symbol: string;
  pricePrecision?: number;
  height?: number;
  defaultInterval?: Interval;
}) {
  const box = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const indRefs = useRef<ISeriesApi<'Line' | 'Histogram'>[]>([]);
  const data = useRef<OHLCV[]>([]);
  const [interval, setInterval_] = useState<Interval>(defaultInterval);
  const [inds, setInds] = useState<Set<Ind>>(new Set(['MA']));
  const [full, setFull] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInd, setShowInd] = useState(false);
  const indsRef = useRef(inds);
  indsRef.current = inds;

  // create chart once
  useEffect(() => {
    if (!box.current) return;
    const up = css('--up');
    const down = css('--down');
    const chart = createChart(box.current, {
      autoSize: true,
      layout: {
        background: { color: 'transparent' },
        textColor: css('--chart-text'),
        fontFamily: 'inherit',
        attributionLogo: false,
      },
      grid: { vertLines: { color: css('--chart-grid') }, horzLines: { color: css('--chart-grid') } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 6 },
    });
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: up,
      downColor: down,
      wickUpColor: up,
      wickDownColor: down,
      borderVisible: false,
      priceLineVisible: true,
    });
    const vol = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    chartRef.current = chart;
    candleRef.current = candle;
    volRef.current = vol;
    const unTheme = theme.subscribe(() => {
      requestAnimationFrame(() => {
        const u = css('--up');
        const d = css('--down');
        chart.applyOptions({
          layout: { textColor: css('--chart-text') },
          grid: { vertLines: { color: css('--chart-grid') }, horzLines: { color: css('--chart-grid') } },
        });
        candle.applyOptions({ upColor: u, downColor: d, wickUpColor: u, wickDownColor: d });
        redrawVolume();
      });
    });
    return () => {
      unTheme();
      chart.remove();
      chartRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- chart instance is created once

  useEffect(() => {
    candleRef.current?.applyOptions({
      priceFormat: {
        type: 'price',
        precision: Math.min(pricePrecision, 10),
        minMove: 1 / 10 ** Math.min(pricePrecision, 10),
      },
    });
  }, [pricePrecision]);

  function volBar(b: OHLCV) {
    return {
      time: b.time as UTCTimestamp,
      value: b.volume,
      color: b.close >= b.open ? css('--up') + '55' : css('--down') + '55',
    };
  }
  function redrawVolume() {
    volRef.current?.setData(data.current.map(volBar));
  }

  // indicators (throttled full recompute; cheap for a few thousand bars)
  const indTimer = useRef<number | null>(null);
  function scheduleIndicators() {
    if (indTimer.current) return;
    indTimer.current = window.setTimeout(() => {
      indTimer.current = null;
      drawIndicators();
    }, 400);
  }
  function drawIndicators() {
    const chart = chartRef.current;
    if (!chart) return;
    for (const s of indRefs.current) chart.removeSeries(s);
    indRefs.current = [];
    const d = data.current;
    const active = indsRef.current;
    const line = (pts: { time: number; value: number }[], color: string, pane = 0, width: 1 | 2 = 1) => {
      const s = chart.addSeries(
        LineSeries,
        {
          color,
          lineWidth: width,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        },
        pane,
      );
      s.setData(pts.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
      indRefs.current.push(s);
      return s;
    };
    if (active.has('MA')) {
      line(sma(d, 7), '#f59e0b');
      line(sma(d, 25), '#8b5cf6');
    }
    if (active.has('EMA')) line(ema(d, 20), '#06b6d4');
    if (active.has('BOLL')) {
      const b = bollinger(d);
      line(b.upper, '#a855f7');
      line(b.middle, '#94a3b8');
      line(b.lower, '#a855f7');
    }
    if (active.has('VWAP')) line(vwap(d), '#ec4899', 0, 2);
    let pane = 1;
    if (active.has('RSI')) {
      line(rsi(d), '#8b5cf6', pane);
      pane++;
    }
    if (active.has('MACD')) {
      const m = macd(d);
      const h = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pane);
      h.setData(
        m.histogram.map((p) => ({
          time: p.time as UTCTimestamp,
          value: p.value,
          color: p.value >= 0 ? css('--up') + '99' : css('--down') + '99',
        })),
      );
      indRefs.current.push(h);
      line(m.macd, '#3b82f6', pane);
      line(m.signal, '#f97316', pane);
    }
    const panes = chart.panes();
    for (let i = 1; i < panes.length; i++) panes[i]!.setHeight(90);
  }
  useEffect(() => {
    drawIndicators();
  }, [inds]);

  // history + live stream for (symbol, interval)
  useEffect(() => {
    let cancelled = false;
    let older = false;
    let reachedStart = false;
    const chart = chartRef.current!;
    const candle = candleRef.current!;
    const vol = volRef.current!;
    data.current = [];
    candle.setData([]);
    vol.setData([]);
    setLoading(true);
    setError(null);
    chart.applyOptions({ timeScale: { secondsVisible: interval === '1s' } });

    const apply = (c: Candle) => {
      if (c.s !== symbol || c.i !== interval) return;
      const b = toBar(c);
      const d = data.current;
      const last = d[d.length - 1];
      if (last && b.time < last.time) return; // stale / out-of-order
      if (last && b.time === last.time) d[d.length - 1] = b;
      else d.push(b);
      candle.update({ time: b.time as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close });
      vol.update(volBar(b));
      scheduleIndicators();
    };
    // Subscribe first so no live update is missed while history loads; buffer until ready.
    const buffer: Candle[] = [];
    let ready = false;
    const ch = channelName('candles', symbol, interval);
    const unsub = subscribe([ch]);
    const off = onCandle(ch, (c) => (ready ? apply(c) : buffer.push(c)));

    get<{ candles: Candle[] }>(`/candles/${symbol}`, { interval, limit: 500 })
      .then((r) => {
        if (cancelled) return;
        data.current = r.candles.map(toBar);
        candle.setData(
          data.current.map((b) => ({
            time: b.time as UTCTimestamp,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
          })),
        );
        redrawVolume();
        ready = true;
        buffer.splice(0).forEach(apply);
        drawIndicators();
        chart.timeScale().scrollToRealTime();
        setLoading(false);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message ?? 'Failed to load chart');
          setLoading(false);
        }
      });

    const onRange = (range: { from: number; to: number } | null) => {
      if (!range || older || reachedStart || !data.current.length || range.from > 30) return;
      older = true;
      const first = data.current[0]!.time;
      get<{ candles: Candle[] }>(`/candles/${symbol}`, { interval, limit: 500, endTime: first * 1000 - 1 })
        .then((r) => {
          if (cancelled) return;
          const more = r.candles.map(toBar).filter((b) => b.time < first);
          if (!more.length) {
            reachedStart = true;
            return;
          }
          const vr = chart.timeScale().getVisibleLogicalRange();
          data.current = [...more, ...data.current];
          candle.setData(
            data.current.map((b) => ({
              time: b.time as UTCTimestamp,
              open: b.open,
              high: b.high,
              low: b.low,
              close: b.close,
            })),
          );
          redrawVolume();
          drawIndicators();
          if (vr)
            chart
              .timeScale()
              .setVisibleLogicalRange({ from: vr.from + more.length, to: vr.to + more.length });
        })
        .finally(() => (older = false));
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    return () => {
      cancelled = true;
      off();
      unsub();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, interval]);

  return (
    <div
      className={cx(
        'flex flex-col bg-card',
        full ? 'fixed inset-0 z-50 pt-safe' : 'rounded-2xl border border-line shadow-card overflow-hidden',
      )}
    >
      <div className="flex items-center gap-1 px-2 sm:px-3 h-11 border-b border-line">
        <div className="flex gap-0.5 overflow-x-auto no-scrollbar flex-1">
          {TIMEFRAMES.map((t) => (
            <button
              key={t.v}
              onClick={() => setInterval_(t.v)}
              className={cx(
                'px-2.5 h-8 rounded-lg text-[13px] font-semibold shrink-0',
                interval === t.v ? 'bg-accent-soft text-accent' : 'text-muted hover:text-fg',
              )}
            >
              {t.l}
            </button>
          ))}
        </div>
        <div className="relative">
          <button
            onClick={() => setShowInd((s) => !s)}
            className="h-8 px-2.5 rounded-lg text-[13px] font-semibold text-muted hover:text-fg flex items-center gap-1"
            aria-expanded={showInd}
          >
            <Icon name="chart" size={16} /> <span className="hidden sm:inline">Indicators</span>
          </button>
          {showInd && (
            <div className="absolute right-0 top-9 z-20 bg-card border border-line rounded-xl shadow-pop p-2 w-44">
              {INDICATORS.map((i) => (
                <label
                  key={i}
                  className="flex items-center gap-2 px-2 h-9 rounded-lg hover:bg-card-2 text-sm cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={inds.has(i)}
                    onChange={() => {
                      const n = new Set(inds);
                      if (n.has(i)) n.delete(i);
                      else n.add(i);
                      setInds(n);
                    }}
                  />
                  {i}
                </label>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => setFull((f) => !f)}
          className="w-8 h-8 rounded-lg text-muted hover:text-fg flex items-center justify-center"
          aria-label={full ? 'Exit fullscreen' : 'Fullscreen'}
        >
          <Icon name={full ? 'close' : 'expand'} size={17} />
        </button>
      </div>
      <div className={cx('relative', full && 'flex-1')} style={full ? undefined : { height }}>
        <div ref={box} className="absolute inset-0" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-muted">
            <Spinner />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-down px-6 text-center">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
