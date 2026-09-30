'use strict';
/** Small admin UI building blocks (form fields, cards, charts). */
const { html, raw } = require('../../util/html');
const { icon } = require('../icons');
const { bnNum, bnCount } = require('../../util/bn');

function field(name, label, value = '', { type = 'text', attrs = '', hint = '', cls = '' } = {}) {
  if (type === 'textarea') {
    return html`<label class="field ${cls}"><span>${label}</span><textarea name="${name}" ${raw(attrs)}>${value}</textarea>${hint ? html`<small class="hint">${hint}</small>` : ''}</label>`;
  }
  return html`<label class="field ${cls}"><span>${label}</span><input type="${type}" name="${name}" value="${value === null || value === undefined ? '' : value}" ${raw(attrs)}>${hint ? html`<small class="hint">${hint}</small>` : ''}</label>`;
}
function select(name, label, options, value = '', { attrs = '', hint = '', cls = '' } = {}) {
  const opts = options.map((o) => (Array.isArray(o) ? o : [o, o]));
  return html`<label class="field ${cls}"><span>${label}</span><select name="${name}" ${raw(attrs)}>${opts.map(([v, t]) => html`<option value="${v}" ${raw(String(v) === String(value) ? 'selected' : '')}>${t}</option>`)}</select>${hint ? html`<small class="hint">${hint}</small>` : ''}</label>`;
}
function toggle(name, label, on, { hint = '', attrs = '' } = {}) {
  return html`<label class="tgl-row"><span><b>${label}</b>${hint ? html`<small>${hint}</small>` : ''}</span><input type="hidden" name="${name}" value="0"><input type="checkbox" class="tgl" name="${name}" value="1" ${raw(on ? 'checked' : '')} ${raw(attrs)}></label>`;
}
function fileField(name, label, current, { accept = 'image/*', hint = '', preview = true, removable = true } = {}) {
  const isImg = accept.startsWith('image');
  return html`<div class="field file-field"><span>${label}</span>
  <div class="ff-box">
    ${preview && isImg ? html`<div class="ff-prev" data-preview="${name}">${current ? html`<img src="${current}" alt="">` : raw(icon('image'))}</div>` : ''}
    ${!isImg && current ? html`<a class="ff-cur" href="${current}" target="_blank">${raw(icon('pdf'))}বর্তমান ফাইল</a>` : ''}
    <label class="btn btn-soft btn-sm">${raw(icon('download'))}${current ? 'পরিবর্তন' : 'আপলোড'}<input type="file" name="${name}" accept="${accept}" hidden data-file-preview="${name}"></label>
    ${current && removable ? html`<label class="check small"><input type="checkbox" name="remove_${name}" value="1"> মুছুন</label>` : ''}
  </div>${hint ? html`<small class="hint">${hint}</small>` : ''}</div>`;
}

function stat(label, value, { ic = 'file', color = '#16a34a', delta = '', deltaDown = false } = {}) {
  return html`<div class="stat" style="--c:${color}"><span class="stat-ic">${raw(icon(ic))}</span><div><small>${label}</small><b>${typeof value === 'number' ? bnCount(value) : value}</b>${delta ? html`<em class="${deltaDown ? 'down' : 'up'}">${raw(icon(deltaDown ? 'down' : 'next'))}${delta}</em>` : ''}</div></div>`;
}

function card(title, body, { actions = '', cls = '' } = {}) {
  return html`<section class="card ${cls}">${title ? html`<div class="card-h"><h2>${title}</h2>${actions}</div>` : ''}${body}</section>`;
}

/** Area/line chart as inline SVG. points: [{label, value}] */
function lineChart(points, { height = 190, color = '#16a34a', id = 'c' } = {}) {
  const w = 640; const h = height; const pad = { l: 34, r: 10, t: 12, b: 26 };
  if (!points.length) return html`<div class="chart-empty">এখনো কোনো ডেটা নেই</div>`;
  const max = Math.max(4, ...points.map((p) => p.value));
  const nice = niceMax(max);
  const x = (i) => pad.l + (points.length === 1 ? (w - pad.l - pad.r) / 2 : (i * (w - pad.l - pad.r)) / (points.length - 1));
  const y = (v) => pad.t + (h - pad.t - pad.b) * (1 - v / nice);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${h - pad.b} L${x(0).toFixed(1)},${h - pad.b} Z`;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const gy = pad.t + (h - pad.t - pad.b) * (1 - f);
    return `<line x1="${pad.l}" x2="${w - pad.r}" y1="${gy}" y2="${gy}" class="grid"/><text x="${pad.l - 6}" y="${gy + 4}" text-anchor="end" class="axis">${bnNum(Math.round(nice * f))}</text>`;
  }).join('');
  const step = Math.ceil(points.length / 8);
  const labels = points.map((p, i) => (i % step === 0 || i === points.length - 1 ? `<text x="${x(i)}" y="${h - 6}" text-anchor="middle" class="axis">${p.label}</text>` : '')).join('');
  const dots = points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3.2" class="dot"><title>${p.label}: ${bnCount(p.value)}</title></circle>`).join('');
  return raw(`<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="চার্ট" style="--c:${color}">
<defs><linearGradient id="g-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".32"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
${grid}<path d="${area}" fill="url(#g-${id})"/><path d="${line}" class="ln"/>${dots}${labels}</svg>`);
}
function niceMax(v) {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return v;
}
function bars(items, { color = '#16a34a' } = {}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  return html`<ul class="bars">${items.map((i) => html`<li><span class="b-l">${i.label}</span><span class="b-track"><i style="width:${((i.value / max) * 100).toFixed(1)}%;background:${i.color || color}"></i></span><span class="b-v">${bnNum(Math.round((i.value / total) * 100))}%</span></li>`)}</ul>`;
}

function pager(base, page, total, perPage, qs = '') {
  const pages = Math.ceil(total / perPage);
  if (pages <= 1) return '';
  const u = (n) => `${base}?${[qs, `page=${n}`].filter(Boolean).join('&')}`;
  return html`<nav class="a-pager">${page > 1 ? html`<a class="btn btn-soft btn-sm" href="${u(page - 1)}">${raw(icon('left'))}</a>` : ''}<span>${bnNum(page)} / ${bnNum(pages)}</span>${page < pages ? html`<a class="btn btn-soft btn-sm" href="${u(page + 1)}">${raw(icon('right'))}</a>` : ''}</nav>`;
}

function empty(text, ic = 'file') { return html`<div class="a-empty">${raw(icon(ic))}<p>${text}</p></div>`; }
function badge(text, kind = 'gray') { return html`<span class="badge b-${kind}">${text}</span>`; }

module.exports = { field, select, toggle, fileField, stat, card, lineChart, bars, pager, empty, badge, icon, raw, html };
