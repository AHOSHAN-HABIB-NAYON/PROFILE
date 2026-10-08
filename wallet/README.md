# জমা ওয়ালেট — ওয়েবসাইট + API + Android অ্যাপ

টাকা জমা রাখার একটা **ডেমো ওয়ালেট**। ওয়েবসাইট আর Android অ্যাপ দুটোই একই API আর একই ডেটাবেস ব্যবহার করে, তাই একটায় যা করবেন অন্যটায় সাথে সাথে দেখা যাবে।

> ⚠️ **এটা পরীক্ষার জন্য।** "টাকা যোগ" বা "টাকা তোলা" চাপলে শুধু ডেটাবেসের সংখ্যা বদলায়, আসল বিকাশ বা নগদে কোনো টাকা যায় না। আসল টাকার সেবা চালু করতে payment gateway (যেমন SSLCommerz, bKash PGW) আর বাংলাদেশ ব্যাংকের অনুমোদন লাগবে।

```
wallet/
├── server/          ← ওয়েবসাইট + API (PHP, MySQL, jQuery AJAX)
│   ├── index.php        লগইন পেজ
│   ├── dashboard.php    ড্যাশবোর্ড
│   ├── api.php          সব API (/api/...)
│   ├── app/             PHP কোড (ব্রাউজার থেকে দেখা যায় না)
│   ├── assets/          CSS, JS, ফন্ট
│   ├── database/schema.sql
│   ├── config.sample.php
│   └── tests/api_test.php
└── android/         ← Android অ্যাপ (Kotlin + Jetpack Compose)
```

## ফিচার

- ইমেইল + পাসওয়ার্ড দিয়ে অ্যাকাউন্ট খোলা ও লগইন
- **Google লগইন:** ওয়েবসাইটে Google বাটন, আর অ্যাপে ফোনের নিজস্ব Google অ্যাকাউন্ট শিট আসে (ব্রাউজার খোলে না)
- **পাসকি লগইন:** আঙুলের ছাপ বা ফেস দিয়ে, পাসওয়ার্ড ছাড়া। অ্যাপে ফোনের নিজস্ব শিট আসে।
- টাকা যোগ, ইমেইল দিয়ে টাকা পাঠানো (পাঠানোর আগে প্রাপকের নাম দেখায়), টাকা তোলা
- লেনদেনের তালিকা, মাসের হিসাব, ব্যালেন্স লুকানোর বোতাম
- পুরোটা বাংলায়, টাকার অঙ্ক বাংলা সংখ্যায় (১,২৫,০০০.০০)

## নিরাপত্তা

- পাসওয়ার্ড `password_hash` (bcrypt) দিয়ে রাখা। বারবার ভুল পাসওয়ার্ড দিলে লগইন সাময়িক বন্ধ হয়।
- ওয়েবসাইটের সেশন `HttpOnly` + `SameSite=Strict` কুকিতে, আর CSRF থেকে সুরক্ষিত। অ্যাপের টোকেন Android Keystore দিয়ে এনক্রিপ্ট করে রাখা।
- Google টোকেন সার্ভারে Google-এর public key দিয়ে যাচাই করা হয়, আর পাসকি সার্ভারে WebAuthn নিয়মে যাচাই করা হয়।
- টাকা পয়সায় (integer) হিসাব হয়, তাই দশমিকের কোনো ভুল হয় না। প্রতিটা লেনদেন database transaction আর row lock দিয়ে চলে, তাই একসাথে অনেক অনুরোধ এলেও ব্যালেন্স কখনো মাইনাস হয় না।
- একই অনুরোধ দুবার গেলে (যেমন নেট চলে গিয়ে আবার চাপলে) টাকা দুবার কাটে না।
- ওয়েবসাইটে Content-Security-Policy চালু, আর `config.php` ও `app/` ফোল্ডার ব্রাউজার থেকে খোলা যায় না।

---

## ধাপ ১: ওয়েবসাইট চালু করা (Hostinger / cPanel)

দরকার: **PHP 8.1 বা নতুন**, **MySQL 5.7+ বা MariaDB 10.3+**, আর **HTTPS (SSL)**। পাসকি আর Google লগইন HTTPS ছাড়া চলে না।

1. হোস্টিং প্যানেলে একটা **MySQL ডেটাবেস** আর একটা **ইউজার** তৈরি করুন। নাম আর পাসওয়ার্ড লিখে রাখুন।
2. **phpMyAdmin** খুলে ওই ডেটাবেস বেছে নিন, তারপর **Import** থেকে `server/database/schema.sql` ফাইলটা দিন।
3. `server/` ফোল্ডারের **ভেতরের সব ফাইল** `public_html`-এ (অথবা যে ফোল্ডারে ডোমেইন যুক্ত আছে সেখানে) আপলোড করুন। লুকানো `.htaccess` ফাইলগুলোও যেন যায়।
4. `config.sample.php`-এর একটা কপি বানিয়ে নাম দিন **`config.php`**, তারপর পূরণ করুন:
   - `base_url`: যেমন `https://joma.yourdomain.com`
   - `db`: ধাপ ১-এর ডেটাবেসের নাম, ইউজার আর পাসওয়ার্ড
   - `webauthn.rp_id`: শুধু ডোমেইনটা, যেমন `joma.yourdomain.com`
   - `google_client_id`: ধাপ ২-এ পাবেন
5. ব্রাউজারে আপনার ঠিকানা খুলুন। লগইন পেজ এলে কাজ হয়ে গেছে। একটা অ্যাকাউন্ট খুলে টাকা যোগ করে দেখুন।
6. `https://আপনার-ডোমেইন/.well-known/assetlinks.json` খুলে দেখুন JSON আসছে কিনা। অ্যাপের পাসকি এটার উপর নির্ভর করে।

## ধাপ ২: Google লগইন চালু করা

1. **console.cloud.google.com**-এ গিয়ে একটা প্রজেক্ট খুলুন।
2. **APIs & Services → OAuth consent screen**: অ্যাপের নাম, ইমেইল দিন, আর User type **External** বেছে নিন।
3. **Credentials → Create credentials → OAuth client ID** থেকে দুটো client তৈরি করুন:
   - **Web application**
     - Authorized JavaScript origins: `https://আপনার-ডোমেইন`
     - যে **Client ID** পাবেন (`....apps.googleusercontent.com`) সেটা `config.php`-এর `google_client_id`-এ আর `android/wallet.properties`-এর `google_web_client_id`-এ বসান।
   - **Android**
     - Package name: `com.ahoshan.joma`
     - SHA-1: `B9:9E:84:49:C4:80:99:9C:B0:18:20:99:7E:62:CF:ED:1E:48:FE:B1`
     - (এটা টেস্ট কী-এর ফিঙ্গারপ্রিন্ট। এই client-এর ID কোথাও বসাতে হয় না, শুধু তৈরি থাকলেই হবে।)

## ধাপ ৩: অ্যাপ বানানো

1. `android/wallet.properties` ফাইলে `base_url` (আপনার ওয়েবসাইটের ঠিকানা) আর `google_web_client_id` বসান।
2. GitHub-এ push করুন। GitHub নিজেই APK বানিয়ে **Releases**-এ `joma-wallet.apk` রেখে দেবে।
3. ফোনে APK ইনস্টল করে লগইন করুন। তারপর **সেটিংস → নতুন পাসকি যোগ করুন** চাপুন, আর পরের বার শুধু আঙুলের ছাপ দিয়ে লগইন করুন।

> অ্যাপের পাসকি তখনই কাজ করবে যখন `assetlinks.json`-এ অ্যাপের SHA-256 ফিঙ্গারপ্রিন্ট থাকবে। `config.sample.php`-এ টেস্ট কী-এর ফিঙ্গারপ্রিন্ট আগে থেকেই বসানো আছে।

## Play Store-এ দেওয়ার আগে

- `android/app/joma-test.keystore` হলো **টেস্ট কী**, যেটা সবার জন্য খোলা। Play Store-এ দেওয়ার আগে নিজের গোপন কী বানাতে হবে।
- নতুন কী-এর এবং Play Console-এর **App signing key**-এর SHA-256 দুটোই `config.php`-এর `android_cert_sha256`-এ যোগ করুন।
- Google Cloud-এর Android client-এও নতুন কী-এর SHA-1 যোগ করুন।

---

## নিজের কম্পিউটারে চালানো (ডেভেলপারদের জন্য)

```bash
cd wallet/server
mysql -e "CREATE DATABASE wallet CHARACTER SET utf8mb4"
mysql wallet < database/schema.sql
cp config.sample.php config.php      # base_url = http://localhost:8080, rp_id = localhost
php -S localhost:8080 router.php     # তারপর http://localhost:8080 খুলুন
```

API টেস্ট চালানো:

```bash
php tests/api_test.php http://localhost:8080 /path/to/jwks-dir
```

এই টেস্ট নিজেই Google টোকেন বানিয়ে আর পাসকি ডিভাইসের অভিনয় করে প্রায় ৬০টা জিনিস যাচাই করে। তার মধ্যে আছে নকল টোকেন, একই অনুরোধ আবার পাঠানো, আর একসাথে ১০টা টাকা পাঠানোর অনুরোধ।

## API এক নজরে

সব উত্তর JSON-এ আসে। ভুল হলে উত্তর হয় `{"error": {"code", "message"}}`, যেখানে message বাংলায়। অ্যাপ `X-Client: android` হেডার পাঠালে সার্ভার কুকির বদলে `token` দেয়, পরে সেটা `Authorization: Bearer <token>` হিসেবে পাঠাতে হয়।

| Method | Path | কাজ |
|---|---|---|
| POST | `/api/auth/register` | `name, email, password` দিয়ে অ্যাকাউন্ট খোলা |
| POST | `/api/auth/login` | `email, password` দিয়ে লগইন |
| POST | `/api/auth/google` | `id_token` দিয়ে Google লগইন |
| POST | `/api/auth/passkey/options` | পাসকি লগইনের challenge |
| POST | `/api/auth/passkey/verify` | `challenge_id, credential` যাচাই করে লগইন |
| POST | `/api/auth/logout` | লগআউট |
| GET | `/api/me` | নিজের তথ্য |
| GET | `/api/wallet` | ব্যালেন্স আর মাসের হিসাব |
| GET | `/api/transactions?before=&limit=` | লেনদেনের তালিকা (পাতা ধরে) |
| POST | `/api/wallet/deposit` | `amount, method, idempotency_key` দিয়ে টাকা যোগ |
| POST | `/api/wallet/withdraw` | `amount, method, idempotency_key` দিয়ে টাকা তোলা |
| POST | `/api/wallet/transfer` | `to_email, amount, note, idempotency_key` দিয়ে টাকা পাঠানো |
| GET | `/api/users/lookup?email=` | প্রাপকের নাম দেখা |
| GET | `/api/passkeys` | পাসকির তালিকা |
| POST | `/api/passkeys/options` | নতুন পাসকির challenge |
| POST | `/api/passkeys` | `challenge_id, credential, name` দিয়ে পাসকি সেভ |
| DELETE | `/api/passkeys/{id}` | পাসকি মুছে ফেলা |
| GET | `/.well-known/assetlinks.json` | Android অ্যাপকে এই ডোমেইনের সাথে যুক্ত করে |
