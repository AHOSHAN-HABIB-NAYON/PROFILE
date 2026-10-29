// Landing page: EN/BN toggle, light/dark, and live content from the API (plans, changelog, settings).
(() => {
  const BN = {
    nav_features: 'সুবিধা', nav_premium: 'প্রিমিয়াম', nav_updates: 'আপডেট', eyebrow: 'লাইভ ফ্যামিলি লোকেটর',
    hero_title: 'প্রতিদিন জানুন আপনার পরিবার নিরাপদ।',
    hero_lead: 'পরিবার কোথায় আছে দেখুন, বাসা বা স্কুলে পৌঁছালে জানুন, আর SOS সতর্কতা পান সাথে সাথে। কিছুই লুকানো নয়: শেয়ারিং চালু থাকলে সবাই সবসময় জানে।',
    get_it: 'ডাউনলোড করুন', see_plans: 'প্ল্যান দেখুন',
    trust_1: 'SOS ও লাইভ ম্যাপ সবসময় ফ্রি', trust_2: 'বিজ্ঞাপন নেই, তথ্য বিক্রি নেই', trust_3: 'বাংলাসহ ৮টি ভাষা',
    features_title: 'পরিবারকে নিরাপদ রাখতে যা যা দরকার',
    f1_t: 'লাইভ লোকেশন', f1_b: 'স্যাটেলাইট ম্যাপে পরিবারকে দেখুন, সাথে ব্যাটারি ও শেষ আপডেট। পুরনো অবস্থান কখনো লাইভ হিসেবে দেখানো হয় না।',
    f2_t: 'পৌঁছানো ও বেরোনোর খবর', f2_b: 'বাসা, স্কুল বা কোচিং যোগ করুন। সন্তান পৌঁছালে বা বেরোলে জানতে পারবেন।',
    f3_t: 'এক চাপে SOS', f3_b: 'বড় লাল বাটন বা ফোন ঝাঁকানো। বাবা-মা ম্যাপসহ জোরালো সতর্কতা পান; কে দেখেছে তাও জানা যায়।',
    f4_t: 'নিরাপদে বাড়ি ফেরা', f4_b: 'সন্তান "বাড়ি ফিরছি" চাপলে পৌঁছানোর খবর পাবেন, দেরি হলে বা পথে থেমে থাকলেও জানবেন।',
    f5_t: 'প্রবাসী পরিবারের জন্য', f5_b: 'বিদেশে থাকেন? প্রত্যেকের স্থানীয় সময় দেখুন আর যেকোনো জায়গা থেকে পরিবারের খেয়াল রাখুন।',
    f6_t: 'গোপনীয়তা সবার আগে', f6_b: 'কিছুই লুকানো নয়, বিজ্ঞাপন নেই, তথ্য বিক্রি নেই। প্রাপ্তবয়স্করা সম্মতি দিলে তবেই শেয়ার হয়।',
    premium_title: 'পুরো পরিবারের জন্য সহজ প্ল্যান', premium_sub: 'একজন কিনলে পরিবারের সবাই সুবিধা পান। লাইভ লোকেশন ও SOS সবসময় ফ্রি।',
    loading: 'প্ল্যান লোড হচ্ছে…', local_title: 'স্থানীয় পেমেন্ট',
    local_body: 'বিকাশ বা নগদে পেমেন্ট করুন। প্ল্যান ও অ্যাকাউন্টের ইমেইল লিখে WhatsApp-এ জানান; আমরা আপনার পরিবারের জন্য প্রিমিয়াম চালু করে দেব।',
    pay_wa: 'WhatsApp-এ পেমেন্ট', gift_title: 'পরিবারকে প্রিমিয়াম উপহার দিন',
    gift_1: 'অ্যাপে অভিভাবক হিসেবে পরিবারে যোগ দিন এবং সবার জন্য প্রিমিয়াম কিনুন।', gift_2: 'অথবা দেশে পাঠানোর জন্য WhatsApp-এ রিডিম কোড চান।', gift_3: 'আমরা সরাসরি পরিবারের অ্যাকাউন্টে প্যাকেজও চালু করে দিতে পারি।',
    updates_title: 'অ্যাপ আপডেট', no_updates: 'নতুন সংস্করণের খবর এখানে দেখা যাবে।',
    privacy: 'প্রাইভেসি পলিসি', terms: 'শর্তাবলি', delete: 'অ্যাকাউন্ট ও তথ্য মুছে ফেলা', contact: 'যোগাযোগ',
    free: 'ফ্রি', month: 'মাস', year: 'বছর', per_month: 'প্রতি মাসে', popular: 'সবচেয়ে জনপ্রিয়', trial: '{d} দিনের ফ্রি ট্রায়াল',
    children: 'সন্তান: {n}', adults: 'প্রাপ্তবয়স্ক: {n}', places: 'জায়গা: {n}', places_unl: 'অসীম জায়গা', history: 'ইতিহাস: {n} দিন', priority: 'অগ্রাধিকার সাপোর্ট', sos: 'লাইভ ম্যাপ ও SOS',
  };
  const EN = {
    free: 'Free', month: 'month', year: 'year', per_month: 'per month', popular: 'Most popular', trial: '{d}-day free trial',
    children: 'Children: {n}', adults: 'Adults: {n}', places: 'Places: {n}', places_unl: 'Unlimited places', history: 'History: {n} days', priority: 'Priority support', sos: 'Live map and SOS',
  };
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } return null; };
  const original = {};
  document.querySelectorAll('[data-i18n]').forEach((el) => { original[el.dataset.i18n] = el.textContent; });
  let lang = store('lang') || (navigator.language || '').startsWith('bn') ? 'bn' : 'en';
  lang = store('lang') || lang;
  const T = (k, p = {}) => String((lang === 'bn' ? BN[k] : EN[k]) ?? original[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => p[x] ?? '');
  let data = { plans: [], changelog: [], cfg: {} };

  function applyLang() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const k = el.dataset.i18n;
      el.textContent = lang === 'bn' ? (BN[k] ?? original[k]) : original[k];
    });
    document.getElementById('lang').textContent = lang === 'bn' ? 'English' : 'বাংলা';
    renderPlans();
    renderChangelog();
  }
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    document.getElementById('theme').setAttribute('aria-label', t === 'dark' ? 'Light mode' : 'Dark mode');
  }
  const money = (cur, minor) => {
    const v = minor / 100;
    const n = Number.isInteger(v) ? String(v) : v.toFixed(2);
    return ({ BDT: '৳', USD: '$', EUR: '€', GBP: '£', INR: '₹' }[cur] || `${cur} `) + n;
  };
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function renderPlans() {
    const box = document.getElementById('plans');
    if (!data.plans.length) return;
    box.replaceChildren();
    for (const p of data.plans) {
      const card = el('article', `plan${p.popular ? ' popular' : ''}`);
      if (p.popular) card.append(el('span', 'tag', T('popular')));
      card.append(el('h3', null, p.name_i18n?.[lang] || p.name));
      const y = p.prices.find((x) => x.period === 'yearly');
      const m = p.prices.find((x) => x.period === 'monthly');
      if (p.is_free) card.append(el('p', 'price', T('free')));
      else if (m) card.append(el('p', 'price', `${money(m.currency, m.amount_minor)} / ${T('month')}`));
      if (y) card.append(el('p', 'pm', `${money(y.currency, y.amount_minor)} / ${T('year')} · ${money(y.currency, y.per_month_minor)} ${T('per_month')}`));
      else card.append(el('p', 'pm', p.trial_days ? T('trial', { d: p.trial_days }) : ' '));
      const ul = el('ul');
      const l = p.limits;
      [T('sos'), T('children', { n: l.max_children }), T('adults', { n: l.max_members }),
        l.max_places == null ? T('places_unl') : T('places', { n: l.max_places }), T('history', { n: l.history_days }),
        ...(p.priority_support ? [T('priority')] : [])].forEach((f) => ul.append(el('li', null, f)));
      card.append(ul);
      box.append(card);
    }
  }
  function renderChangelog() {
    const box = document.getElementById('changelog');
    const list = data.changelog;
    if (!list.length) return;
    box.replaceChildren(...list.map((c) => {
      const e = el('div', 'entry');
      e.append(el('span', 'v', `v${c.version}`), el('b', null, c.title), el('p', 'muted', c.body));
      return e;
    }));
  }
  async function load() {
    const get = (u) => fetch(u, { headers: { accept: 'application/json' } }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const [plans, cfg, log] = await Promise.all([get('/api/v1/plans?country=BD'), get('/api/v1/app-config'), get(`/api/v1/changelog?language=${lang}`)]);
    data = { plans: plans?.plans || [], cfg: cfg || {}, changelog: log || [] };
    if (cfg?.play_store_url) document.getElementById('play').href = cfg.play_store_url;
    const wa = document.getElementById('wa');
    const num = String(cfg?.whatsapp_number || '').replace(/\D/g, '');
    if (num) wa.href = `https://wa.me/${num}?text=${encodeURIComponent('Nirapod Premium — ')}`;
    else wa.closest('.local').hidden = true;
    renderPlans();
    renderChangelog();
  }
  document.getElementById('lang').addEventListener('click', () => { lang = lang === 'bn' ? 'en' : 'bn'; store('lang', lang); applyLang(); load(); });
  document.getElementById('theme').addEventListener('click', () => {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    store('theme', t);
    applyTheme(t);
  });
  applyTheme(store('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  document.getElementById('year').textContent = String(new Date().getFullYear());
  applyLang();
  load();
})();
