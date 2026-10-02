/* animations.js — progress bar, toasts, sheets, fly-to-cart, courier animation, countdowns. GPU-friendly (transform/opacity). */
(function () {
  'use strict';
  const App = window.App;
  const bar = document.getElementById('progress');
  const fill = bar ? bar.querySelector('span') : null;
  let trickle = null;
  let value = 0;

  const progress = {
    start() {
      if (!fill) return;
      clearInterval(trickle);
      value = 0.08;
      bar.classList.add('active');
      fill.style.transition = 'none';
      fill.style.transform = 'scaleX(0)';
      void fill.offsetWidth;
      fill.style.transition = '';
      fill.style.transform = 'scaleX(' + value + ')';
      trickle = setInterval(() => {
        value += (0.9 - value) * 0.12;
        fill.style.transform = 'scaleX(' + value + ')';
      }, 180);
    },
    done() {
      if (!fill) return;
      clearInterval(trickle);
      fill.style.transform = 'scaleX(1)';
      setTimeout(() => bar.classList.remove('active'), 220);
    },
  };

  const toastWrap = document.querySelector('[data-toasts]');
  function toast(message, type, opts) {
    if (!toastWrap || !message) return;
    type = type || 'success';
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    const icon = { success: 'check-circle', error: 'exclamation-circle', info: 'info-circle' }[type] || 'info-circle';
    el.innerHTML = '<i class="fa fa-' + icon + '" aria-hidden="true"></i><span></span>';
    el.querySelector('span').textContent = message;
    if (opts && opts.action) {
      const a = document.createElement('a');
      a.href = opts.action.href; a.textContent = opts.action.text;
      el.appendChild(a);
    }
    toastWrap.appendChild(el);
    while (toastWrap.children.length > 3) toastWrap.firstElementChild.remove();
    setTimeout(() => { el.classList.add('out'); el.addEventListener('animationend', () => el.remove(), { once: true }); }, (opts && opts.duration) || 2600);
  }

  let lastFocus = null;
  function openSheet(name) {
    const sheet = document.querySelector('[data-sheet="' + name + '"]');
    if (!sheet) return;
    lastFocus = document.activeElement;
    sheet.hidden = false;
    sheet.classList.remove('closing');
    const first = sheet.querySelector('a,button:not([hidden])');
    if (first) first.focus({ preventScroll: true });
  }
  function closeSheet(sheet) {
    sheet = sheet || document.querySelector('.sheet:not([hidden])');
    if (!sheet || sheet.hidden) return;
    sheet.classList.add('closing');
    setTimeout(() => { sheet.hidden = true; sheet.classList.remove('closing'); }, 200);
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  }

  function flyToCart(fromEl) {
    const target = [...document.querySelectorAll('.cart-btn, .bn-cart')].find((el) => el.offsetParent !== null);
    if (!fromEl || !target || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const a = fromEl.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const dot = document.createElement('div');
    dot.className = 'fly-dot';
    dot.style.left = a.left + a.width / 2 - 7 + 'px';
    dot.style.top = a.top + a.height / 2 - 7 + 'px';
    document.body.appendChild(dot);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    dot.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: 'translate(' + dx * 0.5 + 'px,' + (dy * 0.5 - 60) + 'px) scale(1.1)', opacity: 1, offset: 0.5 },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.4)', opacity: 0.2 },
    ], { duration: 650, easing: 'cubic-bezier(.4,.1,.3,1)' }).onfinish = () => dot.remove();
  }

  /** Lightweight CSS 3D delivery van crossing right → left. Resolves when the drive finishes. */
  function courier(text) {
    const el = document.createElement('div');
    el.className = 'courier-overlay';
    el.setAttribute('role', 'status');
    el.innerHTML = '<div class="courier-stage"><div class="courier-road"><div class="van">' +
      '<div class="speed-lines"><span></span><span></span></div><div class="van-shadow"></div>' +
      '<div class="van-cab"></div><div class="van-body"><i class="fa fa-shopping-bag"></i></div>' +
      '<span class="wheel w1"></span><span class="wheel w2"></span></div></div><p class="courier-text"></p></div>';
    el.querySelector('.courier-text').textContent = text || 'আপনার অর্ডার প্রসেস হচ্ছে…';
    document.body.appendChild(el);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return {
      el,
      done: new Promise((r) => setTimeout(r, reduce ? 300 : 1900)),
      remove() { el.style.transition = 'opacity .2s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 200); },
    };
  }

  function countdowns(root, signal) {
    const els = root.querySelectorAll('[data-countdown]');
    if (!els.length) return;
    const tick = () => {
      const now = Date.now() / 1000;
      els.forEach((el) => {
        let s = Math.max(0, Math.floor(Number(el.dataset.countdown) - now));
        const d = Math.floor(s / 86400); s %= 86400;
        const h = Math.floor(s / 3600); s %= 3600;
        const m = Math.floor(s / 60); s %= 60;
        const pad = (n) => App.bn(String(n).padStart(2, '0'));
        el.innerHTML = (d ? '<b>' + App.bn(d) + 'দি</b>' : '') + '<b>' + pad(h) + '</b>:<b>' + pad(m) + '</b>:<b>' + pad(s) + '</b>';
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    signal.addEventListener('abort', () => clearInterval(id));
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const t = document.createElement('textarea');
      t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
    }
    toast('কপি করা হয়েছে', 'success', { duration: 1500 });
  }

  App.ui = { progress, toast, openSheet, closeSheet, flyToCart, courier, countdowns, copy };
})();
