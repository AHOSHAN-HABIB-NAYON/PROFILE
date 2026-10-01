# Premium Aura — সম্পূর্ণ সেটআপ গাইড (বাংলা)

> এই গাইডে কোনো গোপন key বা পাসওয়ার্ড লেখা নেই। সেগুলো শুধু hPanel আর অ্যাডমিন প্যানেলে বসাবেন।

---

## ১. প্রথমবার ইনস্টল (Hostinger Node.js)

1. **hPanel → Websites → Add Website → Node.js App**
2. **Upload** অপশনে `premium-aura.zip` দিন।
3. সেটিং:
   - **Node version:** 22 (অন্তত 18)
   - **Entry file:** `server.js`
   - **Build command:** লাগবে না (দিলে `npm run build`)
   - **Start command:** `npm start`
4. **Databases → MySQL Databases**-এ একটা ডাটাবেস আর ইউজার বানান। নাম, ইউজার আর পাসওয়ার্ড লিখে রাখুন।
5. **Environment Variables**-এ নিচের ২ নম্বর অংশের ভেরিয়েবলগুলো দিন।
6. **Deploy** করুন। প্রথমবার সাইট খুললে **Installer** আসবে। সেখানে ডাটাবেস, অ্যাডমিন অ্যাকাউন্ট আর সাইটের নাম দিন।
7. ইনস্টল শেষ হলে Environment Variables-এ `APP_INSTALLED=1` যোগ করে আবার deploy করুন।

---

## ২. Environment Variables

| নাম | কী দেবেন |
|---|---|
| `NODE_ENV` | `production` |
| `APP_URL` | `https://panel.oryzenx.com` (আপনার ডোমেইন) |
| `APP_INSTALLED` | `1` (ইনস্টলের পরে) |
| `DB_HOST` | Hostinger-এর দেওয়া host (সাধারণত `localhost`) |
| `DB_PORT` | `3306` |
| `DB_NAME` / `DB_USER` / `DB_PASSWORD` | আপনার ডাটাবেসের তথ্য |
| `SESSION_SECRET` | ৩২+ অক্ষরের লম্বা র‍্যান্ডম লেখা |
| `ENCRYPTION_KEY` | (ঐচ্ছিক) আরেকটা ৩২+ অক্ষরের লম্বা র‍্যান্ডম লেখা। না দিলে `SESSION_SECRET` ব্যবহার হয় |
| `TRUST_PROXY` | `1` (Hostinger-এর মতো proxy-র পেছনে) |

⚠️ **`SESSION_SECRET` আর `ENCRYPTION_KEY` কখনো বদলাবেন না, আর কোথাও কপি করে রেখে দিন।**
**চালু সাইটে আগে `ENCRYPTION_KEY` না থাকলে এখন নতুন করে যোগ করবেন না।** তাহলে আগের সব key অকেজো হয়ে যাবে।
এগুলো বদলালে বা হারালে সব API key, SMTP পাসওয়ার্ড আর Google Secret অকেজো হয়ে যাবে।

---

## ৩. আপডেট করা (নতুন zip এলে)

1. **(পরামর্শ)** hPanel → phpMyAdmin → আপনার DB → **Export** দিয়ে ব্যাকআপ নিন।
2. hPanel → আপনার Node.js অ্যাপ → **Settings and redeploy**
3. নতুন `premium-aura.zip` আপলোড করুন → **Save and redeploy**
4. চালু হওয়ার সময় ডাটাবেসের নতুন পরিবর্তন নিজে থেকে বসে যায়। কোনো ডাটা মোছে না।
5. ফোনের অ্যাপ (PWA) পুরো বন্ধ করে আবার খুলুন।

---

## ৪. API প্রোভাইডার সেটআপ

**Admin → API Management**-এ প্রতিটা প্রোভাইডারের **Edit (✏️)** খুলে নিচের মতো দিন। তারপর:
**Save → Health → Poll now → Logs দেখুন → সুইচ ON**

> API key সবসময় **"API key / token"** ঘরে দেবেন। **".env variable"** ঘর খালি রাখবেন।

### 2oo9 Cloud
| ঘর | মান |
|---|---|
| Provider | 2oo9 Cloud |
| Base URL | `https://api.2oo9.cloud/MXS47FLFX0U/tnevs/@public/api` |
| Endpoint | `/success-otp` |
| Method | GET |
| Authentication | **API key header** |
| Header name | `mauthapi` |
| Records path | `data.otps` |
| Polling interval | `10` |

- key পাবেন 2oo9 (voltxsms)-এর **Profile** পেজে। ওদের অ্যাডমিন আগে API access চালু না করলে key পাবেন না।
- এই API শুধু **2oo9-এ আপনার অ্যাকাউন্টে নেওয়া নাম্বারের** OTP দেয়।

### ThirdWave
| ঘর | মান |
|---|---|
| Base URL | `https://clients.thirdwave.im` |
| Endpoint | `/api/v1/traffic` |
| Authentication | **Bearer token** |
| Records path | `data` |

ঘরের নাম (`destinationNumber`, `messageBody`, `sourceAddress`) সিস্টেম নিজে চেনে, Mapping লাগে না।

### TelerouteX
| ঘর | মান |
|---|---|
| Base URL | `https://server.teleroutex.com` |
| Endpoint | `/api/message-data-record/viewstats` |
| Authentication | **Query token** |
| Parameter name | `apiKey` |
| Records path | `data.docs` |

### Lamix
| ঘর | মান |
|---|---|
| Base URL | `https://panel.lamix.org` |
| Endpoint | `/api/v1/messages` |
| Authentication | **Query token** |
| Parameter name | `token` |
| Polling interval | `15` বা `30` (৫ দিলে Lamix "HTTP 429" দেয়) |

### EnterpriseSMS
| ঘর | মান |
|---|---|
| Base URL | `https://www.enterprisesms.site` |
| Endpoint | `/api/export` |
| Authentication | **Query token** |
| Parameter name | `token` |
| Records path | `data` |

### Nexor IPRN (Add provider দিয়ে নতুন যোগ করতে হয়)
| ঘর | মান |
|---|---|
| Provider | **Generic JSON (field mapping)** |
| Base URL | `https://nexor-iprn.com` |
| Endpoint | `/api/sms/viewstats` |
| Authentication | **Query token** |
| Parameter name | `token` |
| Query parameters (JSON) | `{"records":100}` (Nexor-এর "JSON objects" ফরম্যাটের প্যারামিটারও যোগ করুন) |

### কোনো API-তে OTP না এলে
1. **Logs** খুলুন। "invalid" লেখা থাকলে পাশে কারণ আর রেকর্ডের ঘরের নাম লেখা থাকে।
2. **Mapping → Load last API response** চাপুন। API-র আসল JSON দেখাবে।
3. Mapping-এ নাম্বারের ঘরটা **resource**-এ আর মেসেজের ঘরটা **message**-এ লিখে **Save mapping** করুন।
4. **Preview normalization** চাপুন। `"ok": true` দেখালে ঠিক আছে।

- "**not in system**" বা "**unlisted**" মানে নাম্বারটা সাইটে ইমপোর্ট করা নেই। OTP তবু OTP পেজে দেখাবে, তবে কারো Get Number-এ যাবে না।
- "**HTTP 429**" মানে API বলছে ধীরে চলতে। Polling interval বাড়ান। সিস্টেম নিজেও কিছুক্ষণ বিরতি নেয়।

---

## ৫. নাম্বার (রেঞ্জ) সেটআপ — Admin → Access

- **New service:** দেশ (`IQ`), পতাকা (`iq`), অ্যাপ (`WhatsApp`), কোড (`WS`) দিন।
  - **"Show numbers with + on Get Number"** সুইচ ON করলে ইউজার নাম্বার `+` সহ দেখবে।
- **নাম্বার যোগ করা:** কার্ডের **Add** (হাতে লিখে) অথবা **Import** ট্যাবে TXT/CSV/XLSX (TXT হলে প্রতি লাইনে একটা নাম্বার, আর "Import into"-তে রেঞ্জ বেছে নিন)।
- **পুরনো নাম্বার বদলানো:** কার্ডের **Replace**-এ নতুন ফাইল দিন। পুরনো নাম্বার মুছে নতুনগুলো বসে, রেঞ্জ থেকে যায়।
- **শুধু মোছা:** **Clear** চাপুন।
- কেউ ঠিক তখন কোনো নাম্বার ব্যবহার করলে সেটা তার কাজ শেষ হওয়া পর্যন্ত চলবে, তারপর সরে যাবে।
- **Rate limits** ট্যাবে ফ্রি ইউজারের লিমিট (ঘণ্টায় ৫০, দিনে ২০০) বদলানো যায়।

---

## ৬. ইমেইল (SMTP) — Admin → SMTP

ভেরিফিকেশন, পাসওয়ার্ড রিসেট, অ্যাকাউন্ট অ্যাপ্রুভাল আর 2FA কোডের ইমেইল যেতে এটা লাগে।

| ঘর | Gmail দিয়ে করলে |
|---|---|
| Host | `smtp.gmail.com` |
| Port | `587` |
| Encryption | TLS |
| Username | আপনার Gmail |
| Password | Gmail-এর **App Password** (Google Account → Security → 2-Step Verification চালু → App passwords) |
| From email | একই Gmail |

শেষে **Send Test Email** দিয়ে পরীক্ষা করুন। Hostinger-এর নিজের ইমেইল (`smtp.hostinger.com`, port `465`, SSL) দিয়েও করা যায়।

---

## ৭. System Settings (Admin → System Settings)

**Accounts অংশ:**
- **Allow new registrations:** নতুন অ্যাকাউন্ট খোলা যাবে কিনা
- **Require email verification:** ইমেইল ভেরিফাই বাধ্যতামূলক কিনা
- **New accounts need admin approval:** ON করলে নতুন অ্যাকাউন্ট আপনার অনুমোদনের অপেক্ষায় থাকবে
- **Support WhatsApp:** `+8801757827996` (Pending পেজে দেখায়)
- **Approval alert email:** নতুন অ্যাকাউন্টের খবর কোন জিমেইলে যাবে
- **Lost authenticator: email code:** 2FA-এর ফোন হারালে ইমেইল কোড দিয়ে ঢোকা যাবে কিনা
- **OTP page: show every OTP from the APIs:** সব OTP সবাই দেখবে (নাম্বার লুকানো), নাকি শুধু নিজেরটা

**Wallet & limits অংশ:**
- **Return unused number after:** ১০ মিনিট
- **Remove notifications after:** ২৪ ঘণ্টা

**Payment methods অংশ:** TRC20 ঠিকানা, Binance UID, Binance QR

---

## ৮. Google লগইন (ঐচ্ছিক)

1. https://console.cloud.google.com → নতুন প্রজেক্ট বানান।
2. **OAuth consent screen:** External সিলেক্ট করে নাম আর ইমেইল দিন → **Publish App**
3. **Credentials → Create Credentials → OAuth client ID → Web application**
4. **Authorized redirect URI:** `https://panel.oryzenx.com/auth/google/callback`
5. **Client ID** আর **Client Secret** কপি করুন।
6. Admin → System Settings → **Google Login**-এ বসান → সুইচ ON → Save

---

## ৯. ব্যাকআপ আর সাইট সরানো

- **নিয়মিত ব্যাকআপ:** phpMyAdmin → Export (`.sql`)। ছবি আর ফাইলও ডাটাবেসে থাকে, তাই এটুকুই যথেষ্ট।
- **অন্য হোস্টে সরাতে লাগবে:** zip + `.sql` ব্যাকআপ + **একই** `SESSION_SECRET` আর `ENCRYPTION_KEY`
- সরানোর সময়:
  - পুরনো সাইটে Maintenance mode ON করুন আর সব API OFF করুন।
  - নতুন সাইটে সব চেক করার পর API ON করুন।

---

## ১০. নিরাপত্তা

- কোনো API key, পাসওয়ার্ড বা token স্ক্রিনশটে বা চ্যাটে খোলা অবস্থায় দেবেন না। ভুল করে দিলে সেই সার্ভিসে নতুন key বানিয়ে পুরনোটা বন্ধ করুন।
- অ্যাডমিন অ্যাকাউন্টে **2FA** চালু রাখুন (Security পেজ)।
- নতুন অ্যাডমিন দরকার হলে Admin → Users → Add user → Role: Admin
