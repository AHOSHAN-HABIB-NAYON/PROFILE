# OryzenX BD

Private investment, trading and loan monitor for a small group of friends. Web app + Android app (APK shared directly, no Play Store).

- **Server:** Node.js (Express) + MySQL. One process serves the API and the web app.
- **Web app:** plain JavaScript, no build step, about 38 KB of app code when compressed (charts load only when opened). Dark and light themes. Installable as a PWA.
- **Live prices and charts:** each phone/browser connects to Binance's public market stream directly, so live data costs the server nothing.
- **Android app:** a thin Capacitor wrapper around the live site (built by a GitHub Action, see below). Updates to the website show up in the app instantly — no new APK needed.

## What's in this version

Stage 1 is complete, plus the core of Stage 2:

| Area | Status |
| --- | --- |
| Login: email/password, Google, forgot password, email verification | ✅ |
| New users need admin approval (or an invite code) | ✅ |
| Roles: Super Admin, Admin, User. Members are read-only; only admins edit | ✅ |
| Privacy Notice & Disclaimer on first login and in Settings | ✅ |
| Home dashboard: payment date, All/Main/Investment/Trading/Loan/Loss balances, today's profit, total users, recent history, live market | ✅ |
| Trading: Today / Yesterday / 7D / 30D / 1Y profit and loss, coins traded, live candlestick charts | ✅ |
| Main Flow Invest: holdings with live value and P/L, reinvest plan (profit − salaries) | ✅ |
| Trade History: coin, profit, fee, date, filters, pagination, CSV export | ✅ |
| Loan Monitor: USD and coin loans, live gain/loss for coin loans, repayment date, remaining | ✅ |
| Members & Payments: everyone's deposit, salary, total received; monthly paid/pending list | ✅ |
| Profile: photo upload (compressed in the browser), personal details, payment methods (bKash, Nagad, Rocket, Bank, Crypto + network), payment history | ✅ |
| Admin panel: approve users, deposit amount/date, salary, status, roles, invites, trades/investments/loans, balances, watchlist, method logos, broadcast notices | ✅ |
| Monthly payment date (set/change per month) and Mark Paid with method | ✅ |
| Emails via SMTP: verification, welcome, approval, payment date set/changed/rescheduled, reminders (3 days, 1 day, on the day), payment paid, deposit, payment method changed, profile/password changed, new login, loan reminders | ✅ |
| Email queue with retry, email log, per-type admin toggles, member opt-out for reminder emails only | ✅ |
| In-app notifications | ✅ |
| Security: bcrypt, rate limiting, admin activity log, login log, HTTPS headers, daily DB backup script | ✅ |

**Not built yet (Stage 2/3):** ID card + face verification (KYC) with liveness, risk-based face re-verification, app lock (PIN/fingerprint), screenshot blocking, FCM push notifications, optional 2FA, the 5-day friendly reminder and the monthly summary email. The database and email system are ready for these.

### How the balances are calculated

- **Main Balance** = starting main balance (set by admin) + every trade's profit − fees − salaries already paid.
- **Investment Balance** = open holdings × live Binance price.
- **Trading Balance** = set by admin (capital in the trading account).
- **Loan Balance** = remaining USD loans + coin loans × live price.
- **Loss Balance** = total of all losing trades (after fees).
- **All Balance** = Main + Investment − Loans.
- **Reinvest** (Main Flow Invest) = this month's net trade profit − all members' monthly salaries.

All amounts are USD. "Today" and all reminders use Bangladesh time (`APP_TZ=+06:00`).

## Run it locally

Needs Node.js 18+ and MySQL 8 (or MariaDB 10.6+).

```bash
cd oryzenx/server
npm install
cp .env.example .env        # set NODE_ENV=development, DB_* values, leave SMTP empty
mysql -u root -e "CREATE DATABASE oryzenx; CREATE USER 'oryzenx'@'localhost' IDENTIFIED BY 'pick-a-password'; GRANT ALL ON oryzenx.* TO 'oryzenx'@'localhost';"
npm run seed-demo           # optional sample data: admin@demo.local / Demo12345
npm start                   # http://localhost:8080
```

Without SMTP, emails are printed to the console (including verification links).

## Deploy on Hostinger (VPS)

A Hostinger **VPS** (KVM 1 is plenty) with Ubuntu 24.04. Shared hosting is not recommended: the app needs a long-running Node process for the email queue and reminders.

1. **Point your domain** (A record) to the VPS IP.
2. **Install software** (SSH in as root):
   ```bash
   apt update && apt install -y nginx mysql-server certbot python3-certbot-nginx git
   curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt install -y nodejs
   npm install -g pm2
   adduser --disabled-password oryzenx
   ```
3. **Database:**
   ```bash
   mysql -e "CREATE DATABASE oryzenx; CREATE USER 'oryzenx'@'localhost' IDENTIFIED BY 'a-long-random-password'; GRANT ALL ON oryzenx.* TO 'oryzenx'@'localhost';"
   ```
4. **Code and config** (as the `oryzenx` user):
   ```bash
   su - oryzenx
   git clone https://github.com/ahoshan-habib-nayon/profile.git app && cd app/oryzenx/server
   npm ci --omit=dev
   cp .env.example .env && nano .env    # APP_URL, JWT_SECRET, DB_PASSWORD, SMTP_*, GOOGLE_CLIENT_ID
   npm run create-admin -- "Your Name" you@example.com 'YourStrongPassword1'
   pm2 start ../deploy/ecosystem.config.js && pm2 save
   exit
   pm2 startup systemd -u oryzenx --hp /home/oryzenx   # run the command it prints
   ```
5. **Nginx + HTTPS:** copy `deploy/nginx.conf` to `/etc/nginx/sites-available/oryzenx`, set your domain, then
   ```bash
   ln -s /etc/nginx/sites-available/oryzenx /etc/nginx/sites-enabled/ && nginx -t && systemctl reload nginx
   certbot --nginx -d your-domain.com
   ```
6. **Backups:** as `oryzenx`, `crontab -e` and add
   `15 3 * * * /home/oryzenx/app/oryzenx/deploy/backup.sh >> /home/oryzenx/backup.log 2>&1`
7. **Updates later:** `cd ~/app && git pull && cd oryzenx/server && npm ci --omit=dev && pm2 restart oryzenx`
   (the database schema updates itself on start).

### Email (SMTP)

With a Hostinger email account: `SMTP_HOST=smtp.hostinger.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, and the mailbox address/password as `SMTP_USER`/`SMTP_PASS`. Check **Admin → Logs → Email log** to see what was sent or failed.

### Google login (optional)

Google Cloud Console → APIs & Services → Credentials → **Create OAuth client ID** (Web application). Add `https://your-domain.com` under *Authorized JavaScript origins*. Put the client ID in `GOOGLE_CLIENT_ID` and restart. The Google button appears automatically.

## Android app (APK)

1. Deploy the website first (it must be on HTTPS).
2. On GitHub: **Actions → OryzenX Android APK → Run workflow**, enter your site URL.
3. When it finishes, download **oryzenx-bd-apk** from the run's *Artifacts*, unzip, and share `app-debug.apk` with the group. Phones need "Install unknown apps" allowed for the app used to open it.

Because the app loads the live site, you only need a new APK if the URL or app icon changes. (The APK is debug-signed, which is fine for direct sharing; a signed release build can be added in Stage 3.)

## Project layout

```
oryzenx/
  server/            Node.js API + static hosting
    src/schema.sql   database tables
    src/routes/      auth, me (profile), data (read-only for members), admin
    src/lib/         auth, email queue, stats, uploads, audit log
    src/jobs.js      payment, loan and deposit reminders
  web/               the web app (index.html, css/, js/, icons/, vendor/)
  mobile/            Capacitor config for the Android APK
  deploy/            PM2, Nginx, backup script
```

Note: the repository's existing GitHub Pages workflow publishes the whole repo, so once this is merged to `main` the static files in `oryzenx/web` will also appear on GitHub Pages. They do nothing there without the server (no data is exposed), but you can exclude the folder if you prefer.
