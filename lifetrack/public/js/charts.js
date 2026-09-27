/* Tiny dependency-free SVG charts: animated area/line, grouped bars, donut, sparkline — with touch tooltips. */
import { esc, money, num, reduceMotion } from './core.js';

const niceMax = (v) => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; };
const compact = (v) => { const a = Math.abs(v); if (a >= 1e7) return (v / 1e7).toFixed(1).replace(/\.0$/, '') + 'Cr'; if (a >= 1e5) return (v / 1e5).toFixed(1).replace(/\.0$/, '') + 'L'; if (a >= 1e3) return (v / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k'; return String(Math.round(v)); };

function smoothPath(pts) {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]; const p1 = pts[i]; const p2 = pts[i + 1]; const p3 = pts[i + 2] || p2;
    const t = 0.18;
    const c1 = [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t];
    const c2 = [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

function attachTooltip(wrap, svg, xs, labels, series, fmt, pad) {
  const tip = document.createElement('div'); tip.className = 'tip'; wrap.appendChild(tip);
  const cursor = svg.querySelector('.cursor');
  const move = (clientX) => {
    const r = svg.getBoundingClientRect(); const vb = svg.viewBox.baseVal; const x = ((clientX - r.left) / r.width) * vb.width;
    let i = 0; let best = Infinity; xs.forEach((px, j) => { const d = Math.abs(px - x); if (d < best) { best = d; i = j; } });
    const px = (xs[i] / vb.width) * r.width;
    tip.innerHTML = `<div style="font-weight:700;margin-bottom:3px">${esc(labels[i])}</div>` + series.map((s) => `<div style="display:flex;align-items:center;gap:6px"><i style="width:7px;height:7px;border-radius:2px;background:${s.color}"></i>${esc(s.name)} <b style="margin-left:auto;padding-left:8px">${esc(fmt(s.values[i]))}</b></div>`).join('');
    tip.style.left = Math.min(Math.max(px, 70), r.width - 70) + 'px'; tip.style.top = pad.t + 'px'; tip.classList.add('show');
    if (cursor) { cursor.setAttribute('x1', xs[i]); cursor.setAttribute('x2', xs[i]); cursor.classList.add('show'); }
  };
  const hide = () => { tip.classList.remove('show'); cursor?.classList.remove('show'); };
  svg.addEventListener('pointermove', (e) => move(e.clientX));
  svg.addEventListener('pointerdown', (e) => move(e.clientX));
  svg.addEventListener('pointerleave', hide);
}

/** Area/line chart. series: [{name, color, values[]}] */
export function lineChart(container, { labels, series, height = 180, fmt = (v) => money(v), area = true, yTicks = 4 }) {
  const W = Math.max(280, container.clientWidth || 320); const H = height;
  const pad = { l: 34, r: 8, t: 12, b: 22 };
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values.map((v) => Math.max(0, v)))));
  const min = Math.min(0, ...series.flatMap((s) => s.values));
  const lo = min < 0 ? -niceMax(-min) : 0;
  const xs = labels.map((_, i) => pad.l + (labels.length === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (labels.length - 1)));
  const y = (v) => pad.t + (1 - (v - lo) / (max - lo)) * (H - pad.t - pad.b);
  let g = '<g class="grid">';
  for (let i = 0; i <= yTicks; i++) { const v = lo + ((max - lo) * i) / yTicks; g += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/>`; }
  g += '</g><g class="axis">';
  for (let i = 0; i <= yTicks; i++) { const v = lo + ((max - lo) * i) / yTicks; g += `<text x="${pad.l - 6}" y="${y(v) + 3}" text-anchor="end">${compact(v)}</text>`; }
  const step = Math.ceil(labels.length / Math.max(2, Math.floor(W / 64)));
  labels.forEach((l, i) => { if (i % step === 0 || i === labels.length - 1) g += `<text x="${xs[i]}" y="${H - 5}" text-anchor="middle">${esc(l)}</text>`; });
  g += '</g>';
  let defs = '<defs>'; let paths = '';
  series.forEach((s, k) => {
    const pts = s.values.map((v, i) => [xs[i], y(v)]);
    const d = smoothPath(pts);
    const id = `ga${k}${Math.random().toString(36).slice(2, 7)}`;
    defs += `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity=".26"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient>`;
    if (area) paths += `<path class="area" d="${d} L${xs[xs.length - 1]},${y(lo)} L${xs[0]},${y(lo)} Z" fill="url(#${id})"/>`;
    paths += `<path class="ln ${reduceMotion() ? '' : 'draw'}" d="${d}" stroke="${s.color}"/>`;
    const last = pts[pts.length - 1];
    if (last) paths += `<circle cx="${last[0]}" cy="${last[1]}" r="3.6" fill="var(--surface)" stroke="${s.color}" stroke-width="2.2"/>`;
  });
  defs += '</defs>';
  container.classList.add('chart'); container.style.height = H + 'px';
  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">${defs}${g}<line class="cursor" y1="${pad.t}" y2="${H - pad.b}"/>${paths}</svg>`;
  const svg = container.querySelector('svg');
  svg.querySelectorAll('.ln.draw').forEach((p) => { const len = p.getTotalLength(); p.style.setProperty('--len', len); });
  attachTooltip(container, svg, xs, labels, series, fmt, pad);
}

/** Grouped bar chart */
export function barChart(container, { labels, series, height = 180, fmt = (v) => money(v) }) {
  const W = Math.max(280, container.clientWidth || 320); const H = height;
  const pad = { l: 34, r: 6, t: 12, b: 22 };
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const y = (v) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const band = (W - pad.l - pad.r) / labels.length; const bw = Math.min(14, (band * 0.7) / series.length);
  let g = '<g class="grid">';
  for (let i = 0; i <= 4; i++) g += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y((max * i) / 4)}" y2="${y((max * i) / 4)}"/>`;
  g += '</g><g class="axis">';
  for (let i = 0; i <= 4; i++) g += `<text x="${pad.l - 6}" y="${y((max * i) / 4) + 3}" text-anchor="end">${compact((max * i) / 4)}</text>`;
  const step = Math.ceil(labels.length / Math.max(2, Math.floor(W / 56)));
  const xs = labels.map((_, i) => pad.l + band * i + band / 2);
  labels.forEach((l, i) => { if (i % step === 0) g += `<text x="${xs[i]}" y="${H - 5}" text-anchor="middle">${esc(l)}</text>`; });
  g += '</g>';
  let bars = '';
  labels.forEach((_, i) => series.forEach((s, k) => {
    const v = Math.max(0, s.values[i] || 0); const x = xs[i] - (bw * series.length) / 2 + k * bw + 1; const h = y(0) - y(v);
    bars += `<rect class="bar" style="animation-delay:${i * 30}ms" x="${x.toFixed(1)}" y="${y(v).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${Math.max(h, v ? 2 : 0).toFixed(1)}" rx="${Math.min(4, bw / 2)}" fill="${s.color}"/>`;
  }));
  container.classList.add('chart'); container.style.height = H + 'px';
  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${g}<line class="cursor" y1="${pad.t}" y2="${H - pad.b}"/>${bars}</svg>`;
  attachTooltip(container, container.querySelector('svg'), xs, labels, series, fmt, pad);
}

/** Donut with animated segments */
export function donut(container, { segments, centerTop, centerSub, size = 132 }) {
  const r = (size - 18) / 2; const c = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let acc = 0; let circles = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="16"/>`;
  segments.forEach((s) => {
    const len = (s.value / total) * c; const gap = segments.length > 1 ? Math.min(3, len / 3) : 0;
    circles += `<circle class="seg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${s.color}" stroke-dasharray="0 ${c}" data-d="${Math.max(0, len - gap)} ${c}" stroke-dashoffset="${-acc}"><title>${esc(s.label)}</title></circle>`;
    acc += len;
  });
  container.classList.add('donut'); container.style.width = container.style.height = size + 'px';
  container.innerHTML = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${circles}</svg><div class="center"><div><b>${esc(centerTop)}</b><small>${esc(centerSub || '')}</small></div></div>`;
  requestAnimationFrame(() => requestAnimationFrame(() => container.querySelectorAll('.seg').forEach((x) => x.setAttribute('stroke-dasharray', x.dataset.d))));
}

export function sparkline(values, color = 'var(--primary)') {
  if (!values || values.length < 2) return '';
  const W = 60; const H = 22; const max = Math.max(...values, 1); const min = Math.min(...values, 0);
  const pts = values.map((v, i) => [(i * W) / (values.length - 1), H - 2 - ((v - min) / (max - min || 1)) * (H - 4)]);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${smoothPath(pts)}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/></svg>`;
}

export const PALETTE = ['#2F62F0', '#0EA5A0', '#F59E0B', '#EC4899', '#8B5CF6', '#EF4444', '#14B8A6', '#84CC16', '#F97316', '#64748B'];
export { compact, num };
