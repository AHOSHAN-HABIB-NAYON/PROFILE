/* ─────────────────────────────────────────────
   OpenAI দিয়ে নিজের ভাষায় সাজানো। ত্রুটি বাংলায় ব্যাখ্যা ও সমাধানসহ।
   ───────────────────────────────────────────── */
import { setting } from '../../core/settings.js';
import { sleep } from './util.js';

export class AutoAIError extends Error {
  constructor(msg, hint = '', fatal = false) { super(msg); this.hint = hint; this.fatal = fatal; }
}

function aiError(code, raw, netErr) {
  let j = {}; try { j = JSON.parse(raw); } catch { /* */ }
  const emsg = String(j?.error?.message || ''); const type = `${j?.error?.type || ''} ${j?.error?.code || ''}`;
  if (code === 0) {
    if (/সময় শেষ|abort|timeout/i.test(netErr)) return new AutoAIError('AI সময়মতো উত্তর দেয়নি', 'পোস্টটি হয়তো অনেক লম্বা। পরের রানে আবার চেষ্টা হবে — কিছু করতে হবে না।');
    return new AutoAIError('OpenAI-এর সাথে সংযোগ হয়নি', 'সার্ভারের ইন্টারনেট সংযোগে সমস্যা হতে পারে। কিছুক্ষণ পরে নিজেই চেষ্টা করবে।', true);
  }
  if (code === 401) return new AutoAIError('OpenAI API key ভুল বা বাতিল', 'OpenAI ড্যাশবোর্ড থেকে নতুন key বানিয়ে অটোমেশন সেটিংসে বসিয়ে সেভ করুন।', true);
  if (code === 429 && (/insufficient_quota/i.test(type) || /quota|billing/i.test(emsg))) return new AutoAIError('OpenAI অ্যাকাউন্টে ক্রেডিট শেষ', 'platform.openai.com → Billing-এ গিয়ে টাকা যোগ করুন। তারপর আবার চালান।', true);
  if (code === 429) return new AutoAIError('OpenAI-তে অল্প সময়ে বেশি অনুরোধ গেছে', 'কিছুক্ষণ অপেক্ষা করুন — পরের রানে নিজেই চলবে।', true);
  if (code === 404 || /model_not_found/i.test(type) || (/model/i.test(emsg) && /exist/i.test(emsg))) return new AutoAIError('মডেলের নাম ভুল বা এই key-তে ব্যবহারের অনুমতি নেই', 'অটোমেশন সেটিংসে "মডেলের নাম" মিলিয়ে দেখুন (যেমন gpt-5.6-luna)।', true);
  if (code === 403) return new AutoAIError('এই key দিয়ে OpenAI ব্যবহারের অনুমতি নেই', 'OpenAI অ্যাকাউন্টের project/permission সেটিং দেখুন, অথবা নতুন key দিন।', true);
  if (code === 400 && (/context_length/i.test(type) || /context length|maximum context/i.test(emsg))) return new AutoAIError('বিজ্ঞপ্তিটি AI-এর জন্য বেশি লম্বা', 'এই পোস্টটি হাতে দিতে হবে — অন্যগুলো স্বাভাবিকভাবে চলবে।');
  if (code >= 500) return new AutoAIError('OpenAI-এর সার্ভারে সাময়িক সমস্যা', 'আপনার কিছু করার নেই — পরের রানে নিজেই আবার চেষ্টা করবে।', true);
  return new AutoAIError(`AI ত্রুটি (HTTP ${code})${emsg ? `: ${emsg.slice(0, 140)}` : ''}`, 'সমস্যা থেকে গেলে এই বার্তার স্ক্রিনশট দিন।');
}

export function systemPrompt(catNames, divisions) {
  const cats = catNames.join(' | '); const divs = divisions.join(' | ');
  return `তুমি একজন অভিজ্ঞ বাংলা কনটেন্ট এডিটর। একটি চাকরি ও শিক্ষা-বিষয়ক বাংলা ওয়েবসাইটের জন্য পোস্ট তৈরি করো।

তোমাকে একটি বিজ্ঞপ্তির কাঁচা লেখা (অন্য সাইট থেকে সংগ্রহ) দেওয়া হবে। নিয়ম:
১. শুধু কাঁচা লেখায় থাকা তথ্য (পদের নাম, পদ সংখ্যা, প্রতিষ্ঠান, যোগ্যতা, বয়সসীমা, বেতন, আবেদনের তারিখ ও পদ্ধতি, ফি, ঠিকানা) ব্যবহার করবে।
২. মূল লেখার কোনো বাক্য হুবহু কপি করবে না — পুরোটা সম্পূর্ণ নিজের ভাষায়, সহজ ও সাবলীল বাংলায় নতুন করে লিখবে।
৩. কাঁচা লেখায় নেই এমন কোনো তথ্য অনুমান করে বানাবে না।
৪. অন্য সাইটের নাম, তাদের প্রচার, "আমাদের সাইটে চোখ রাখুন", টেলিগ্রাম/ফেসবুক গ্রুপে যোগ দিন — এ জাতীয় কিছুই লিখবে না।
৫. পদ সংখ্যা স্পষ্ট না থাকলে বা একাধিক পদে ভিন্ন সংখ্যা থাকলে "vacancy" তে মোট সংখ্যা দেবে; মোট বের করা না গেলে "একাধিক" লিখবে।
৬. "content_html" হবে সুন্দর করে সাজানো HTML — শুধু এই ট্যাগগুলো: <p> <h3> <ul> <li> <b> <table> <tr> <th> <td> <a>।
   আবেদনের লিংক বা অফিসিয়াল ওয়েবসাইট "আবেদনের নিয়ম" অংশে ক্লিকযোগ্য লিংক হিসেবে দেবে —
   <a href="পূর্ণ লিংক">সংক্ষিপ্ত ঠিকানা</a> (যেমন teletalk.com.bd)। লিংক শুধু দেওয়া তালিকা থেকে নেবে,
   অন্য সাইটের (বিশেষত যেখান থেকে লেখা নেওয়া হয়েছে) লিংক কখনো দেবে না।
   ক্রম: শুরুতে ১-২ লাইনের পরিচিতি (<p>), তারপর যা যা আছে সেই অনুযায়ী <h3> শিরোনামসহ অংশ —
   "এক নজরে", "পদের বিবরণ" (একাধিক পদ হলে <table>: পদের নাম | পদ সংখ্যা | বেতন/গ্রেড),
   "শিক্ষাগত যোগ্যতা", "বয়সসীমা", "আবেদনের নিয়ম", "আবেদন ফি", "গুরুত্বপূর্ণ তারিখ"। যে তথ্য নেই সেই অংশ বাদ দেবে।
   "এক নজরে" অংশে <ul> দিয়ে প্রতিষ্ঠান, পদ সংখ্যা, আবেদনের শুরু ও শেষ তারিখ, আবেদনের মাধ্যম।
   টেবিল শুধু তখনই দেবে যখন আলাদা আলাদা পদের নাম জানা আছে। কোনো ঘরের তথ্য না থাকলে "বিজ্ঞপ্তিতে উল্লেখিত"
   জাতীয় ফাঁকা কথা লিখবে না — সেই কলাম বাদ দেবে।
৭. ঠিক নিচের JSON কাঠামোয় উত্তর দেবে — অন্য কোনো লেখা, ব্যাখ্যা বা \`\`\`json ছাড়া:

{
  "title": "আকর্ষণীয় বাংলা শিরোনাম, প্রতিষ্ঠান ও পদসহ, ৯০ অক্ষরের মধ্যে, সাল থাকলে সাল দিয়ে",
  "category": "ঠিক এর একটি: ${cats}",
  "company": "প্রতিষ্ঠানের পূর্ণ নাম (বাংলায়), না থাকলে খালি",
  "vacancy": "মোট পদ সংখ্যা বাংলা অঙ্কে যেমন ১২৫, অস্পষ্ট হলে একাধিক",
  "division": "ঠিক এর একটি: ${divs} — নির্দিষ্ট না থাকলে সারাদেশ",
  "district": "নির্দিষ্ট জেলা থাকলে জেলার নাম, সারাদেশ হলে সারাদেশ, একাধিক জেলা হলে একাধিক",
  "salary": "বেতন/গ্রেড সংক্ষেপে যেমন ১২৫০০-৩০২৩০ টাকা বা ৯ম গ্রেড, না থাকলে খালি",
  "employment_type": "ঠিক এর একটি: FULL_TIME | PART_TIME | CONTRACTOR | TEMPORARY | INTERN",
  "application_start": "YYYY-MM-DD বা খালি",
  "deadline": "আবেদনের শেষ তারিখ YYYY-MM-DD। একাধিক শেষ তারিখ থাকলে (যেমন বিভিন্ন প্রতিষ্ঠান/পদের জন্য আলাদা) সবচেয়ে শেষের তারিখটি দেবে। না থাকলে খালি",
  "apply_url": "অনলাইন আবেদনের লিংক (দেওয়া লিংক তালিকা থেকে), না থাকলে খালি",
  "official_url": "প্রতিষ্ঠানের অফিসিয়াল ওয়েবসাইট (দেওয়া লিংক তালিকা থেকে), না থাকলে খালি",
  "content_html": "উপরের ৬ নম্বর নিয়মে সাজানো পূর্ণ বিবরণ",
  "meta_title": "৬০ অক্ষরের কম",
  "meta_description": "১৫৫ অক্ষরের কম — পদ, প্রতিষ্ঠান, পদ সংখ্যা ও শেষ তারিখ",
  "keywords": "৫-৮টি, কমা দিয়ে",
  "confidence_note": "কোনো তথ্য অস্পষ্ট বা পরস্পরবিরোধী হলে সংক্ষেপে এখানে লেখো, নাহলে খালি"
}`;
}

async function call(payload, key) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 110000);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(payload), signal: ctl.signal });
    return { code: res.status, raw: await res.text(), err: '' };
  } catch (e) { return { code: 0, raw: '', err: e.name === 'AbortError' ? 'সময় শেষ' : String(e.message || e) }; }
  finally { clearTimeout(t); }
}

export async function writePost(scr, catNames, divisions) {
  if (globalThis.__autoMockAi) return globalThis.__autoMockAi(scr);
  const key = setting('auto_openai_key', '').trim();
  const model = setting('auto_model', 'gpt-5.6-luna').trim() || 'gpt-5.6-luna';
  if (!key) throw new AutoAIError('OpenAI API key সেট করা হয়নি', 'অটোমেশন সেটিংসে OpenAI API key বসিয়ে সেভ করুন।', true);
  const linkList = Object.entries(scr.links).map(([u, t]) => `- ${t}: ${u}`).join('\n');
  const user = `উৎসের শিরোনাম: ${scr.title}\n\nলেখায় থাকা লিংকগুলো:\n${linkList || '- (নেই)'}\n\nনিচের কাঁচা লেখা থেকে JSON বানাও:\n---\n${scr.text}\n---`;
  const payload = { model, messages: [{ role: 'system', content: systemPrompt(catNames, divisions) }, { role: 'user', content: user }],
    response_format: { type: 'json_object' }, reasoning_effort: 'low', max_completion_tokens: 7000 };
  let r = await call(payload, key);
  /* কোনো মডেল বাড়তি সেটিং না মানলে সেটা বাদ দিয়ে আবার চেষ্টা (সর্বোচ্চ ৩ বার) */
  for (let k = 0; k < 3 && r.code === 400; k++) {
    let dropped = false;
    for (const opt of ['reasoning_effort', 'max_completion_tokens', 'response_format']) if (opt in payload && new RegExp(opt, 'i').test(r.raw)) { delete payload[opt]; dropped = true; }
    if (!dropped) break;
    r = await call(payload, key);
  }
  /* অল্প সময়ের রেট-লিমিট হলে একবার অপেক্ষা করে আবার */
  if (r.code === 429 && !/quota|billing/i.test(r.raw)) { await sleep(6000); r = await call(payload, key); }
  if (r.code !== 200) throw aiError(r.code, r.raw, r.err);
  let resp; try { resp = JSON.parse(r.raw); } catch { throw new AutoAIError('AI-এর উত্তর বোঝা যায়নি', 'সাধারণত একবারের সমস্যা — পরের রানে আবার চেষ্টা হবে।'); }
  let txt = String(resp?.choices?.[0]?.message?.content || '').trim().replace(/^```(?:json)?\s*|\s*```$/gi, '');
  let data; try { data = JSON.parse(txt); } catch { data = null; }
  if (!data || typeof data !== 'object' || !data.title) {
    if (resp?.choices?.[0]?.finish_reason === 'length') throw new AutoAIError('AI-এর লেখা মাঝপথে কেটে গেছে (বেশি লম্বা)', 'পরের রানে আবার চেষ্টা হবে; বারবার হলে পোস্টটি হাতে দিন।');
    throw new AutoAIError('AI-এর উত্তর বোঝা যায়নি', 'সাধারণত একবারের সমস্যা — পরের রানে আবার চেষ্টা হবে।');
  }
  data._usage = resp.usage || {}; data._model = model;
  return data;
}

export function usageText(ai) {
  const u = ai._usage || {}; const inn = Number(u.prompt_tokens ?? u.input_tokens ?? 0); const out = Number(u.completion_tokens ?? u.output_tokens ?? 0);
  if (!inn && !out) return '';
  let txt = `টোকেন: ইনপুট ${inn}, আউটপুট ${out}`;
  const pi = Number(setting('auto_price_in', '0')); const po = Number(setting('auto_price_out', '0'));
  if (pi > 0 || po > 0) txt += `, আনুমানিক খরচ $${((inn * pi + out * po) / 1e6).toFixed(4)}`;
  return txt;
}
