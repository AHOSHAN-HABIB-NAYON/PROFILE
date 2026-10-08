/*!
 * charts.js — dependency-free SVG charts (area & bar) with tooltips.
 * Reads data from <div data-chart="area|bar" data-key="sales"><script type="application/json">[…]</script></div>
 */
(function (App) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';

  function el(name, attrs, parent) {
    var n = document.createElementNS(NS, name);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(n);
    return n;
  }
  function fmt(v, money) {
    var s = Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
    return money ? '৳' + s : s;
  }
  function short(v, money) {
    var n = Number(v), s = n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + 'k' : String(Math.round(n));
    return money ? '৳' + s : s;
  }
  function label(d) {
    var dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  function render(box) {
    var data = [];
    try { data = JSON.parse(box.querySelector('script').textContent); } catch (e) { data = []; }
    var key = box.getAttribute('data-key'), type = box.getAttribute('data-chart'), money = box.hasAttribute('data-money');
    App.$$('svg, .chart-tip, .chart-empty', box).forEach(function (n) { n.remove(); });
    var values = data.map(function (d) { return Number(d[key]) || 0; });
    if (!values.length || values.every(function (v) { return v === 0; })) {
      var empty = document.createElement('p'); empty.className = 'chart-empty muted small'; empty.textContent = 'No data for this period yet.';
      box.appendChild(empty);
      return;
    }
    var W = Math.max(280, box.clientWidth), H = 220, pad = { l: 46, r: 12, t: 14, b: 28 };
    // "Nice" axis: 4 steps of 1/2/5×10^n so counts never show fractional ticks.
    var rawStep = Math.max(1, Math.max.apply(null, values) * 1.1 / 4);
    var mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    var niceStep = [1, 2, 5, 10].map(function (m) { return m * mag; }).filter(function (s) { return s >= rawStep; })[0];
    var max = niceStep * 4;
    var iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    var x = function (i) { return pad.l + (values.length === 1 ? iw / 2 : i * iw / (values.length - 1)); };
    var y = function (v) { return pad.t + ih - v / max * ih; };
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', height: H, role: 'img', 'aria-label': key + ' chart' }, box);
    var defs = el('defs', {}, svg);
    var gid = 'g' + Math.random().toString(36).slice(2, 8);
    var grad = el('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el('stop', { offset: '0', 'stop-color': 'var(--primary)', 'stop-opacity': '.35' }, grad);
    el('stop', { offset: '1', 'stop-color': 'var(--primary)', 'stop-opacity': '0' }, grad);

    for (var g = 0; g <= 4; g++) {
      var gv = max / 4 * g, gy = y(gv);
      el('line', { x1: pad.l, x2: W - pad.r, y1: gy, y2: gy, class: 'chart-grid' }, svg);
      el('text', { x: pad.l - 8, y: gy + 4, 'text-anchor': 'end', class: 'chart-axis' }, svg).textContent = short(gv, money);
    }
    var step = Math.ceil(values.length / Math.max(2, Math.floor(iw / 70)));
    data.forEach(function (d, i) {
      if (i % step === 0 || i === data.length - 1) el('text', { x: x(i), y: H - 8, 'text-anchor': 'middle', class: 'chart-axis' }, svg).textContent = label(d.date);
    });

    if (type === 'bar') {
      var bw = Math.max(4, Math.min(28, iw / values.length * 0.6));
      values.forEach(function (v, i) {
        el('rect', { x: x(i) - bw / 2, y: y(v), width: bw, height: Math.max(0, pad.t + ih - y(v)), rx: Math.min(6, bw / 2), class: 'chart-bar' }, svg);
      });
    } else {
      var line = values.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).join(' ');
      el('path', { d: line + ' L' + x(values.length - 1) + ' ' + (pad.t + ih) + ' L' + x(0) + ' ' + (pad.t + ih) + ' Z', fill: 'url(#' + gid + ')' }, svg);
      el('path', { d: line, class: 'chart-line' }, svg);
    }

    var tip = document.createElement('div');
    tip.className = 'chart-tip'; tip.hidden = true;
    box.appendChild(tip);
    var dot = el('circle', { r: 5, class: 'chart-dot', visibility: 'hidden' }, svg);
    function show(clientX) {
      var rect = svg.getBoundingClientRect();
      var px = (clientX - rect.left) * (W / rect.width);
      var i = Math.max(0, Math.min(values.length - 1, Math.round((px - pad.l) / (iw / Math.max(1, values.length - 1)))));
      dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(values[i])); dot.setAttribute('visibility', 'visible');
      tip.hidden = false;
      tip.textContent = label(data[i].date) + ' · ' + fmt(values[i], money);
      tip.style.left = Math.min(rect.width - 120, Math.max(0, x(i) * rect.width / W - 50)) + 'px';
    }
    svg.addEventListener('pointermove', function (e) { show(e.clientX); });
    svg.addEventListener('pointerdown', function (e) { show(e.clientX); });
    svg.addEventListener('pointerleave', function () { tip.hidden = true; dot.setAttribute('visibility', 'hidden'); });
  }

  function mount(root) {
    var boxes = App.$$('[data-chart]', root);
    boxes.forEach(render);
    if (!('ResizeObserver' in window)) return null;
    var widths = new Map();
    var ro = new ResizeObserver(App.debounce(function (entries) {
      entries.forEach(function (en) {
        var w = Math.round(en.contentRect.width);
        if (widths.get(en.target) !== w) { widths.set(en.target, w); render(en.target); }
      });
    }, 150));
    boxes.forEach(function (b) { widths.set(b, b.clientWidth); ro.observe(b); });
    return function () { ro.disconnect(); };
  }

  App.page('dashboard', { mount: mount });
  App.page('analytics', { mount: mount });
})(window.App);
