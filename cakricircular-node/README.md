# চাকরি সার্কুলার — Node.js সংস্করণ (v3)

PHP থেকে Node.js-এ সরানো পুরো সাইট: পাবলিক সাইট, এডমিন প্যানেল, অটোমেশন, PWA, নোটিফিকেশন।
**ডাটাবেস আগেরটাই** — কোনো ডেটা সরাতে বা বদলাতে হয় না (শুধু নতুন টেবিল যোগ হয়, পুরোনো কিছু মোছা হয় না)।

## কী আছে

| অংশ | বিবরণ |
|---|---|
| **পাবলিক সাইট** | হোম (ফোনে এক সারির কার্ড, পিসিতে গ্রিড), পোস্ট ডিটেইল (অ্যাপ-স্টাইল), ক্যাটাগরি, সার্চ, ট্রেন্ডিং, বিজ্ঞাপন, নোটিশ, রিপোর্ট, টিম, সেভড |
| **ডিজাইন** | লাইট (ডিফল্ট) + ডার্ক মোড, স্লাইডিং পেজ-ট্রানজিশন, স্কেলিটন/অ্যানিমেশন, নিজস্ব SVG আইকন |
| **SEO** | হুবহু আগের URL, স্লাগ-রিডিরেক্ট (৩০১), JobPosting/NewsArticle/Breadcrumb স্কিমা, sitemap.xml, robots.txt |
| **PWA** | ম্যানিফেস্ট (আইকন, স্ক্রিনশট, শর্টকাট, শেয়ার), অফলাইন, ছবিসহ ইনস্টল শিট, PWABuilder-রেডি |
| **সেভ / নোটিফিকেশন** | বুকমার্ক (অফলাইনে পড়া যায়), ওয়েব পুশ, ইমেইল (double opt-in), দৈনিক সারসংক্ষেপ, ডেডলাইন রিমাইন্ডার |
| **এডমিন** | ড্যাশবোর্ড, পোস্ট (এডিটর, ছবি, পিডিএফ, লিংক), ক্যাটাগরি, ব্যানার, বিজ্ঞাপন, নোটিশ, **টিম**, রিপোর্ট, অ্যানালিটিকস, ইউজার, সেটিংস, অটোমেশন, নোটিফিকেশন |
| **অটোমেশন** | সোর্স স্ক্র্যাপ → আগে করা কিনা যাচাই (AI ছাড়া) → শুধু নতুনটা AI-তে → খসড়া → আপনাকে মেইল। কখনো নিজে প্রকাশ করে না |

## প্রয়োজন
- Node.js **18.17+** (Hostinger-এ ২০ বা ২২ বেছে নিন)
- MySQL/MariaDB (আপনার বর্তমান ডাটাবেসই)

## Hostinger-এ সাবডোমেইনে টেস্ট (ধাপে ধাপে)

1. **সাবডোমেইন বানান:** hPanel → Domains → Subdomains → যেমন `test.cakricircular.com`।
2. **Node.js অ্যাপ:** hPanel → Websites → (সাবডোমেইন) → **Node.js** → Create application
   - Node version: 20 বা 22
   - Application root: যেখানে ফাইল আপলোড করবেন
   - **Startup file: `server.js`**
3. **ফাইল আপলোড:** এই প্রজেক্টের zip File Manager-এ খুলুন (`node_modules` বাদ — নিচে ধাপ ৬)।
4. **.env বানান:** `.env.example` কপি করে `.env` নাম দিন, মান বসান:
   ```
   DB_HOST=localhost
   DB_NAME=u849068313_Jobs123      # আপনার বর্তমান ডাটাবেস
   DB_USER=...   DB_PASS=...
   SESSION_SECRET=<৩২+ অক্ষরের যেকোনো এলোমেলো লেখা>
   BASE_URL=https://test.cakricircular.com
   UPLOAD_DIR=/home/uXXXX/domains/cakricircular.com/public_html/uploads   # পুরোনো সাইটের uploads — কপি লাগবে না
   TRUST_PROXY=true
   ```
5. **uploads:** উপরের মতো `UPLOAD_DIR` পুরোনো ফোল্ডারে দেখালে কপি লাগবে না। নইলে আপনার `uploads` ফোল্ডার প্রজেক্টের `uploads/`-এ বসান। ৭টি পিডিএফ নেই — `MISSING-FILES.md` দেখুন।
6. **ইনস্টল:** hPanel-এর Node.js পাতায় **NPM Install** চাপুন (বা SSH-এ `npm install --omit=dev`)।
7. **চালু:** **Restart** চাপুন। সাবডোমেইন খুলুন। প্রথম চালুতে নতুন টেবিলগুলো নিজে তৈরি হবে।
8. **এডমিন:** `https://test…/v2admin` — আগের ইউজারনেম/পাসওয়ার্ডেই ঢুকবেন।

### ⚠️ টেস্টের সময় গুরুত্বপূর্ণ সতর্কতা
- **একই ডাটাবেস দুই সাইট ব্যবহার করে।** টেস্টে পোস্ট/সেটিংস বদলালে আসল সাইটেও বদলাবে।
- **অটোমেশন একসাথে দুই সাইটে চালাবেন না** — ডুপ্লিকেট খসড়া হবে। নতুন Node অটোমেশন চালু করার আগে hPanel → Cron Jobs থেকে **পুরোনো PHP cron (`cron.php`) বন্ধ করুন**। টেস্টের সময় চাইলে `.env`-এ `SCHEDULER=false` রাখুন।
- সাবডোমেইন টেস্টে গুগল যেন ইনডেক্স না করে — সেটিংসে মেইনটেন্যান্স নয়, বরং সাবডোমেইনে পাসওয়ার্ড-সুরক্ষা বা `noindex` দিন (hPanel → Password Protect)।

## "Max processes" সমস্যা ও cron
- একটাই Node প্রসেস চলে; অটোমেশন, ইমেইল, রিমাইন্ডার অ্যাপের ভেতরের শিডিউলারে — আলাদা প্রসেস/cron দরকার নেই।
- Hostinger অ্যাপ ঘুমিয়ে গেলে শিডিউলারও থামে। তাই **ঐচ্ছিক** একটা হালকা cron (hPanel → Advanced → Cron Jobs, প্রতি ৫–১০ মিনিটে):
  ```
  curl -fsS "https://test.cakricircular.com/cron/tick?key=<এডমিন → অটোমেশন পাতায় দেখা কী>" > /dev/null
  ```
- ডাটাবেস পুল ছোট (`DB_POOL=4`), ভিজিটর ট্র্যাকিং ব্যাচে, মেইল কিউতে (ঘণ্টায় সীমা), হিপ সীমিত (`MAX_HEAP_MB=256`)।

## অটোমেশন সেটআপ
এডমিন → **অটোমেশন**: OpenAI key ও মডেলের নাম (আগের মানই আছে), সোর্স, দৈনিক সীমা, সমান্তরাল কল (২ প্রস্তাবিত)। **“এখনই চালান”** চেপে লাইভ লগ দেখুন।
ইমেইলের জন্য **নোটিফিকেশন ও ইমেইল** পাতায় SMTP বসান → “পরীক্ষামূলক মেইল”।

> ⚠️ ডাম্পে OpenAI key ও SMTP পাসওয়ার্ড খোলা লেখা ছিল। ফাইলটি শেয়ার হয়েছে বলে চালুর পর দুটোই **বদলে নিন**।

## PWA / PWABuilder / Play Store
- ম্যানিফেস্ট: `/manifest.webmanifest` — আইকন (any + maskable), স্ক্রিনশট (ফোন + পিসি), শর্টকাট, share_target।
- স্ক্রিনশট নতুন করে বানাতে (ডিজাইন বদলালে): `npm i -D playwright-core && node scripts/make-screenshots.mjs https://আপনার-সাইট`
- Android অ্যাপ: pwabuilder.com-এ সাইটের ঠিকানা দিন → Package ID ও SHA-256 fingerprint পাবেন → এডমিন → সেটিংস → “Play Store / Android অ্যাপ”-এ বসালে `/.well-known/assetlinks.json` নিজে তৈরি হবে।

## টেস্ট চালানো (ডেভেলপারদের জন্য)
```bash
TEST_DB_NAME=cc_test DB_USER=… DB_PASS=… npm test     # আলাদা খালি টেস্ট ডাটাবেসে — লাইভ ডেটা ছোঁয় না
```
১০টি ইন্টিগ্রেশন টেস্ট: পাবলিক পেজ, এডমিন, পোস্ট/ছবি/পিডিএফ/স্লাগ, বাল্ক, ব্যানার/টিম/নোটিশ, প্রিমিয়াম, মেইনটেন্যান্স, ইমেইল/পুশ, **অটোমেশন (নকল সোর্স + নকল AI)**, ক্রন।

## ফোল্ডার কাঠামো
```
server.js                 এন্ট্রি (Startup file)
src/
  app.js  config.js  db.js  migrate.js
  core/        settings, cache, auth, bn (বাংলা তারিখ/সংখ্যা), slug, content (স্যানিটাইজ), images (sharp), forms
  ui/          layout, components, icons (SVG sprite)
  modules/
    site/      পাবলিক পেজ: data, pages, routes
    api/       /api/track, /api/report, /api/posts
    admin/     index (রাউটার+লগইন), layout, pages/* (প্রতিটি মডিউল আলাদা ফাইল)
    automation/ engine, source, ai, save, util, log
    notify/    push, mailer, jobs, routes
    scheduler/ scheduler, routes (/cron/tick)
    pwa/       ম্যানিফেস্ট, আইকন, SW
    track/     ভিজিটর/ভিউ ট্র্যাকিং (ব্যাচে)
public/        css, js (app.js, sw.js, admin.js), fonts, screenshots
scripts/       migrate.js, check-uploads.js, make-screenshots.mjs
test/          ইন্টিগ্রেশন টেস্ট
```
