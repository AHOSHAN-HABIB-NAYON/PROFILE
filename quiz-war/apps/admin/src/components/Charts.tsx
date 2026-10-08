import { useState } from 'react';

const W = 640;
const H = 220;
const PAD = { l: 36, r: 12, t: 10, b: 24 };

function niceMax(v: number) {
  if (v <= 5) return 5;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / p) * p;
}

/** Single-series area/line chart (title names the series; hover crosshair + tooltip). */
export function LineChart({ data, label }: { data: { x: string; y: number }[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(1, ...data.map((d) => d.y)));
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (data.length <= 1 ? 0 : (i / (data.length - 1)) * iw);
  const y = (v: number) => PAD.t + ih - (v / max) * ih;
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.y)}`).join('');
  const area = `${line}L${x(data.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`${label}, last ${data.length} days`}>
        {[0, 0.5, 1].map((t) => (
          <g key={t} className="axis">
            <line className="gridline" x1={PAD.l} x2={W - PAD.r} y1={y(max * t)} y2={y(max * t)} />
            <text x={PAD.l - 6} y={y(max * t) + 4} textAnchor="end">{Math.round(max * t)}</text>
          </g>
        ))}
        <path d={area} fill="var(--series-1)" opacity={0.12} />
        <path d={line} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" />
        {data.map((d, i) => (i % 2 === 0 || i === data.length - 1) && (
          <text key={i} className="axis" x={x(i)} y={H - 6} textAnchor="middle" style={{ fill: 'var(--text-3)', fontSize: 11 }}>{d.x.slice(5)}</text>
        ))}
        {hover !== null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + ih} stroke="var(--text-3)" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(data[hover].y)} r={5} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
          </>
        )}
        {data.map((_, i) => (
          <rect key={i} x={x(i) - iw / data.length / 2} y={PAD.t} width={iw / data.length} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
        ))}
      </svg>
      {hover !== null && (
        <div className="tooltip" style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(data[hover].y) / H) * 100}%` }}>
          <b>{data[hover].y.toLocaleString()}</b> {label.toLowerCase()} · {data[hover].x}
        </div>
      )}
    </div>
  );
}

/** Two-series stacked columns with a 2px surface gap between segments, legend + tooltip. */
export function StackedBars({ data, series }: { data: { x: string; a: number; b: number }[]; series: [string, string] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(1, ...data.map((d) => d.a + d.b)));
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const bw = Math.min(28, (iw / data.length) * 0.6);
  const cx = (i: number) => PAD.l + (i + 0.5) * (iw / data.length);
  const h = (v: number) => (v / max) * ih;
  return (
    <div style={{ position: 'relative' }}>
      <div className="legend"><span><i style={{ background: 'var(--series-1)' }} />{series[0]}</span><span><i style={{ background: 'var(--series-2)' }} />{series[1]}</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`${series[0]} and ${series[1]} per day`}>
        {[0, 0.5, 1].map((t) => (
          <g key={t} className="axis">
            <line className="gridline" x1={PAD.l} x2={W - PAD.r} y1={PAD.t + ih - h(max * t)} y2={PAD.t + ih - h(max * t)} />
            <text x={PAD.l - 6} y={PAD.t + ih - h(max * t) + 4} textAnchor="end">{Math.round(max * t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const ha = h(d.a);
          const hb = h(d.b);
          const base = PAD.t + ih;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} opacity={hover === null || hover === i ? 1 : 0.55}>
              <rect x={cx(i) - (iw / data.length) / 2} y={PAD.t} width={iw / data.length} height={ih} fill="transparent" />
              {ha > 0 && <rect x={cx(i) - bw / 2} y={base - ha} width={bw} height={ha} rx={ha > 4 ? 3 : 0} fill="var(--series-1)" />}
              {hb > 0 && <rect x={cx(i) - bw / 2} y={base - ha - hb - (ha > 0 ? 2 : 0)} width={bw} height={hb} rx={hb > 4 ? 3 : 0} fill="var(--series-2)" />}
              {(i % 2 === 0 || i === data.length - 1) && <text x={cx(i)} y={H - 6} textAnchor="middle" style={{ fill: 'var(--text-3)', fontSize: 11 }}>{d.x.slice(5)}</text>}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="tooltip" style={{ left: `${(cx(hover) / W) * 100}%`, top: `${((PAD.t + ih - h(data[hover].a + data[hover].b)) / H) * 100}%` }}>
          <div><b>{data[hover].x}</b></div>
          <div><span className="dot" style={{ background: 'var(--series-1)' }} /> {series[0]}: {data[hover].a}</div>
          <div><span className="dot" style={{ background: 'var(--series-2)' }} /> {series[1]}: {data[hover].b}</div>
        </div>
      )}
    </div>
  );
}

/** Horizontal ranked bars (single series, values labelled in text ink). */
export function HBars({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div role="list" style={{ display: 'grid', gap: 8 }}>
      {data.map((d) => (
        <div key={d.label} role="listitem" title={`${d.label}: ${d.value}`} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 44px', alignItems: 'center', gap: 8 }}>
          <span className="small ellipsis" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</span>
          <span style={{ height: 12, background: 'var(--surface-2)', borderRadius: 4 }}>
            <span style={{ display: 'block', height: '100%', width: `${(d.value / max) * 100}%`, background: 'var(--series-1)', borderRadius: '0 4px 4px 0' }} />
          </span>
          <b className="small" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{d.value}</b>
        </div>
      ))}
    </div>
  );
}
