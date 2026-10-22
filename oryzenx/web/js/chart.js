// Candlestick chart for one coin (TradingView Lightweight Charts, loaded only when needed).
import { restFetch, sym } from './market.js';

let libPromise = null;
function loadLib() {
  if (window.LightweightCharts) return Promise.resolve(window.LightweightCharts);
  libPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/vendor/lightweight-charts.standalone.production.js';
    s.onload = () => resolve(window.LightweightCharts);
    s.onerror = () => reject(new Error('Chart failed to load'));
    document.head.append(s);
  });
  return libPromise;
}

const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

export async function mountChart(el, coin, interval = '1h') {
  const LWC = await loadLib();
  el.innerHTML = '';
  const chart = LWC.createChart(el, {
    autoSize: true,
    layout: { background: { color: 'transparent' }, textColor: css('--text-2'), fontFamily: 'inherit' },
    grid: { vertLines: { color: css('--line') }, horzLines: { color: css('--line') } },
    rightPriceScale: { borderColor: css('--line') },
    timeScale: { borderColor: css('--line'), timeVisible: true, secondsVisible: false },
    crosshair: { mode: 0 },
    localization: { locale: 'en-US' },
  });
  const up = css('--up'); const down = css('--down');
  const series = chart.addCandlestickSeries({ upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down });
  const volume = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol' });
  chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

  const toBar = (k) => ({ time: Math.floor(k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4] });
  const toVol = (k) => ({ time: Math.floor(k[0] / 1000), value: +k[5], color: +k[4] >= +k[1] ? `${up}66` : `${down}66` });

  const rows = await restFetch(`/api/v3/klines?symbol=${sym(coin)}&interval=${interval}&limit=400`);
  const minMove = Math.min(...rows.slice(-50).map((k) => +k[4])) < 1 ? 1e-8 : 0.01;
  series.applyOptions({ priceFormat: { type: 'price', precision: minMove < 0.01 ? 8 : 2, minMove } });
  series.setData(rows.map(toBar));
  volume.setData(rows.map(toVol));
  chart.timeScale().fitContent();

  // Live candle updates.
  let ws; let closed = false;
  const open = () => {
    ws = new WebSocket(`wss://data-stream.binance.vision/ws/${sym(coin).toLowerCase()}@kline_${interval}`);
    ws.onmessage = (ev) => {
      const { k } = JSON.parse(ev.data);
      const row = [k.t, k.o, k.h, k.l, k.c, k.v];
      series.update(toBar(row));
      volume.update(toVol(row));
    };
    ws.onclose = () => { if (!closed) setTimeout(open, 3000); };
  };
  open();

  return () => { closed = true; ws?.close(); chart.remove(); };
}
