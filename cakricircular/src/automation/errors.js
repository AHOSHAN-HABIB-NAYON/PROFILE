'use strict';
/** Turn technical errors into clear Bangla explanations for the admin. */
function explain(e) {
  if (!e) return 'অজানা ত্রুটি';
  const body = String(e.body || '');
  const msg = String(e.message || '');
  const code = String(e.code || (e.cause && e.cause.code) || '');
  const isAI = /openai|chat\/completions|\/models/.test(String(e.url || '')) || /api\.openai/.test(body);

  if (e.name === 'TimeoutError' || /timeout|aborted/i.test(msg)) return isAI ? 'OpenAI থেকে উত্তর আসতে বেশি সময় লেগেছে (টাইমআউট) — পরে আবার চেষ্টা হবে' : 'সোর্স সাইট সময়মতো সাড়া দেয়নি (টাইমআউট)';
  if (code === 'ENOTFOUND' || /ENOTFOUND|getaddrinfo/.test(msg + code)) return 'ডোমেইন খুঁজে পাওয়া যায়নি — URL টি ঠিক আছে কিনা দেখুন';
  if (code === 'ECONNREFUSED' || code === 'ECONNRESET' || /fetch failed/i.test(msg)) return 'সার্ভারের সাথে সংযোগ করা যায়নি (নেটওয়ার্ক সমস্যা বা সাইট বন্ধ)';
  if (/certificate|SSL|TLS/i.test(msg + code)) return 'SSL সার্টিফিকেট সমস্যা — সাইটটির https ঠিক নেই';
  if (code === 'AI_JSON') return 'AI সঠিক ফরম্যাটে (JSON) উত্তর দেয়নি — পরের রানে আবার চেষ্টা হবে';
  if (code === 'BAD_JSON') return 'সোর্স সাইট সঠিক ডেটা দেয়নি — সম্ভবত WordPress REST API বন্ধ বা Cloudflare ব্লক করছে';

  if (e.status) {
    if (/insufficient_quota/.test(body)) return 'OpenAI অ্যাকাউন্টে ক্রেডিট/কোটা শেষ — billing চেক করুন';
    if (/model_not_found|does not exist/.test(body)) return 'মডেলের নাম ভুল বা এই কী দিয়ে মডেলটি ব্যবহারের অনুমতি নেই';
    if (/context_length|maximum context/.test(body)) return 'পোস্টটি অনেক বড়, AI এর সীমা ছাড়িয়ে গেছে';
    if (e.status === 401) return isAI || /api key|Incorrect API key/i.test(body) ? 'OpenAI API কী ভুল বা বাতিল হয়ে গেছে' : 'সোর্স সাইটে প্রবেশের অনুমতি নেই (401)';
    if (e.status === 403) return 'সোর্স সাইট অনুরোধ ব্লক করেছে (403) — ফায়ারওয়াল/Cloudflare হতে পারে';
    if (e.status === 404) return isAI ? 'OpenAI API ঠিকানা ভুল (404)' : 'এই সাইটে WordPress REST API পাওয়া যায়নি (404)';
    if (e.status === 429) return isAI ? 'OpenAI রেট লিমিট — অনেক দ্রুত অনুরোধ, সমান্তরাল কল কমিয়ে দিন' : 'সোর্স সাইট অনেক অনুরোধের কারণে সাময়িক ব্লক করেছে (429)';
    if (e.status >= 500) return isAI ? 'OpenAI সার্ভারে সাময়িক সমস্যা — পরে আবার চেষ্টা হবে' : `সোর্স সাইটের সার্ভারে সমস্যা (${e.status})`;
    return `HTTP ত্রুটি ${e.status}`;
  }
  if (/ER_|SQL/.test(code + msg)) return `ডাটাবেজ ত্রুটি: ${msg}`;
  return msg || 'অজানা ত্রুটি';
}
module.exports = { explain };
