'use client';
import { useState } from 'react';

const COLORS = [
  '#f7931a',
  '#627eea',
  '#14f195',
  '#f3ba2f',
  '#e84142',
  '#2a5ada',
  '#8247e5',
  '#26a17b',
  '#c2a633',
  '#ff007a',
];

/** Coin logo with a deterministic, colour-coded monogram fallback (logos come from provider metadata). */
export function CoinIcon({ symbol, url, size = 32 }: { symbol: string; url?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        className="rounded-full shrink-0 bg-card-2"
        style={{ width: size, height: size }}
      />
    );
  }
  let h = 0;
  for (const c of symbol) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <div
      className="rounded-full shrink-0 flex items-center justify-center text-white font-bold"
      style={{ width: size, height: size, background: COLORS[h % COLORS.length], fontSize: size * 0.36 }}
    >
      {symbol.slice(0, 3)}
    </div>
  );
}
