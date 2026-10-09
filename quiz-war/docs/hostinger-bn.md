# Hostinger-এ QUIZ WAR আপলোড করার গাইড (বাংলা)

QUIZ WAR একটি **Node.js** অ্যাপ (রিয়েলটাইম ব্যাটলের জন্য)। তাই সাধারণ "Single/Premium" শেয়ার্ড
হোস্টিং (শুধু PHP/HTML) এ চলবে না। আপনার দুটি অপশন আছে:

| অপশন | কোন প্ল্যান | কেমন চলবে |
|---|---|---|
| **A. Node.js Web App** (সহজ) | Hostinger **Business** বা **Cloud** web hosting (hPanel-এ "Node.js" অপশন থাকে) | পুরো গেম + অ্যাডমিন একসাথে চলে। WebSocket না থাকলে গেম স্বয়ংক্রিয়ভাবে long-polling ব্যবহার করে — কাজ করবে, তবে একটু বেশি লেটেন্সি। |
| **B. VPS** (সবচেয়ে ভালো) | Hostinger **KVM VPS** (KVM 2 বা তার বেশি) | Docker দিয়ে MySQL + Redis + nginx + অটো-ব্যাকআপ সহ পূর্ণ প্রোডাকশন সেটআপ। অনেক প্লেয়ারের জন্য এটাই নিন। |

---

## অপশন A — Business/Cloud প্ল্যানে Node.js Web App

### ধাপ ১: MySQL ডাটাবেস বানান
hPanel → **Websites → Manage → Databases → MySQL Databases**
- ডাটাবেস নাম, ইউজার, পাসওয়ার্ড দিন → Create।
- লিখে রাখুন: ডাটাবেস নাম (যেমন `u123456789_quizwar`), ইউজার (যেমন `u123456789_qw`), পাসওয়ার্ড, আর **হোস্ট**
  (সাধারণত `localhost`; hPanel-এ অন্য হোস্ট দেখালে সেটাই)।

### ধাপ ২: Node.js অ্যাপ তৈরি করে জিপ আপলোড
hPanel → **Websites → Add Website → Node.js Apps** (বা আপনার ওয়েবসাইটের **Node.js** সেকশন)
- **Upload** অপশন বেছে নিয়ে `quiz-war-hostinger.zip` আপলোড করুন।
- Node.js version: **22** (না থাকলে 20)
- Build command: `npm run build`
- Start command / Entry: `npm start` (বা entry file `apps/server/dist/index.js`)
- Root/অ্যাপ ফোল্ডার: জিপের ভেতরের `quiz-war` ফোল্ডার (যেখানে `package.json` আছে)

> জিপে আগে থেকেই বিল্ড করা ফাইল (`dist`) আছে, তাই build ধাপ ফেল করলেও `npm start` চলবে।

### ধাপ ৩: Environment Variables সেট করুন
Node.js অ্যাপের **Environment variables** অংশে জিপের ভেতরের `HOSTINGER-ENV.txt` ফাইলের প্রতিটি লাইন যোগ করুন।
এই ফাইলে আপনার জন্য নতুন **গোপন key আগে থেকে তৈরি** করা আছে। শুধু এগুলো বদলাবেন:
- `yourdomain.com` → আপনার আসল ডোমেইন (সব জায়গায়)
- `DATABASE_URL` → ধাপ ১-এর ইউজার/পাসওয়ার্ড/হোস্ট/ডাটাবেস নাম
- `ADMIN_BOOTSTRAP_EMAIL` → আপনার ইমেইল

⚠️ এই ফাইল কাউকে দেবেন না, GitHub-এ তুলবেন না।

### ধাপ ৪: Deploy / Start
Deploy চাপুন। প্রথমবার চালু হলে অ্যাপ নিজে থেকে:
1. ডাটাবেসে সব টেবিল বানাবে (`MIGRATE_ON_START=true`)
2. আপনার ইমেইল দিয়ে **Super Admin** অ্যাকাউন্ট বানাবে
3. ৫২টি নমুনা প্রশ্ন যোগ করবে (`SEED_SAMPLE_QUESTIONS=true`) — যাতে সাথে সাথে খেলা যায়

### ধাপ ৫: চেক করুন
- গেম: `https://yourdomain.com`
- অ্যাডমিন প্যানেল: `https://yourdomain.com/v2admin` → `HOSTINGER-ENV.txt`-এর অ্যাডমিন ইমেইল ও পাসওয়ার্ড দিয়ে লগইন
- হেলথ চেক: `https://yourdomain.com/health` → `{"ok":true}`

### ধাপ ৬: প্রথম লগইনের পর অবশ্যই করবেন
- Environment থেকে `ADMIN_BOOTSTRAP_PASSWORD` মুছে দিন (অ্যাডমিন একবার তৈরি হয়ে গেছে)।
- অ্যাডমিন প্যানেল → **Questions → Bulk import** দিয়ে নিজের প্রশ্ন CSV/JSON আকারে যোগ করুন
  (CSV কলাম: `category,difficulty,language,text,option_a,option_b,option_c,option_d,correct,explanation,hint,image_url`)।
- চাইলে নমুনা প্রশ্ন Disable/Delete করুন, আর `SEED_SAMPLE_QUESTIONS` মুছে দিন।
- SSL: hPanel → **Security → SSL** থেকে ফ্রি SSL চালু আছে কিনা দেখুন (HTTPS ছাড়া Passkey চলবে না)।

---

## অপশন B — Hostinger VPS (Docker)

1. hPanel → **VPS** → OS হিসেবে **Ubuntu 24.04 with Docker** বেছে নিন।
2. ডোমেইনের DNS-এ `A` রেকর্ড: `yourdomain.com` এবং `api.yourdomain.com` → VPS-এর IP।
3. SSH দিয়ে ঢুকে:
   ```bash
   apt install -y unzip certbot
   unzip quiz-war-hostinger.zip && cd quiz-war
   cp .env.example .env && nano .env      # HOSTINGER-ENV.txt থেকে মান বসান, DATABASE_URL compose নিজেই দেয়
   certbot certonly --standalone -d yourdomain.com -d api.yourdomain.com
   mkdir -p deploy/certs && cp /etc/letsencrypt/live/yourdomain.com/{fullchain,privkey}.pem deploy/certs/
   sed -i 's/quizwar.app/yourdomain.com/g' deploy/nginx.conf
   cd deploy && MYSQL_PASSWORD=শক্ত_পাসওয়ার্ড MYSQL_ROOT_PASSWORD=আরো_শক্ত docker compose up -d --build
   ```
4. প্রতিদিন অটো ডাটাবেস ব্যাকআপ হবে (`backups` volume)। বিস্তারিত: `docs/deployment.md`, `docs/backup.md`।

---

## গুগল লগইন, পাসকি, ইমেইল (SMTP) ও পুশ — ধাপে ধাপে

কোডে সব ফিচার আছে, কিন্তু এগুলোর চাবি (key) শুধু আপনিই দিতে পারবেন। চাবি না দিলে বাটন/ফিচার লুকানো থাকে।
**কোনটা চালু আর কোনটা বাকি, দেখুন: এডমিন → App settings → "Connections · সংযোগ অবস্থা" কার্ড।**
সব মান বসাবেন Hostinger → Node.js অ্যাপ → **Environment variables**-এ, তারপর **Restart**। কোনো পাসওয়ার্ড/key চ্যাটে বা GitHub কোডে দেবেন না।

### ১) ইমেইল (SMTP) — Gmail দিয়ে (সবচেয়ে সহজ)
1. যে Gmail থেকে মেইল যাবে (যেমন support.quizwarbd@gmail.com) তাতে **2-Step Verification** চালু করুন।
2. https://myaccount.google.com/apppasswords → নাম দিন "QUIZ WAR" → ১৬ অক্ষরের **App Password** কপি করুন।
3. Hostinger env-এ বসান:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_USER=support.quizwarbd@gmail.com
   SMTP_PASS=<১৬ অক্ষরের app password>
   MAIL_FROM=QUIZ WAR Bangladesh <support.quizwarbd@gmail.com>
   ```
4. Restart → এডমিন → App settings → Connections → **Send test email** দিয়ে পরীক্ষা করুন।
   (Hostinger-এর নিজের ইমেইল হলে: `SMTP_HOST=smtp.hostinger.com`, ইউজার = পুরো ইমেইল, পাস = ইমেইলের পাসওয়ার্ড।)

এরপর স্বাগত ইমেইল, ইমেইল যাচাই, পাসওয়ার্ড রিসেট ও অ্যাক্টিভিটি ইমেইল যাবে।

### ২) অ্যাপের স্থায়ী সাইনিং কী (গুগল লগইন ও পাসকি অ্যাপে চালাতে **বাধ্যতামূলক**)
অ্যাপে গুগল লগইন ও পাসকি অ্যাপের সার্টিফিকেটের ফিঙ্গারপ্রিন্টের সাথে বাঁধা। কী না থাকলে প্রতি বিল্ডে নতুন অস্থায়ী কী হয়, তাই কাজ করবে না।
1. যেকোনো কম্পিউটারে (Java/Android Studio থাকলে) একবার চালান:
   ```
   keytool -genkeypair -v -keystore quizwar-upload.jks -alias quizwar -keyalg RSA -keysize 2048 -validity 10000
   ```
   পাসওয়ার্ড দিন ও মনে রাখুন। ফাইলটি **দুই জায়গায় ব্যাকআপ** রাখুন (হারালে Play Store-এ আপডেট দিতে সমস্যা হবে)।
2. `base64 -w0 quizwar-upload.jks` (Windows: `certutil -encode`) এর আউটপুট কপি করুন।
3. GitHub → রিপো → Settings → Secrets and variables → Actions → **New repository secret**:
   `QW_UPLOAD_KEYSTORE_BASE64`, `QW_KEYSTORE_PASSWORD`, `QW_KEY_ALIAS` (= quizwar), `QW_KEY_PASSWORD`।
4. পরের বিল্ডে APK সাইন হবে, আর রিলিজ পেজে (https://github.com/AHOSHAN-HABIB-NAYON/PROFILE/releases/tag/app-latest) একটা টেবিলে **SHA-1, SHA-256 আর apk-key-hash** দেখাবে — নিচের ধাপে লাগবে।

### ৩) গুগল লগইন
1. https://console.cloud.google.com → নতুন প্রজেক্ট "QUIZ WAR"।
2. **APIs & Services → OAuth consent screen**: External, অ্যাপের নাম, সাপোর্ট ইমেইল, প্রাইভেসি লিংক `https://quizwar.webtecit.com/legal/privacy` → **Publish app**।
3. **Credentials → Create credentials → OAuth client ID**:
   - Type **Web application** → Authorized JavaScript origins: `https://quizwar.webtecit.com` → তৈরি হলে **Client ID** কপি করুন।
   - আবার **Android** টাইপ → Package: `app.quizwar.bd` → SHA-1: রিলিজ পেজের SHA-1 (Play Store-এ দিলে Play Console → App signing-এর SHA-1 দিয়ে আরেকটা Android client বানান)।
4. Hostinger env: `GOOGLE_CLIENT_ID=<Web client ID>` → Restart। ওয়েবসাইট আর অ্যাপ দুটোতেই "Google দিয়ে লগইন" বাটন আসবে (অ্যাপে ব্রাউজারে না গিয়ে ফোনের নিজের অ্যাকাউন্ট লিস্ট থেকে)।

### ৪) পাসকি (আঙুলের ছাপ/ফেস দিয়ে লগইন)
- ওয়েবসাইটে ইতিমধ্যে চালু: `WEBAUTHN_RP_ID=quizwar.webtecit.com`, `WEBAUTHN_ORIGIN=https://quizwar.webtecit.com`।
  প্লেয়ার আগে **সেটিংস → পাসকি যোগ করুন** করবে, তারপর লগইন পেজে "পাসকি দিয়ে লগইন" কাজ করবে।
- অ্যাপে চালাতে (ধাপ ২ শেষ হলে) Hostinger env:
  ```
  ANDROID_SHA256_CERT_FINGERPRINTS=<রিলিজ পেজের SHA-256>
  WEBAUTHN_ORIGIN=https://quizwar.webtecit.com,android:apk-key-hash:<রিলিজ পেজের apk-key-hash>
  ```
  এতে `https://quizwar.webtecit.com/.well-known/assetlinks.json` অ্যাপকে চিনবে। Play Store-এর সাইনিং কী-র SHA-256 থাকলে কমা দিয়ে সেটাও যোগ করুন।

### ৫) পুশ নোটিফিকেশন
- **ওয়েবসাইট/PWA:** কম্পিউটারে `npx web-push generate-vapid-keys` → `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` বসান।
- **অ্যান্ড্রয়েড অ্যাপ:** Firebase কনসোল → Project settings → Service accounts → **Generate new private key** → JSON ফাইলের পুরো লেখা এক লাইনে `FCM_SERVICE_ACCOUNT_JSON`-এ বসান; আর নিচের "পুশ নোটিফিকেশন চালু করা (Firebase)" অংশ অনুযায়ী GitHub secret দিন।

সেট না করলেও গেম চলবে — শুধু ঐ ফিচার লুকানো থাকবে।

## সমস্যা হলে
- **অ্যাপ চালু হচ্ছে না:** Node.js অ্যাপের Logs দেখুন। `Invalid environment configuration` → কোনো env ভুল/বাদ।
  `JWT_SECRET` ও `ADMIN_JWT_SECRET` অন্তত ৩২ অক্ষরের এবং আলাদা হতে হবে; `PUBLIC_API_URL` অবশ্যই `https://` দিয়ে শুরু।
- **ডাটাবেস কানেক্ট হচ্ছে না:** `DATABASE_URL`-এ পাসওয়ার্ডে `@ : / #` থাকলে URL-encode করুন (যেমন `@` → `%40`)।
- **লগইন করে আবার লগআউট হয়ে যাচ্ছে:** `PUBLIC_API_URL`, `PUBLIC_WEB_URL`, `CORS_ORIGINS` তিনটাই আপনার আসল `https://` ডোমেইন কিনা দেখুন।

---

## AI দিয়ে প্রশ্ন বানানো (OpenAI)

1. Hostinger → Node.js অ্যাপ → **Environment variables**-এ যোগ করুন: `OPENAI_API_KEY=sk-...` (আপনার OpenAI কী)। তারপর অ্যাপ **Restart** করুন।
   - কী শুধু সার্ভারে থাকে; অ্যাপ বা ওয়েবসাইটে কখনো যায় না। চ্যাটে বা কাউকে কী দেবেন না।
2. অ্যাডমিন প্যানেল → **AI Generator** → **⚙️ Settings**:
   - **Model**: ডিফল্ট `gpt-5.6-luna`। যেকোনো সময় অন্য মডেলের নাম লিখে Save করলেই বদলে যাবে।
   - **Test connection** চাপলে কী আর মডেল ঠিক আছে কিনা দেখাবে।
   - **Master instructions**: AI-কে দেওয়া পেশাদার নির্দেশনা (চাকরির পরীক্ষার মানের প্রশ্ন, ওয়েবে যাচাই, সঠিক বাংলা, উৎস লিংক ইত্যাদি)। চাইলে বদলাতে পারেন, **Reset to default** দিয়ে আগের অবস্থায় ফেরানো যায়।
   - **Syllabus guide per category**: প্রতিটি ক্যাটাগরির সিলেবাস (যেমন BCS প্রিলির বিষয়গুলো)।
3. **✨ Generate** ট্যাবে ক্যাটাগরি, কয়টা প্রশ্ন (১–২০০), কঠিনতা, ভাষা আর চাইলে বিষয় (যেমন "মুক্তিযুদ্ধ") দিয়ে **Generate** চাপুন। কাজ ব্যাকগ্রাউন্ডে চলে; পেজ বন্ধ করলেও থামে না।
4. **✅ Review queue**-তে প্রশ্নগুলো সঠিক উত্তর (সবুজ), ব্যাখ্যা আর উৎস লিংক সহ আসবে। **Approve** করলে খেলায় যাবে, **Reject** করলে বাদ। একসাথে অনেকগুলো সিলেক্ট করে Approve করা যায়।
   - আগে থেকে থাকা বা একই রকম প্রশ্ন নিজে থেকেই বাদ পড়ে।
5. **Question bank** টেবিলে প্রতিটি ক্যাটাগরিতে কতগুলো প্রশ্ন আছে দেখা যায়; ৩০০-এর কম হলে "low" দেখায়। লক্ষ্য: মাসে ১৫০০–২০০০+ নতুন প্রশ্ন।

## প্রশ্ন রিপিট হয় না
প্রতিটি প্লেয়ার একটি ক্যাটাগরির **সব** প্রশ্ন শেষ না করা পর্যন্ত কোনো প্রশ্ন দ্বিতীয়বার পায় না, আর প্রশ্নগুলো এলোমেলোভাবে আসে। সব শেষ হলে নতুন রাউন্ড শুরু হয় — যেটা সবচেয়ে আগে দেখেছিল সেটা আগে আসে।

## ম্যাচ ছেড়ে গেলে জরিমানা
- ম্যাচ শুরু হওয়ার পর কেউ বের হয়ে গেলে, অ্যাপ বন্ধ করলে বা নেট কেটে গিয়ে ২০ সেকেন্ডে না ফিরলে কয়েন ও XP কাটা হয়। কাটা কয়েন প্রতিপক্ষ পায়।
- বের হওয়ার আগে অ্যাপ পরিষ্কার করে দেখায় কত কয়েন/XP কাটা যাবে।
- কেউ অনলাইনে থেকেও উত্তর না দিলে (AFK): ২টি প্রশ্ন মিস করলে সতর্কবার্তা, ৩টি মিস করলে ম্যাচ থেকে বের করে দেওয়া হয় ও জরিমানা হয়। খেলা থেমে থাকে না — সময় শেষ হলেই পরের প্রশ্ন আসে।
- অ্যাডমিন → **Game settings → penalties**: কয়েন, XP, প্রতিপক্ষকে দেবে কিনা, AFK সীমা — সব বদলানো যায়।

## মিশন ও রিওয়ার্ড Claim
- অ্যাপে **Shop → 🎯 মিশন ও রিওয়ার্ড** (হোম পেজেও কার্ড আছে)। দৈনিক, সাপ্তাহিক আর এককালীন মিশন।
- শর্ত পূরণ হলে নোটিফিকেশন আসে "মিশন সম্পূর্ণ! রিওয়ার্ড Claim করুন" — Claim চাপলে কয়েন/XP যোগ হয়।
- অ্যাডমিন → **Missions**: নতুন মিশন বানানো, শর্ত (ম্যাচ খেলা, জেতা, সঠিক উত্তর, পারফেক্ট ম্যাচ, বন্ধুর সাথে খেলা ইত্যাদি), লক্ষ্য আর পুরস্কার ঠিক করা যায়।
- কয়েন শুধু খেলে অর্জন করা যায়, কেনা যায় না — Play Store নীতিমালা মেনে।

## পুশ নোটিফিকেশন চালু করা (Firebase) — ঐচ্ছিক

1. https://console.firebase.google.com এ একটি প্রজেক্ট খুলুন → Android অ্যাপ যোগ করুন: `app.quizwar.bd` (সাইনিং কী না দিলে টেস্ট বিল্ডের জন্য `app.quizwar.bd.debug`-ও যোগ করুন)।
2. `google-services.json` ডাউনলোড করুন। ফাইলটি **রিপোতে রাখবেন না**।
3. ফাইলটিকে base64 করুন (`base64 -w0 google-services.json`) এবং GitHub → Settings → Secrets → Actions-এ `QW_GOOGLE_SERVICES_JSON_BASE64` নামে সেভ করুন।
4. পরের বিল্ডে APK-তে পুশ চালু হবে। Secret না থাকলে অ্যাপ ঠিকমতো চলবে, শুধু পুশ লুকানো থাকবে।

## রেজাল্ট কার্ড গ্যালারিতে সেভ

Android 10+ এ কোনো স্টোরেজ/ছবির পারমিশন ছাড়াই ছবি `Pictures/QUIZ WAR` ফোল্ডারে সেভ হয় (Play Store নীতিমালা অনুযায়ী)। পুরনো ফোনে শেয়ার শিট খোলে।
অ্যাপ ক্যামেরা, স্টোরেজ বা মিডিয়া পারমিশন চায় না — QR স্ক্যান হয় Google-এর কোড স্ক্যানার দিয়ে।
