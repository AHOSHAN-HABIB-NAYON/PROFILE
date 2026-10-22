// Live prices straight from Binance's public market-data streams.
// The browser connects to Binance directly, so the server does no work for live prices.
const HOSTS = ['wss://data-stream.binance.vision/stream', 'wss://stream.binance.com:9443/stream'];
const REST = ['https://data-api.binance.vision', 'https://api.binance.com'];

const prices = new Map(); // coin -> { price, open, high, low, volume, change }
const listeners = new Set();
let coins = [];
let ws = null;
let hostIdx = 0;
let retry = 0;
let reconnectTimer = null;
let hiddenTimer = null;
let pending = false;
let connected = false;

export const sym = (c) => `${c}USDT`;
export const getPrice = (c) => prices.get(c)?.price;
export const getTicker = (c) => prices.get(c);
export const isLive = () => connected;

function emit() {
  if (pending) return;
  pending = true;
  // Batch many ticks into one UI update per frame.
  requestAnimationFrame(() => { pending = false; listeners.forEach((fn) => fn(prices)); });
}

export function subscribe(fn) {
  listeners.add(fn);
  if (prices.size) fn(prices);
  return () => listeners.delete(fn);
}

function setTicker(c, t) {
  const open = Number(t.o);
  const last = Number(t.c);
  prices.set(c, { price: last, open, high: Number(t.h), low: Number(t.l), volume: Number(t.q), change: open ? ((last - open) / open) * 100 : 0 });
}

export async function restFetch(path) {
  let lastErr;
  for (const base of REST) {
    try {
      const r = await fetch(base + path);
      if (r.ok) return await r.json();
      lastErr = new Error(`Binance ${r.status}`);
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

async function snapshot(list) {
  // Ask per symbol batch; an unknown symbol would fail the whole batch, so fall back one by one.
  try {
    const data = await restFetch(`/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(list.map(sym)))}`);
    data.forEach((t) => setTicker(t.symbol.replace(/USDT$/, ''), { o: t.openPrice, c: t.lastPrice, h: t.highPrice, l: t.lowPrice, q: t.quoteVolume }));
  } catch {
    await Promise.all(list.map(async (c) => {
      try {
        const t = await restFetch(`/api/v3/ticker/24hr?symbol=${sym(c)}`);
        setTicker(c, { o: t.openPrice, c: t.lastPrice, h: t.highPrice, l: t.lowPrice, q: t.quoteVolume });
      } catch { /* not listed on Binance */ }
    }));
  }
  emit();
}

function connect() {
  clearTimeout(reconnectTimer);
  if (!coins.length || document.hidden) return;
  const streams = coins.map((c) => `${sym(c).toLowerCase()}@miniTicker`).join('/');
  const sock = new WebSocket(`${HOSTS[hostIdx]}?streams=${streams}`);
  ws = sock;
  sock.onopen = () => { retry = 0; connected = true; emit(); };
  sock.onmessage = (ev) => {
    const { data } = JSON.parse(ev.data);
    if (data?.s) { setTicker(data.s.replace(/USDT$/, ''), data); emit(); }
  };
  sock.onclose = () => {
    if (sock.manual || ws !== sock) return; // replaced or closed on purpose
    ws = null;
    connected = false; emit();
    retry += 1;
    if (retry > 2) hostIdx = (hostIdx + 1) % HOSTS.length;
    reconnectTimer = setTimeout(connect, Math.min(30000, 1000 * 2 ** Math.min(retry, 5)));
  };
  sock.onerror = () => sock.close();
}

function disconnect() {
  clearTimeout(reconnectTimer);
  if (ws) { ws.manual = true; ws.close(); ws = null; }
  connected = false;
}

export function watch(list) {
  const next = [...new Set(list.map((c) => c.toUpperCase()))].sort();
  if (next.join() === coins.join()) return;
  coins = next;
  disconnect();
  snapshot(coins);
  connect();
}

// Save battery and data: drop the socket 30s after the app goes to the background.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenTimer = setTimeout(disconnect, 30000);
  } else {
    clearTimeout(hiddenTimer);
    if (!ws && coins.length) { snapshot(coins); connect(); }
  }
});
