/**
 * Technical indicators for chart display. These operate on display floats (chart rendering only);
 * they are never used for balances, fills or any financial settlement.
 */
export interface OHLCV {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
export interface Point {
  time: number;
  value: number;
}

export function sma(data: OHLCV[], period: number): Point[] {
  const out: Point[] = [];
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i]!.close;
    if (i >= period) sum -= data[i - period]!.close;
    if (i >= period - 1) out.push({ time: data[i]!.time, value: sum / period });
  }
  return out;
}

export function emaValues(values: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const out: (number | null)[] = [];
  let prev: number | null = null;
  let seed = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (prev === null) {
      seed += v;
      if (i === period - 1) {
        prev = seed / period;
        out.push(prev);
      } else out.push(null);
    } else {
      prev = v * k + prev * (1 - k);
      out.push(prev);
    }
  }
  return out;
}

export function ema(data: OHLCV[], period: number): Point[] {
  const vals = emaValues(
    data.map((d) => d.close),
    period,
  );
  const out: Point[] = [];
  vals.forEach((v, i) => v !== null && out.push({ time: data[i]!.time, value: v }));
  return out;
}

/** Wilder's RSI. */
export function rsi(data: OHLCV[], period = 14): Point[] {
  const out: Point[] = [];
  if (data.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = data[i]!.close - data[i - 1]!.close;
    if (ch >= 0) gain += ch;
    else loss -= ch;
  }
  let avgG = gain / period;
  let avgL = loss / period;
  const val = () => (avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL));
  out.push({ time: data[period]!.time, value: val() });
  for (let i = period + 1; i < data.length; i++) {
    const ch = data[i]!.close - data[i - 1]!.close;
    avgG = (avgG * (period - 1) + Math.max(ch, 0)) / period;
    avgL = (avgL * (period - 1) + Math.max(-ch, 0)) / period;
    out.push({ time: data[i]!.time, value: val() });
  }
  return out;
}

export function macd(
  data: OHLCV[],
  fast = 12,
  slow = 26,
  signal = 9,
): { macd: Point[]; signal: Point[]; histogram: Point[] } {
  const closes = data.map((d) => d.close);
  const f = emaValues(closes, fast);
  const s = emaValues(closes, slow);
  const line: { time: number; value: number }[] = [];
  for (let i = 0; i < data.length; i++) {
    const a = f[i];
    const b = s[i];
    if (a != null && b != null) line.push({ time: data[i]!.time, value: a - b });
  }
  const sig = emaValues(
    line.map((p) => p.value),
    signal,
  );
  const sigPts: Point[] = [];
  const hist: Point[] = [];
  line.forEach((p, i) => {
    const v = sig[i];
    if (v != null) {
      sigPts.push({ time: p.time, value: v });
      hist.push({ time: p.time, value: p.value - v });
    }
  });
  return { macd: line, signal: sigPts, histogram: hist };
}

export function bollinger(
  data: OHLCV[],
  period = 20,
  mult = 2,
): { upper: Point[]; middle: Point[]; lower: Point[] } {
  const upper: Point[] = [];
  const middle: Point[] = [];
  const lower: Point[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j]!.close;
    const mean = sum / period;
    let v = 0;
    for (let j = i - period + 1; j <= i; j++) v += (data[j]!.close - mean) ** 2;
    const sd = Math.sqrt(v / period);
    const t = data[i]!.time;
    upper.push({ time: t, value: mean + mult * sd });
    middle.push({ time: t, value: mean });
    lower.push({ time: t, value: mean - mult * sd });
  }
  return { upper, middle, lower };
}

/** Session VWAP, resetting at each UTC day boundary (time in seconds). */
export function vwap(data: OHLCV[]): Point[] {
  const out: Point[] = [];
  let day = -1;
  let pv = 0;
  let vol = 0;
  for (const d of data) {
    const dDay = Math.floor(d.time / 86400);
    if (dDay !== day) {
      day = dDay;
      pv = 0;
      vol = 0;
    }
    const tp = (d.high + d.low + d.close) / 3;
    pv += tp * d.volume;
    vol += d.volume;
    out.push({ time: d.time, value: vol === 0 ? tp : pv / vol });
  }
  return out;
}
