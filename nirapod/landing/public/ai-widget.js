// Optional AI-only help chat on the landing page (admin switch landing_ai_chat_enabled). No account data, nothing saved.
(() => {
  'use strict';
  const lang = () => (document.documentElement.lang === 'bn' ? 'bn' : 'en');
  const TXT = {
    en: { open: 'Questions? Ask Nirapod Assistant', title: 'Nirapod Assistant (AI)', hint: 'Ask about features, plans or setup', send: 'Send', note: 'AI answers from our help articles. For your account, use Live chat in the app. Never share passwords.', err: 'Sorry, the assistant is not available right now.' },
    bn: { open: 'প্রশ্ন আছে? Nirapod Assistant-কে জিজ্ঞেস করুন', title: 'Nirapod Assistant (AI)', hint: 'ফিচার, প্ল্যান বা সেটআপ নিয়ে জিজ্ঞেস করুন', send: 'পাঠান', note: 'AI আমাদের সাহায্য লেখা থেকে উত্তর দেয়। অ্যাকাউন্টের জন্য অ্যাপের লাইভ চ্যাট ব্যবহার করুন। পাসওয়ার্ড দেবেন না।', err: 'দুঃখিত, এখন সহকারী পাওয়া যাচ্ছে না।' },
  };
  const el = (t, c, text) => { const e = document.createElement(t); if (c) e.className = c; if (text != null) e.textContent = text; return e; };
  fetch('/api/v1/app-config').then((r) => (r.ok ? r.json() : null)).then((cfg) => { if (cfg?.landing_ai_chat_enabled) mount(); }).catch(() => {});

  function mount() {
    const history = [];
    const fab = el('button', 'aiw-fab');
    fab.type = 'button';
    fab.setAttribute('aria-label', TXT[lang()].open);
    fab.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5a2.5 2.5 0 0 1-2.5 2.5H9l-5 4V6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5z"/></svg>';
    const panel = el('section', 'aiw-panel');
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    const head = el('header', 'aiw-head');
    const title = el('b');
    const close = el('button', 'aiw-x', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    head.append(title, close);
    const log = el('div', 'aiw-log');
    log.setAttribute('aria-live', 'polite');
    const note = el('p', 'aiw-note');
    const form = el('form', 'aiw-form');
    const input = el('input');
    input.maxLength = 800;
    const send = el('button', 'aiw-send');
    send.type = 'submit';
    form.append(input, send);
    panel.append(head, log, note, form);
    document.body.append(fab, panel);
    const texts = () => {
      const t = TXT[lang()];
      title.textContent = t.title; note.textContent = t.note; input.placeholder = t.hint; send.textContent = t.send; fab.setAttribute('aria-label', t.open);
    };
    const add = (from, text) => { const m = el('div', `aiw-m ${from}`, text); log.append(m); log.scrollTop = log.scrollHeight; return m; };
    fab.addEventListener('click', () => { texts(); panel.hidden = !panel.hidden; if (!panel.hidden) input.focus(); });
    close.addEventListener('click', () => { panel.hidden = true; fab.focus(); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const message = input.value.trim();
      if (!message) return;
      input.value = '';
      add('user', message);
      const wait = add('ai typing', '…');
      send.disabled = true;
      try {
        const r = await fetch('/api/v1/public/assistant', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message, language: lang(), history: history.slice(-8) }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error();
        wait.className = 'aiw-m ai';
        wait.textContent = j.reply;
        history.push({ from: 'user', text: message }, { from: 'ai', text: j.reply });
      } catch {
        wait.className = 'aiw-m ai err';
        wait.textContent = TXT[lang()].err;
      } finally {
        send.disabled = false;
      }
    });
  }
})();
