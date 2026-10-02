/*
 * Aura help bot — a floating assistant (bottom-right). Rule-based: understands many
 * Bangla, English and Banglish keywords, answers from live site facts (/api/bot/info)
 * and hands over to a human on WhatsApp. No message ever leaves the browser except
 * the facts request.
 */
import { api, esc, state } from './core.js';

const HIST_KEY = 'aura.bot.history';
let facts = null;
let factsAt = 0;
let navigateFn = (u) => { location.href = u; };

async function getFacts() {
  if (facts && Date.now() - factsAt < 60_000) return facts;
  try { facts = await api('/bot/info'); factsAt = Date.now(); } catch { /* keep old facts */ }
  return facts;
}

const waLink = () => {
  const n = String(facts?.support?.whatsapp || state.site?.support_whatsapp || '').replace(/\D/g, '');
  return n ? `https://wa.me/${n}` : '';
};

// ------------------------------------------------------------------ language
const hasBangla = (t) => /[ঀ-৿]/.test(t);
const BANGLISH = /\b(er|sathe|shathe|kotha|bolbo|gechi|diye|chai|dao|den|hobe|jabe|dekhi|gelo|vule|bhule|ekhon|akhon|ami|apni|kivabe|kibhabe|kemne|kemon|nibo|nebo|nite|dite|ashe|ase|ashena|asena|keno|kno|koto|kot|kon|kothay|kotay|hoy|hocche|hoche|parbo|parina|pari|lagbe|taka|vai|bhai|bro|kora|korbo|korte|ache|nai|na|dekhte|dekhabo|bolo|bol|ki|janabo|jodi|tumi|tomar|amar)\b/i;
function langOf(t) { return hasBangla(t) || BANGLISH.test(t) ? 'bn' : 'en'; }

// ------------------------------------------------------------------ intents
// Each intent: keywords (any language), and a reply(lang) → html.
const k = (...w) => w;
const INTENTS = [
  { id: 'greet', words: k('hi', 'hello', 'hey', 'salam', 'assalamu', 'assalam', 'আসসালামু', 'সালাম', 'হাই', 'হ্যালো', 'হেলো', 'kemon', 'কেমন', 'good morning', 'good evening', 'start') },
  { id: 'thanks', words: k('thanks', 'thank', 'thx', 'ধন্যবাদ', 'dhonnobad', 'shukriya', 'ok thanks', 'great', 'nice') },
  { id: 'human', words: k('human', 'agent', 'admin', 'এডমিন', 'অ্যাডমিন', 'support', 'সাপোর্ট', 'contact', 'যোগাযোগ', 'whatsapp', 'হোয়াটসঅ্যাপ', 'হোয়াটসএপ', 'মানুষ', 'manush', 'call', 'কল', 'owner', 'মালিক', 'talk', 'কথা') },
  { id: 'ranges', words: k('country', 'countries', 'দেশ', 'desh', 'range', 'ranges', 'রেঞ্জ', 'available', 'অ্যাভেইলেবল', 'কোন দেশ', 'kon desh', 'kon kon desh', 'কোন কোন দেশ', 'service list', 'list', 'active', 'একটিভ', 'অ্যাক্টিভ', 'এক্টিভ', 'ইক্টিভ', 'aktiv', 'চালু', 'chalu', 'on ache', 'kon range', 'কোন রেঞ্জ', 'live range', 'best range', 'ভালো রেঞ্জ', 'bhalo range') },
  { id: 'getnum', words: k('get number', 'number', 'নাম্বার', 'নম্বর', 'nambar', 'numbar', 'num', 'kivabe nibo', 'kemne nibo', 'নিব', 'নেব', 'নিবো', 'নেবো', 'নিতে', 'how to get', 'take number', 'claim') },
  { id: 'otp', words: k('otp', 'ওটিপি', 'code', 'কোড', 'sms', 'এসএমএস', 'message', 'মেসেজ', 'আসে না', 'আসছে না', 'ashena', 'asena', 'ase na', 'not coming', 'not received', 'pai na', 'পাই না', 'verification') },
  { id: 'return', words: k('return', 'ফেরত', 'ferot', 'cancel', 'বাতিল', 'release', 'x button', '10 min', '১০ মিনিট', 'pending', 'পেন্ডিং', 'expire') },
  { id: 'limits', words: k('limit', 'লিমিট', 'hour', 'ঘণ্টা', 'ghonta', 'per day', 'দিনে', 'dine', 'koyta', 'কয়টা', 'how many', 'quota', 'speed', 'too many', '429') },
  { id: 'premium', words: k('premium', 'প্রিমিয়াম', 'plan', 'plans', 'প্ল্যান', 'price', 'দাম', 'dam', 'cost', 'টাকা', 'taka', 'vip', 'upgrade', 'আপগ্রেড', 'package', 'প্যাকেজ', 'subscription') },
  { id: 'payment', words: k('payment', 'pay', 'পেমেন্ট', 'binance', 'বাইনান্স', 'trc20', 'usdt', 'deposit', 'জমা', 'screenshot', 'স্ক্রিনশট', 'txid', 'transaction', 'buy', 'কিনব', 'kinbo') },
  { id: 'withdraw', words: k('withdraw', 'উইথড্র', 'উত্তোলন', 'tola', 'তোলা', 'cash out', 'balance', 'ব্যালেন্স', 'wallet', 'ওয়ালেট', 'earn', 'আয়', 'income', 'reward', 'রিওয়ার্ড', 'money', 'টাকা তুলব') },
  { id: 'install', words: k('install', 'ইনস্টল', 'ইন্সটল', 'instal', 'app', 'অ্যাপ', 'এ্যাপ', 'apps', 'apk', 'home screen', 'download', 'ডাউনলোড', 'pwa', 'play store') },
  { id: 'notify', words: k('notification', 'নোটিফিকেশন', 'notifi', 'push', 'পুশ', 'alert', 'এলার্ট', 'sound', 'সাউন্ড', 'শব্দ', 'bell', 'বেল') },
  { id: 'search', words: k('advanced search', 'search', 'সার্চ', 'serial', 'সিরিয়াল', 'খুঁজ', 'khuj', 'specific number', 'নির্দিষ্ট', 'particular') },
  { id: 'password', words: k('password', 'পাসওয়ার্ড', 'forgot', 'ভুলে', 'vule', 'reset', 'রিসেট', 'login', 'লগইন', 'log in', 'sign in', 'cannot login', 'ঢুকতে পারছি না') },
  { id: 'twofa', words: k('2fa', 'two factor', 'two-factor', 'authenticator', 'টু ফ্যাক্টর', '2 step', 'two step', 'টু স্টেপ', 'recovery code', 'lost phone', 'ফোন হারিয়ে') },
  { id: 'pending', words: k('approval', 'approve', 'অনুমোদন', 'onumodon', 'account pending', 'waiting', 'অপেক্ষা', 'verify email', 'ভেরিফাই', 'verification email') },
  { id: 'restricted', words: k('restricted', 'restrict', 'blocked', 'block', 'ব্লক', 'বন্ধ', 'bondho', 'banned', 'suspend', 'সাসপেন্ড') },
  { id: 'theme', words: k('dark', 'ডার্ক', 'light mode', 'theme', 'থিম', 'night mode', 'color') },
  { id: 'plus', words: k('+', 'plus sign', 'প্লাস', 'country code', 'কান্ট্রি কোড', 'format') },
];

const GENERIC = new Set(['number', 'নাম্বার', 'নম্বর', 'nambar', 'numbar', 'num', 'app', 'code', 'কোড', 'message', 'list']);

function detect(text) {
  const t = ` ${text.toLowerCase().replace(/\s+/g, ' ')} `;
  let best = null;
  let score = 0;
  for (const it of INTENTS) {
    let s = 0;
    for (const w of it.words) {
      const ww = w.toLowerCase();
      // generic words ("number") weigh less, so "number return…" means Return, not Get Number
      if (/^[a-z0-9 ]+$/.test(ww) ? new RegExp(`(^|[^a-z0-9])${ww.replace(/ /g, '\\s+')}([^a-z0-9]|$)`).test(t) : t.includes(ww)) s += GENERIC.has(ww) ? 1 : (ww.length > 4 ? 2 : 1);
    }
    if (s > score) { score = s; best = it.id; }
  }
  return score ? best : null;
}

// ------------------------------------------------------------------ answers
const L = (lang, bn, en) => (lang === 'bn' ? bn : en);
const btn = (label, action, icon = '') => `<button type="button" class="bot-act" data-bot-act="${esc(action)}">${icon ? `<i class="${icon}"></i>` : ''}${esc(label)}</button>`;
const humanBtn = (lang) => (waLink() ? `<a class="bot-act wa" href="${esc(waLink())}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i>${L(lang, 'WhatsApp-এ কথা বলুন', 'Chat on WhatsApp')}</a>` : '');

const flag = (cc) => (/^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '🌐');

// Active countries (ranges that have numbers right now), grouped by country. No counts.
function countryList(lang) {
  const by = new Map();
  for (const x of (facts?.ranges || []).filter((r) => r.available)) {
    const c = by.get(x.cc) || { cc: x.cc, name: x.country, apps: [] };
    if (!c.apps.includes(x.app)) c.apps.push(x.app);
    by.set(x.cc, c);
  }
  if (!by.size) return L(lang, 'এই মুহূর্তে কোনো দেশে নাম্বার নেই। একটু পরে আবার দেখুন।', 'No country has numbers right now. Please check again a bit later.');
  return `<div class="bot-countries">${[...by.values()].map((c) => `<div><span class="bot-flag">${flag(c.cc)}</span><b>${esc(c.name || c.cc)}</b><small>${c.apps.map(esc).join(' · ')}</small></div>`).join('')}</div>`;
}

const ANSWERS = {
  greet: (l) => `${L(l, `হ্যালো${state.user?.name ? ` ${esc(state.user.name.split(' ')[0])}` : ''}! 👋 আমি Aura Assistant। কী জানতে চান?`, `Hi${state.user?.name ? ` ${esc(state.user.name.split(' ')[0])}` : ''}! 👋 I'm the Aura Assistant. What can I help with?`)}`,
  thanks: (l) => L(l, 'আপনাকেও ধন্যবাদ! 😊 আর কিছু লাগলে লিখুন।', "You're welcome! 😊 Ask me anything else."),
  human: (l) => `${L(l, 'আমাদের টিমের সাথে সরাসরি কথা বলুন:', 'Talk to our team directly:')}<br>${humanBtn(l) || L(l, 'সাপোর্ট নাম্বার এখনো সেট করা হয়নি।', 'No support number is set yet.')}`,
  ranges: (l) => `${L(l, '🌍 <b>এখন যেসব দেশ Active আছে</b>', '🌍 <b>Countries active right now</b>')}${countryList(l)}${btn(L(l, 'নাম্বার নিন', 'Get a number'), 'go:/access', 'fa-solid fa-plus')}`,

  getnum: (l) => L(l,
    `📱 <b>নাম্বার নেওয়ার নিয়ম</b><ol><li><b>Access</b> পেজে যান।</li><li><b>Select Range</b> থেকে দেশ/অ্যাপ বাছুন (নিচের চিপেও চাপতে পারেন)।</li><li><b>Get Number</b> চাপুন — নাম্বার নিচের <b>Number List</b>-এ আসবে।</li><li>নাম্বার কপি করে অ্যাপে দিন — OTP এলে সাথে সাথে নাম্বারের নিচে দেখাবে।</li></ol>${btn('Access খুলুন', 'go:/access', 'fa-solid fa-sim-card')}`,
    `📱 <b>How to get a number</b><ol><li>Open <b>Access</b>.</li><li>Choose a range in <b>Select Range</b> (or tap a chip below it).</li><li>Tap <b>Get Number</b> — it appears in your <b>Number List</b>.</li><li>Copy it into the app — the OTP shows under the number instantly.</li></ol>${btn('Open Access', 'go:/access', 'fa-solid fa-sim-card')}`),
  otp: (l) => L(l,
    `🔑 <b>OTP কোথায় দেখবেন</b><br>নাম্বার নেওয়ার পর OTP এলে <b>Number List</b>-এ নাম্বারের নিচে বসে যায় (চাপলেই কপি)। <b>OTP</b> পেজেও দেখা যায় — নাম্বারের শেষ ৪ সংখ্যা লিখে সার্চ করুন।<br><br><b>OTP আসছে না?</b><ul><li>নাম্বারটা ঠিকমতো (দেশের কোডসহ) দিয়েছেন কিনা দেখুন।</li><li>১০ মিনিটে না এলে নাম্বার ফেরত যায় — নতুন নাম্বার নিন।</li><li>অন্য কোনো Active দেশের নাম্বার নিয়ে দেখুন।</li></ul>${btn('কোন কোন দেশ Active?', 'ask:ranges', 'fa-solid fa-earth-asia')}`,
    `🔑 <b>Where is my OTP?</b><br>When it arrives it appears under the number in your <b>Number List</b> (tap to copy). The <b>OTP</b> page shows it too — search the last 4 digits.<br><br><b>Not coming?</b><ul><li>Check you entered the number correctly (with country code).</li><li>No OTP in 10 minutes → the number returns; take a new one.</li><li>Try a number from another active country.</li></ul>${btn('Which countries are active?', 'ask:ranges', 'fa-solid fa-earth-asia')}`),
  return: (l) => {
    const m = facts?.return_minutes || 10;
    return L(l, `⏱️ নাম্বার নেওয়ার <b>${m} মিনিটের</b> মধ্যে OTP না এলে নাম্বারটা নিজে থেকে ফেরত যায় (<b>Return</b> লেখা দেখাবে)। চাইলে আগেই ✕ চেপে ফেরত দিতে পারেন। OTP এসে গেলে নাম্বার আপনার থাকে।`,
      `⏱️ If no OTP arrives within <b>${m} minutes</b>, the number returns automatically (shown as <b>Return</b>). You can return it earlier with ✕. Once an OTP arrives the number stays yours.`);
  },
  limits: (l) => {
    const x = facts?.limits;
    const p = facts?.premium;
    return x ? L(l, `⚡ আপনার লিমিট: ঘণ্টায় <b>${x.hourly}</b>টা (ব্যবহার ${x.hour_used}), দিনে <b>${x.daily}</b>টা (ব্যবহার ${x.day_used})। ${p ? `আপনি <b>${esc(p.plan)}</b> প্রিমিয়ামে আছেন।` : 'প্রিমিয়াম নিলে লিমিট বাড়ে।'}${p ? '' : btn('প্রিমিয়াম দেখুন', 'ask:premium', 'fa-solid fa-crown')}`,
      `⚡ Your limits: <b>${x.hourly}</b>/hour (used ${x.hour_used}), <b>${x.daily}</b>/day (used ${x.day_used}). ${p ? `You are on <b>${esc(p.plan)}</b>.` : 'Premium gives you more speed.'}${p ? '' : btn('See Premium', 'ask:premium', 'fa-solid fa-crown')}`) : '';
  },
  premium: (l) => {
    const plans = facts?.plans || [];
    const list = plans.map((p) => `<div><b>${esc(p.name)}</b><span>${esc(facts.currency)}${esc(p.price)}</span><small>${p.hourly ? `${p.hourly}/h · ${p.daily}/day` : ''}</small></div>`).join('');
    return `${L(l, '👑 <b>প্রিমিয়াম প্ল্যান</b> — বেশি স্পিড (ঘণ্টা/দিনে বেশি নাম্বার):', '👑 <b>Premium plans</b> — more speed (more numbers per hour/day):')}<div class="bot-plans">${list}</div>${facts?.premium ? L(l, `<p class="bot-note">আপনার প্ল্যান: <b>${esc(facts.premium.plan)}</b></p>`, `<p class="bot-note">Your plan: <b>${esc(facts.premium.plan)}</b></p>`) : ''}${btn(L(l, 'প্রিমিয়াম কিনুন', 'Buy Premium'), 'go:/premium', 'fa-solid fa-crown')}`;
  },
  payment: (l) => {
    const p = facts?.payments || {};
    const m = [p.trc20 && 'USDT (TRC20)', p.binance && 'Binance Pay'].filter(Boolean).join(' / ') || '—';
    return L(l, `💳 <b>পেমেন্ট</b>: ${m}<ol><li><b>Premium</b> পেজে প্ল্যান বাছুন।</li><li>পদ্ধতি বাছুন, ঠিকানা/UID-তে টাকা পাঠান।</li><li>Transaction ID আর স্ক্রিনশট দিয়ে সাবমিট করুন।</li><li>অ্যাডমিন অনুমোদন দিলেই প্রিমিয়াম চালু ✅</li></ol>${btn('Premium খুলুন', 'go:/premium', 'fa-solid fa-crown')}`,
      `💳 <b>Payment</b>: ${m}<ol><li>Pick a plan on <b>Premium</b>.</li><li>Choose a method and send to the address/UID.</li><li>Submit the transaction ID and a screenshot.</li><li>Premium starts once an admin approves ✅</li></ol>${btn('Open Premium', 'go:/premium', 'fa-solid fa-crown')}`);
  },
  withdraw: (l) => L(l,
    `💰 প্রতিটা সফল OTP-তে ওয়ালেটে রিওয়ার্ড যোগ হয়। ব্যালেন্স কমপক্ষে <b>${esc(facts?.currency || '$')}${esc(facts?.min_withdrawal || '')}</b> হলে <b>Withdraw</b> পেজ থেকে Binance UID দিয়ে তুলতে পারবেন।${btn('Withdraw', 'go:/withdraw', 'fa-solid fa-money-bill-transfer')}`,
    `💰 Each successful OTP adds a reward to your wallet. From <b>${esc(facts?.currency || '$')}${esc(facts?.min_withdrawal || '')}</b> you can withdraw to your Binance UID on the <b>Withdraw</b> page.${btn('Withdraw', 'go:/withdraw', 'fa-solid fa-money-bill-transfer')}`),
  install: (l) => L(l,
    `📲 <b>অ্যাপ ইনস্টল</b><ul><li><b>Android (Chrome)</b>: উপরের ⋮ মেনু → <b>Install app</b> / <b>Add to Home screen</b>।</li><li><b>iPhone (Safari)</b>: Share <i class="fa-solid fa-arrow-up-from-bracket"></i> → <b>Add to Home Screen</b>।</li></ul>ইনস্টলের পর হোম স্ক্রিন থেকে পুরো অ্যাপের মতো খুলবে, আর বন্ধ থাকলেও OTP নোটিফিকেশন পাবেন।${btn('Settings খুলুন', 'go:/settings', 'fa-solid fa-gear')}`,
    `📲 <b>Install the app</b><ul><li><b>Android (Chrome)</b>: menu ⋮ → <b>Install app</b> / <b>Add to Home screen</b>.</li><li><b>iPhone (Safari)</b>: Share <i class="fa-solid fa-arrow-up-from-bracket"></i> → <b>Add to Home Screen</b>.</li></ul>It opens full-screen from your home screen and can notify you of OTPs even when closed.${btn('Open Settings', 'go:/settings', 'fa-solid fa-gear')}`),
  notify: (l) => L(l,
    `🔔 <b>Settings → Notifications</b>-এ গিয়ে <b>Push notifications</b> চালু করুন, ব্রাউজার অনুমতি চাইলে <b>Allow</b> দিন। তাহলে অ্যাপ বন্ধ থাকলেও OTP এলে ফোনে নোটিফিকেশন আসবে। ইমেইল, সাউন্ড ইত্যাদিও ওখান থেকে চালু/বন্ধ করা যায়।${btn('নোটিফিকেশন চালু করুন', 'go:/settings#notifications', 'fa-regular fa-bell')}`,
    `🔔 Go to <b>Settings → Notifications</b> and turn on <b>Push notifications</b> (allow when asked). You'll get OTP alerts even when the app is closed. Email and sound are there too.${btn('Turn on notifications', 'go:/settings#notifications', 'fa-regular fa-bell')}`),
  search: (l) => L(l,
    `🔍 <b>Advanced Search</b>: Access পেজের উপরে ডানে <b>Search</b> আইকনে চাপুন। নাম্বারের যেকোনো ৩–৮ সংখ্যা লিখুন (চাইলে <b>+</b> দিয়ে শুরু)। মিলে যাওয়া নাম্বার থেকে <b>Claim</b> চাপলেই আপনার হয়ে যাবে। শেষ সার্চ মনে থাকে।${btn('Access খুলুন', 'go:/access', 'fa-solid fa-magnifying-glass-plus')}`,
    `🔍 <b>Advanced Search</b>: tap the <b>Search</b> icon at the top of Access. Type any 3–8 digits of a number (a leading <b>+</b> is fine) and tap <b>Claim</b> on a match. Your last search is remembered.${btn('Open Access', 'go:/access', 'fa-solid fa-magnifying-glass-plus')}`),
  password: (l) => L(l,
    `🔐 পাসওয়ার্ড ভুলে গেলে লগইন পেজে <b>Forgot password?</b> চাপুন — ইমেইলে রিসেট লিংক যাবে। লগইন থাকা অবস্থায় পাসওয়ার্ড বদলাতে <b>Security</b> পেজে যান।${btn('Security', 'go:/security', 'fa-solid fa-shield-halved')}`,
    `🔐 Forgot your password? Tap <b>Forgot password?</b> on the login page — a reset link is emailed. To change it while signed in, open <b>Security</b>.${btn('Security', 'go:/security', 'fa-solid fa-shield-halved')}`),
  twofa: (l) => L(l,
    `🛡️ <b>Security</b> পেজ থেকে 2FA চালু করুন (Google Authenticator দিয়ে QR স্ক্যান)। রিকভারি কোডগুলো সেভ রাখুন। ফোন হারালে লগইনের সময় <b>Lost your phone? Get a code by email</b> চাপুন।${btn('Security', 'go:/security', 'fa-solid fa-shield-halved')}`,
    `🛡️ Turn on 2FA from <b>Security</b> (scan the QR with Google Authenticator) and keep your recovery codes. Lost your phone? Tap <b>Get a code by email</b> at sign-in.${btn('Security', 'go:/security', 'fa-solid fa-shield-halved')}`),
  pending: (l) => `${L(l, '⏳ নতুন অ্যাকাউন্ট ইমেইল ভেরিফাই করার পর অ্যাডমিনের অনুমোদনের অপেক্ষায় থাকতে পারে। অনুমোদন হলে ইমেইল যাবে। দ্রুত করতে আমাদের সাথে যোগাযোগ করুন:', '⏳ New accounts may wait for admin approval after email verification — you get an email once approved. To speed it up, contact us:')}<br>${humanBtn(l)}`,
  restricted: (l) => `${L(l, '🔒 আপনার অ্যাকাউন্টে কোনো সীমাবদ্ধতা থাকলে শুধু অ্যাডমিন তা তুলতে পারেন। দয়া করে যোগাযোগ করুন:', '🔒 Only an admin can lift a restriction on your account. Please contact us:')}<br>${humanBtn(l)}`,
  theme: (l) => `${L(l, '🌙 উপরে ডানে প্রোফাইল মেনু বা <b>Settings → Appearance</b> থেকে Light/Dark বদলানো যায়।', '🌙 Switch Light/Dark from the profile menu or <b>Settings → Appearance</b>.')}${btn('Settings', 'go:/settings', 'fa-solid fa-gear')}`,
  plus: (l) => L(l, '➕ নাম্বার কপি করলে দেশের কোডসহ পুরো নাম্বার কপি হয়। কিছু রেঞ্জে নাম্বার <b>+</b> সহ দেখায় — অ্যাপে দেওয়ার সময় অ্যাপ যেভাবে চায় সেভাবে দিন।', '➕ Copying a number copies it in full with the country code. Some ranges show a leading <b>+</b> — enter it the way the app asks.'),
};

const QUICK = [
  ['getnum', 'নাম্বার কিভাবে নেব', 'How to get a number'],
  ['otp', 'OTP আসছে না', 'OTP not coming'],
  ['ranges', 'কোন কোন দেশ Active', 'Active countries'],
  ['premium', 'প্রিমিয়াম প্ল্যান', 'Premium plans'],
  ['install', 'অ্যাপ ইনস্টল', 'Install app'],
  ['notify', 'নোটিফিকেশন', 'Notifications'],
  ['withdraw', 'উইথড্র', 'Withdraw'],
  ['human', 'Contact Human', 'Contact Human'],
];

function fallback(l) {
  return `${L(l, '🤔 ঠিক বুঝতে পারিনি। এগুলোর কোনোটা জানতে চান?', "🤔 I didn't quite get that. Is it one of these?")}<div class="bot-quick">${QUICK.slice(0, 6).map(([id, bn, en]) => btn(L(l, bn, en), `ask:${id}`)).join('')}</div>${L(l, 'অথবা সরাসরি মানুষের সাথে কথা বলুন:', 'Or talk to a person:')}<br>${humanBtn(l)}`;
}

// ------------------------------------------------------------------ UI
let root = null;
let lang = 'bn';
let history = [];

const IDLE_MS = 2 * 60_000; // no chat for 2 minutes → the conversation is wiped
let idleTimer = null;

function save() { try { sessionStorage.setItem(HIST_KEY, JSON.stringify({ at: Date.now(), items: history.slice(-30) })); } catch { /* ignore */ } }

function load() {
  try {
    const v = JSON.parse(sessionStorage.getItem(HIST_KEY) || 'null');
    if (v && Array.isArray(v.items) && Date.now() - v.at < IDLE_MS) return v.items;
    sessionStorage.removeItem(HIST_KEY);
  } catch { /* ignore */ }
  return [];
}

function wipe() {
  clearTimeout(idleTimer);
  history = [];
  facts = null;
  try { sessionStorage.removeItem(HIST_KEY); } catch { /* ignore */ }
  const box = root?.querySelector('[data-bot-msgs]');
  if (box) box.innerHTML = '';
  if (root?.classList.contains('open')) greet();
}

function touch() {
  clearTimeout(idleTimer);
  if (history.length) idleTimer = setTimeout(wipe, IDLE_MS);
}

function greet() {
  push('bot', ANSWERS.greet('bn'), false);
  push('bot', `<div class="bot-quick">${QUICK.map(([id, bn]) => btn(bn, `ask:${id}`)).join('')}</div>`, false);
}

function push(who, html, persist = true) {
  const box = root.querySelector('[data-bot-msgs]');
  box.insertAdjacentHTML('beforeend', `<div class="bot-msg from-${who}"><div class="bot-bubble">${html}</div></div>`);
  box.scrollTop = box.scrollHeight;
  if (persist) { history.push({ who, html }); save(); touch(); }
}

async function answer(id, l = lang) {
  const box = root.querySelector('[data-bot-msgs]');
  box.insertAdjacentHTML('beforeend', '<div class="bot-msg from-bot typing" data-typing><div class="bot-bubble"><span></span><span></span><span></span></div></div>');
  box.scrollTop = box.scrollHeight;
  await Promise.all([getFacts(), new Promise((r) => setTimeout(r, 450))]);
  box.querySelector('[data-typing]')?.remove();
  push('bot', id && ANSWERS[id] ? ANSWERS[id](l) : fallback(l));
}

function onUserText(text) {
  const t = text.trim();
  if (!t) return;
  lang = langOf(t);
  push('me', esc(t));
  answer(detect(t), lang);
}

function open(on) {
  root.classList.toggle('open', on);
  root.querySelector('[data-bot-panel]').hidden = !on;
  if (on) {
    getFacts();
    if (!root.querySelector('[data-bot-msgs]').children.length) greet();
    setTimeout(() => root.querySelector('[data-bot-input]')?.focus({ preventScroll: true }), 200);
  }
}

export function mountBot({ navigate } = {}) {
  if (root || !state.user) return;
  if (navigate) navigateFn = navigate;
  history = load();
  root = document.createElement('div');
  root.className = 'bot';
  root.innerHTML = `<button class="bot-fab" data-bot-toggle aria-label="Help chat"><i class="fa-solid fa-comments"></i><span class="bot-dot"></span></button>
    <div class="bot-panel" data-bot-panel hidden role="dialog" aria-label="Aura Assistant">
      <div class="bot-head"><span class="bot-avatar"><i class="fa-solid fa-robot"></i></span>
        <div class="bot-title"><strong>Aura Assistant</strong><small><i class="bot-online"></i>Online · replies instantly</small></div>
        ${waLink() || state.site?.support_whatsapp ? `<a class="bot-human" href="${esc(waLink() || `https://wa.me/${String(state.site.support_whatsapp).replace(/\D/g, '')}`)}" target="_blank" rel="noopener" title="Contact Human"><i class="fa-brands fa-whatsapp"></i>Human</a>` : ''}
        <button class="bot-x" data-bot-toggle aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="bot-msgs" data-bot-msgs>${history.map((m) => `<div class="bot-msg from-${m.who}"><div class="bot-bubble">${m.html}</div></div>`).join('')}</div>
      <form class="bot-form" data-bot-form><input class="bot-input" data-bot-input placeholder="প্রশ্ন লিখুন… / Ask anything…" maxlength="300" autocomplete="off">
        <button class="bot-send" type="submit" aria-label="Send"><i class="fa-solid fa-paper-plane"></i></button></form>
    </div>`;
  document.body.append(root);
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-bot-toggle]')) { open(!root.classList.contains('open')); return; }
    const a = e.target.closest('[data-bot-act]');
    if (!a) return;
    const [kind, val] = a.dataset.botAct.split(/:(.*)/s);
    if (kind === 'go') { open(false); navigateFn(val); }
    if (kind === 'ask') { const q = QUICK.find(([id]) => id === val); push('me', esc(q ? (lang === 'bn' ? q[1] : q[2]) : val)); answer(val); }
  });
  root.querySelector('[data-bot-form]').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = root.querySelector('[data-bot-input]');
    onUserText(input.value);
    input.value = '';
  });
  const box = root.querySelector('[data-bot-msgs]');
  box.scrollTop = box.scrollHeight;
  touch();
}

// exported for tests
export const _test = { detect, langOf };
