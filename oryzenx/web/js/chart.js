// Binance-style candlestick chart (TradingView Lightweight Charts, loaded only when needed).
import { restFetch, sym } from './market.js';
import { price as fmtPrice } from './ui.js';

export const INTERVALS = [
  ['1m', '1m'], ['5m', '5m'], ['15m', '15m'], ['30m', '30m'], ['1h', '1H'], ['4h', '4H'], ['1d', '1D'], ['1w', '1W'],
];
const MAS = [[7, '#f0b90b'], [25, '#e040fb'], [99, '#7b61ff']];
const WS_HOSTS = ['wss://data-stream.binance.vision/ws', 'wss://stream.binance.com:9443/ws'];

let libPromise = null;
function loadLib() {
  if (window.LightweightCharts) return Promise.resolve(window.LightweightCharts);
  libPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/vendor/lightweight-charts.standalone.production.js';
    s.onload = () => resolve(window.LightweightCharts);
    s.onerror = () => { libPromise = null; reject(new Error('Chart failed to load')); };
    document.head.append(s);
  });
  return libPromise;
}

const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

function sma(bars, n) {
  const out = [];
  let sum = 0;
  bars.forEach((b, i) => {
    sum += b.close;
    if (i >= n) sum -= bars[i - n].close;
    if (i >= n - 1) out.push({ time: b.time, value: sum / n });
  });
  return out;
}

/**
 * Mount a chart into `el`. `legend` (optional) is an element that shows O/H/L/C and MA values.
 * Returns a function that removes the chart and closes its live stream.
 */
export async function mountChart(el, coin, interval = '15m', { legend } = {}) {
  const LWC = await loadLib();
  el.innerHTML = '';
  const dark = document.documentElement.dataset.theme !== 'light';
  const up = css('--up'); const down = css('--down');
  const grid = dark ? 'rgba(255,255,255,0.045)' : 'rgba(15,23,42,0.06)';
  const chart = LWC.createChart(el, {
    autoSize: true,
    layout: { background: { color: 'transparent' }, textColor: css('--text-3'), fontSize: 11, fontFamily: getComputedStyle(document.body).fontFamily },
    grid: { vertLines: { color: grid }, horzLines: { color: grid } },
    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.22 } },
    timeScale: { borderVisible: false, timeVisible: !['1d', '1w'].includes(interval), secondsVisible: false, rightOffset: 6, barSpacing: 8, minBarSpacing: 2 },
    crosshair: {
      mode: LWC.CrosshairMode.Normal,
      vertLine: { color: css('--text-3'), width: 1, style: LWC.LineStyle.Dashed, labelBackgroundColor: css('--brand') },
      horzLine: { color: css('--text-3'), width: 1, style: LWC.LineStyle.Dashed, labelBackgroundColor: css('--brand') },
    },
    localization: { locale: 'en-US', priceFormatter: (p) => fmtPrice(p) },
    watermark: { visible: true, text: `${coin}/USDT`, fontSize: 44, color: dark ? 'rgba(255,255,255,0.035)' : 'rgba(15,23,42,0.04)' },
    handleScale: { axisPressedMouseMove: true },
    kineticScroll: { touch: true, mouse: false },
  });
  const series = chart.addCandlestickSeries({
    upColor: up, downColor: down, borderVisible: false, wickUpColor: up, wickDownColor: down,
    priceLineStyle: LWC.LineStyle.Dashed,
  });
  const volume = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
  chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
  const maSeries = MAS.map(([, color]) => chart.addLineSeries({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }));

  const toBar = (k) => ({ time: Math.floor(k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4] });
  const toVol = (k) => ({ time: Math.floor(k[0] / 1000), value: +k[5], color: +k[4] >= +k[1] ? `${up}55` : `${down}55` });

  const rows = await restFetch(`/api/v3/klines?symbol=${sym(coin)}&interval=${interval}&limit=500`);
  const bars = rows.map(toBar);
  const last = bars.at(-1)?.close || 1;
  const precision = last >= 1000 ? 2 : last >= 1 ? 4 : last >= 0.01 ? 6 : 8;
  series.applyOptions({ priceFormat: { type: 'price', precision, minMove: 1 / 10 ** precision } });
  series.setData(bars);
  volume.setData(rows.map(toVol));
  MAS.forEach(([n], i) => maSeries[i].setData(sma(bars, n)));
  chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - 110), to: bars.length + 4 });

  // Legend: values under the finger/mouse, or the latest candle.
  const showLegend = (bar) => {
    if (!legend || !bar) return;
    const ch = ((bar.close - bar.open) / bar.open) * 100;
    const c = bar.close >= bar.open ? 'up' : 'down';
    const ma = MAS.map(([n, color]) => {
      const i = bars.findIndex((b) => b.time === bar.time);
      if (i < n - 1) return '';
      const v = bars.slice(i - n + 1, i + 1).reduce((s, b) => s + b.close, 0) / n;
      return `<span style="color:${color}">MA${n} ${fmtPrice(v)}</span>`;
    }).join('');
    legend.innerHTML = `<span>O <b class="${c}">${fmtPrice(bar.open)}</b></span><span>H <b class="${c}">${fmtPrice(bar.high)}</b></span>`
      + `<span>L <b class="${c}">${fmtPrice(bar.low)}</b></span><span>C <b class="${c}">${fmtPrice(bar.close)}</b></span>`
      + `<span class="${c}">${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%</span>${ma}`;
  };
  showLegend(bars.at(-1));
  chart.subscribeCrosshairMove((p) => showLegend(p?.time ? bars.find((b) => b.time === p.time) : bars.at(-1)));

  // Live candle updates over WebSocket, with a fallback host.
  let ws; let closed = false; let host = 0; let retries = 0;
  const open = () => {
    const sock = new WebSocket(`${WS_HOSTS[host]}/${sym(coin).toLowerCase()}@kline_${interval}`);
    ws = sock;
    sock.onopen = () => { retries = 0; };
    sock.onmessage = (ev) => {
      const { k } = JSON.parse(ev.data);
      const row = [k.t, k.o, k.h, k.l, k.c, k.v];
      const bar = toBar(row);
      if (bars.at(-1)?.time === bar.time) bars[bars.length - 1] = bar; else if (!bars.length || bar.time > bars.at(-1).time) bars.push(bar);
      series.update(bar);
      volume.update(toVol(row));
      MAS.forEach(([n], i) => { const m = sma(bars.slice(-n), n).at(-1); if (m) maSeries[i].update(m); });
    };
    sock.onclose = () => {
      if (closed || ws !== sock) return;
      retries += 1;
      if (retries > 2) host = (host + 1) % WS_HOSTS.length;
      setTimeout(open, Math.min(15000, 1000 * 2 ** retries));
    };
    sock.onerror = () => sock.close();
  };
  open();

  return () => { closed = true; ws?.close(); chart.remove(); };
}

export const MA_LEGEND = MAS;
