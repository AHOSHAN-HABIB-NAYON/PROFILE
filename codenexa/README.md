# CodeNexa — IT Solutions Website (PHP + MySQL)

Fast, modern IT company website with an admin panel and a one-click web installer.

- **PHP 7.4+**, MySQL/MariaDB **or** SQLite (no extra libraries, no Composer)
- **Light mode by default**, dark mode toggle + 4 accent colours (remembered per visitor)
- **AJAX navigation**: pages switch without a reload, and links are prefetched on hover/touch so clicks feel instant
- Smooth animations that only use transform/opacity, so they run at your screen's full refresh rate (60–120 Hz). Visitors who turn on "reduce motion" get no animation
- Page HTML is cached on disk and the cache clears itself when you save in the admin panel; responses are gzip-compressed
- Fully responsive: desktop navbar, plus a mobile bottom nav and slide-in drawer
- Three languages: **English / বাংলা / हिन्दी**
- AJAX contact form (CSRF protection, honeypot, rate limit) → messages show up in the admin panel
- Admin panel: dashboard with visitor chart, messages, Services / Projects / Pricing / Team CRUD, site settings, account

## Install (বাংলা)

1. `codenexa/` ফোল্ডারের **ভেতরের সব ফাইল** আপনার হোস্টিংয়ের `public_html/` (বা ডোমেইনের root) এ আপলোড করুন।
2. cPanel → **MySQL® Databases** থেকে একটি database ও user তৈরি করুন, user-কে database-এ **ALL PRIVILEGES** দিন।
   (MySQL না থাকলে installer-এ **SQLite** বেছে নিন — কিছু তৈরি করতে হবে না।)
3. ব্রাউজারে আপনার ডোমেইন খুলুন → **Installer স্বয়ংক্রিয়ভাবে চালু হবে**।
4. Database info, site name, admin email ও password দিন → **Install Now**।
5. ইনস্টল শেষে নিরাপত্তার জন্য `install/` ফোল্ডারটি ডিলিট করুন।
6. Admin panel: `https://yourdomain.com/admin/`

আবার ইনস্টল করতে চাইলে `config.php` ডিলিট করে ডোমেইন রিলোড করুন।

## Install (English)

1. Upload the **contents** of `codenexa/` to your web root (e.g. `public_html/`).
2. Create a MySQL database + user (or choose SQLite in the installer).
3. Open your domain. The installer starts automatically.
4. Fill in the form and click **Install Now**.
5. Delete the `install/` folder.
6. Admin panel: `/admin/`

## Nginx

`.htaccess` handles Apache/LiteSpeed. For Nginx:

```nginx
location ~ ^/(includes|lang|pages|data)/ { deny all; }
location = /config.php { deny all; }
location = /install-rewrite-test { rewrite ^ /install/index.php?rwtest=1 last; }
location ~ ^/service/([a-z0-9-]+)/?$ { try_files $uri /index.php?p=service&slug=$1; }
location / { try_files $uri $uri/ @page; }
location @page { rewrite ^/([a-z0-9-]+)/?$ /index.php?p=$1 last; }
```

## Structure

```
index.php            front controller (full page or JSON for AJAX nav)
install/             web installer
admin/               admin panel
api/contact.php      contact form endpoint
includes/            bootstrap, schema, components, layout
pages/               page templates
lang/                en / bn / hi translations
assets/              css, js, svg
data/                SQLite DB + page cache (web access blocked)
```
