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

## ঐচ্ছিক ফিচার চালু করা
| ফিচার | কী লাগবে | কোথায় সেট |
|---|---|---|
| Email verification / password reset | SMTP (Hostinger Email-এর SMTP দিয়েও হবে: `smtp.hostinger.com:465`) | `SMTP_URL=smtps://you%40yourdomain.com:পাসওয়ার্ড@smtp.hostinger.com:465`, `MAIL_FROM` |
| Google Login | Google Cloud OAuth Client ID | `GOOGLE_CLIENT_ID` (docs/deployment.md দেখুন) |
| Web Push notification | VAPID key (`npx web-push generate-vapid-keys`) | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` |
| Android push | Firebase | `FCM_SERVICE_ACCOUNT_JSON` (docs/android-release.md) |

সেট না করলেও গেম চলবে — ইমেইল সার্ভার লগে প্রিন্ট হবে, Google বাটন লুকানো থাকবে।

## সমস্যা হলে
- **অ্যাপ চালু হচ্ছে না:** Node.js অ্যাপের Logs দেখুন। `Invalid environment configuration` → কোনো env ভুল/বাদ।
  `JWT_SECRET` ও `ADMIN_JWT_SECRET` অন্তত ৩২ অক্ষরের এবং আলাদা হতে হবে; `PUBLIC_API_URL` অবশ্যই `https://` দিয়ে শুরু।
- **ডাটাবেস কানেক্ট হচ্ছে না:** `DATABASE_URL`-এ পাসওয়ার্ডে `@ : / #` থাকলে URL-encode করুন (যেমন `@` → `%40`)।
- **লগইন করে আবার লগআউট হয়ে যাচ্ছে:** `PUBLIC_API_URL`, `PUBLIC_WEB_URL`, `CORS_ORIGINS` তিনটাই আপনার আসল `https://` ডোমেইন কিনা দেখুন।
