<?php
/**
 * Default content inserted by the installer: categories, all services
 * (English + Bangla), example products, payment methods (disabled until
 * configured), news, social links and core settings. Everything is
 * editable later from the admin panel.
 */
defined('APP') || exit;

function seed_database(PDO $pdo, array $o): void
{
    $base = rtrim((string)($o['base_path'] ?? ''), '/');
    $ins = function (string $table, array $row) use ($pdo, $base): int {
        // seeded rich text links are root-relative: prefix the install sub-folder if any
        foreach (['content_en', 'content_bn'] as $c) if (isset($row[$c]) && $base !== '') $row[$c] = str_replace('href="/', 'href="' . $base . '/', $row[$c]);
        $cols = implode(',', array_map(fn($c) => "`$c`", array_keys($row)));
        $pdo->prepare("INSERT INTO `$table` ($cols) VALUES (" . implode(',', array_fill(0, count($row), '?')) . ')')->execute(array_values($row));
        return (int)$pdo->lastInsertId();
    };

    // ------------------------------------------------------------------ categories
    $cats = [
        ['development', 'Development', 'ডেভেলপমেন্ট', 'fa-solid fa-code'],
        ['api-backend', 'API & Backend', 'API ও ব্যাকএন্ড', 'fa-solid fa-server'],
        ['frontend', 'Frontend', 'ফ্রন্টএন্ড', 'fa-solid fa-palette'],
        ['ecommerce', 'E-commerce', 'ই-কমার্স', 'fa-solid fa-cart-shopping'],
        ['business', 'Business', 'বিজনেস', 'fa-solid fa-briefcase'],
        ['portals', 'Portals', 'পোর্টাল', 'fa-solid fa-table-columns'],
        ['automation', 'Automation & Integrations', 'অটোমেশন ও ইন্টিগ্রেশন', 'fa-solid fa-gears'],
        ['ai', 'AI', 'AI', 'fa-solid fa-robot'],
        ['security', 'Security & Auth', 'সিকিউরিটি ও অথেন্টিকেশন', 'fa-solid fa-shield-halved'],
        ['seo', 'SEO & Performance', 'SEO ও পারফরম্যান্স', 'fa-solid fa-magnifying-glass-chart'],
        ['pwa', 'PWA & Push', 'PWA ও পুশ', 'fa-solid fa-mobile-screen'],
        ['maintenance', 'Hosting & Maintenance', 'হোস্টিং ও মেইনটেন্যান্স', 'fa-solid fa-screwdriver-wrench'],
    ];
    $catId = [];
    foreach ($cats as $i => [$slug, $en, $bn, $icon]) $catId[$slug] = $ins('service_categories', ['slug' => $slug, 'name_en' => $en, 'name_bn' => $bn, 'icon' => $icon, 'sort' => $i]);

    // ------------------------------------------------------------------ services
    // [slug, category, icon, title_en, title_bn, short_en, short_bn, price_from, featured]
    $services = [
        ['full-website-development', 'development', 'fa-solid fa-globe', 'Full Website Development', 'সম্পূর্ণ ওয়েবসাইট ডেভেলপমেন্ট', 'Design, development, admin panel, SEO and launch — your complete website, done for you.', 'ডিজাইন, ডেভেলপমেন্ট, অ্যাডমিন প্যানেল, SEO ও লঞ্চ — আপনার সম্পূর্ণ ওয়েবসাইট আমরাই তৈরি করে দেব।', null, 1],
        ['full-project-development', 'development', 'fa-solid fa-diagram-project', 'Full Project Development', 'সম্পূর্ণ প্রজেক্ট ডেভেলপমেন্ট', 'From idea to production: planning, architecture, frontend, backend, database and deployment.', 'আইডিয়া থেকে প্রোডাকশন: পরিকল্পনা, আর্কিটেকচার, ফ্রন্টএন্ড, ব্যাকএন্ড, ডাটাবেস ও ডিপ্লয়মেন্ট।', null, 0],
        ['nodejs-development', 'api-backend', 'fa-brands fa-node-js', 'Node.js Development', 'Node.js ডেভেলপমেন্ট', 'Fast, scalable Node.js apps and APIs with authentication, admin panel and security.', 'অথেন্টিকেশন, অ্যাডমিন প্যানেল ও সিকিউরিটিসহ দ্রুত ও স্কেলেবল Node.js অ্যাপ ও API।', null, 1],
        ['php-development', 'api-backend', 'fa-brands fa-php', 'PHP Development', 'PHP ডেভেলপমেন্ট', 'Secure PHP + MySQL websites that run on any shared hosting.', 'যেকোনো শেয়ার্ড হোস্টিংয়ে চলে এমন নিরাপদ PHP + MySQL ওয়েবসাইট।', null, 1],
        ['html-css-website', 'frontend', 'fa-brands fa-html5', 'HTML/CSS Website', 'HTML/CSS ওয়েবসাইট', 'Lightweight, pixel-perfect static websites that load instantly.', 'হালকা, নিখুঁত স্ট্যাটিক ওয়েবসাইট যা মুহূর্তেই লোড হয়।', 8, 0],
        ['react-development', 'frontend', 'fa-brands fa-react', 'React Development', 'React ডেভেলপমেন্ট', 'Modern React / Next.js interfaces with smooth, app-like UX.', 'মসৃণ, অ্যাপের মতো অভিজ্ঞতাসহ আধুনিক React / Next.js ইন্টারফেস।', null, 1],
        ['api-development', 'api-backend', 'fa-solid fa-plug', 'API Development', 'API ডেভেলপমেন্ট', 'Well-documented, secure APIs for web and mobile apps.', 'ওয়েব ও মোবাইল অ্যাপের জন্য ডকুমেন্টেড ও নিরাপদ API।', 30, 0],
        ['rest-api', 'api-backend', 'fa-solid fa-code-branch', 'REST API', 'REST API', 'RESTful endpoints with validation, rate limiting and token auth.', 'ভ্যালিডেশন, রেট লিমিটিং ও টোকেন অথসহ RESTful এন্ডপয়েন্ট।', 25, 0],
        ['landing-page', 'frontend', 'fa-solid fa-rocket', 'Landing Page', 'ল্যান্ডিং পেজ', 'High-converting landing pages for products, events and campaigns.', 'প্রোডাক্ট, ইভেন্ট ও ক্যাম্পেইনের জন্য উচ্চ কনভার্সনের ল্যান্ডিং পেজ।', null, 1],
        ['ecommerce-website', 'ecommerce', 'fa-solid fa-cart-shopping', 'E-commerce Website', 'ই-কমার্স ওয়েবসাইট', 'Online store with cart, checkout, payments, orders and inventory.', 'কার্ট, চেকআউট, পেমেন্ট, অর্ডার ও ইনভেন্টরিসহ অনলাইন স্টোর।', null, 1],
        ['job-portal', 'portals', 'fa-solid fa-briefcase', 'Job Portal', 'জব পোর্টাল', 'Job listings, applications, employer and candidate dashboards.', 'চাকরির বিজ্ঞপ্তি, আবেদন, নিয়োগকর্তা ও প্রার্থী ড্যাশবোর্ড।', 150, 0],
        ['news-portal', 'portals', 'fa-solid fa-newspaper', 'News Portal', 'নিউজ পোর্টাল', 'Fast news portal with categories, rich editor, SEO and push alerts.', 'ক্যাটাগরি, রিচ এডিটর, SEO ও পুশ অ্যালার্টসহ দ্রুত নিউজ পোর্টাল।', 120, 0],
        ['trading-website', 'business', 'fa-solid fa-chart-line', 'Trading Website', 'ট্রেডিং ওয়েবসাইট', 'Market dashboards, live price widgets and member areas.', 'মার্কেট ড্যাশবোর্ড, লাইভ প্রাইস উইজেট ও মেম্বার এরিয়া।', 200, 0],
        ['investment-website', 'business', 'fa-solid fa-sack-dollar', 'Investment Website', 'ইনভেস্টমেন্ট ওয়েবসাইট', 'Plans, wallets, transactions and secure user dashboards.', 'প্ল্যান, ওয়ালেট, ট্রানজ্যাকশন ও নিরাপদ ইউজার ড্যাশবোর্ড।', 220, 0],
        ['portfolio-website', 'frontend', 'fa-solid fa-id-badge', 'Portfolio Website', 'পোর্টফোলিও ওয়েবসাইট', 'A personal brand site to showcase your work and CV.', 'আপনার কাজ ও সিভি তুলে ধরতে পার্সোনাল ব্র্যান্ড ওয়েবসাইট।', 15, 0],
        ['business-website', 'business', 'fa-solid fa-building', 'Business Website', 'বিজনেস ওয়েবসাইট', 'Professional company website with services, team and contact.', 'সার্ভিস, টিম ও যোগাযোগসহ পেশাদার কোম্পানি ওয়েবসাইট।', 35, 0],
        ['admin-dashboard', 'development', 'fa-solid fa-gauge-high', 'Admin Dashboard', 'অ্যাডমিন ড্যাশবোর্ড', 'Mobile-friendly dashboards with analytics, roles and reports.', 'অ্যানালিটিক্স, রোল ও রিপোর্টসহ মোবাইল-ফ্রেন্ডলি ড্যাশবোর্ড।', 60, 0],
        ['custom-web-application', 'development', 'fa-solid fa-laptop-code', 'Custom Web Application', 'কাস্টম ওয়েব অ্যাপ্লিকেশন', 'Tailor-made web apps built around your exact workflow.', 'আপনার নির্দিষ্ট কাজের ধারা অনুযায়ী তৈরি কাস্টম ওয়েব অ্যাপ।', null, 0],
        ['saas-website', 'development', 'fa-solid fa-cloud', 'SaaS Website', 'SaaS ওয়েবসাইট', 'Subscription SaaS with accounts, plans, billing and admin.', 'অ্যাকাউন্ট, প্ল্যান, বিলিং ও অ্যাডমিনসহ সাবস্ক্রিপশন SaaS।', 300, 0],
        ['pwa', 'pwa', 'fa-solid fa-mobile-screen', 'Progressive Web App (PWA)', 'প্রগ্রেসিভ ওয়েব অ্যাপ (PWA)', 'Installable, offline-ready web apps with push notifications.', 'ইনস্টলযোগ্য, অফলাইনে চলা ও পুশ নোটিফিকেশনসহ ওয়েব অ্যাপ।', 40, 0],
        ['payment-integration', 'ecommerce', 'fa-solid fa-credit-card', 'Payment Integration', 'পেমেন্ট ইন্টিগ্রেশন', 'bKash, crypto, Binance Pay, Stripe and more — securely integrated.', 'বিকাশ, ক্রিপ্টো, Binance Pay, Stripe সহ আরও — নিরাপদে ইন্টিগ্রেশন।', 30, 0],
        ['authentication-system', 'security', 'fa-solid fa-user-lock', 'Authentication System', 'অথেন্টিকেশন সিস্টেম', 'Login, registration, email verification, 2FA and sessions.', 'লগইন, রেজিস্ট্রেশন, ইমেইল যাচাই, 2FA ও সেশন ম্যানেজমেন্ট।', 25, 0],
        ['google-login', 'security', 'fa-brands fa-google', 'Google Login', 'Google লগইন', 'One-tap sign-in with Google OAuth.', 'Google OAuth দিয়ে এক ক্লিকে সাইন-ইন।', 15, 0],
        ['passkey', 'security', 'fa-solid fa-fingerprint', 'Passkey Login', 'পাসকি লগইন', 'Password-less login with fingerprint, face or device PIN.', 'আঙুলের ছাপ, ফেস বা পিন দিয়ে পাসওয়ার্ডবিহীন লগইন।', 25, 0],
        ['notification-system', 'automation', 'fa-solid fa-bell', 'Notification System', 'নোটিফিকেশন সিস্টেম', 'In-app, email and push notifications with targeting.', 'টার্গেটিংসহ ইন-অ্যাপ, ইমেইল ও পুশ নোটিফিকেশন।', 30, 0],
        ['web-push', 'pwa', 'fa-solid fa-paper-plane', 'Web Push', 'ওয়েব পুশ', 'Reach users instantly with browser push notifications.', 'ব্রাউজার পুশ নোটিফিকেশন দিয়ে তাৎক্ষণিকভাবে ইউজারের কাছে পৌঁছান।', 20, 0],
        ['email-system', 'automation', 'fa-solid fa-envelope', 'Email System', 'ইমেইল সিস্টেম', 'Transactional emails with SMTP, templates and queues.', 'SMTP, টেমপ্লেট ও কিউসহ ট্রানজ্যাকশনাল ইমেইল।', 20, 0],
        ['ai-chatbot', 'ai', 'fa-solid fa-robot', 'AI Chatbot', 'AI চ্যাটবট', 'A website assistant that knows your products, prices and FAQ.', 'আপনার প্রোডাক্ট, দাম ও FAQ জানে এমন ওয়েবসাইট অ্যাসিস্ট্যান্ট।', null, 1],
        ['database-system', 'api-backend', 'fa-solid fa-database', 'Database System', 'ডাটাবেস সিস্টেম', 'Normalized, indexed and backed-up MySQL databases.', 'নরমালাইজড, ইনডেক্সড ও ব্যাকআপসহ MySQL ডাটাবেস।', 20, 0],
        ['api-integration', 'automation', 'fa-solid fa-plug-circle-bolt', 'API Integration', 'API ইন্টিগ্রেশন', 'Connect your site to the services your business relies on.', 'আপনার ব্যবসার প্রয়োজনীয় সার্ভিসগুলোর সাথে সাইট যুক্ত করুন।', 20, 0],
        ['third-party-api-integration', 'automation', 'fa-solid fa-link', 'Third-party API Integration', 'থার্ড-পার্টি API ইন্টিগ্রেশন', 'SMS, courier, payment, maps, social and AI APIs.', 'SMS, কুরিয়ার, পেমেন্ট, ম্যাপ, সোশ্যাল ও AI API।', 20, 0],
        ['hosting-setup', 'maintenance', 'fa-solid fa-server', 'Hosting Setup', 'হোস্টিং সেটআপ', 'Domain, SSL, email, deployment and backups configured right.', 'ডোমেইন, SSL, ইমেইল, ডিপ্লয়মেন্ট ও ব্যাকআপ সঠিকভাবে কনফিগার।', 10, 0],
        ['security-setup', 'security', 'fa-solid fa-shield-halved', 'Security Setup', 'সিকিউরিটি সেটআপ', 'Hardening, firewall rules, headers, audits and malware cleanup.', 'হার্ডেনিং, ফায়ারওয়াল, সিকিউরিটি হেডার, অডিট ও ম্যালওয়্যার ক্লিনআপ।', 25, 0],
        ['seo', 'seo', 'fa-solid fa-magnifying-glass-chart', 'SEO', 'SEO', 'Technical SEO, schema, sitemaps and on-page optimisation.', 'টেকনিক্যাল SEO, স্কিমা, সাইটম্যাপ ও অন-পেজ অপ্টিমাইজেশন।', 20, 0],
        ['speed-optimization', 'seo', 'fa-solid fa-gauge-simple-high', 'Speed Optimization', 'স্পিড অপ্টিমাইজেশন', 'Faster Core Web Vitals with caching, image and code optimisation.', 'ক্যাশিং, ইমেজ ও কোড অপ্টিমাইজেশনে আরও দ্রুত Core Web Vitals।', 20, 0],
        ['mobile-responsive-design', 'frontend', 'fa-solid fa-mobile-screen-button', 'Mobile Responsive Design', 'মোবাইল রেসপন্সিভ ডিজাইন', 'Layouts that look perfect on every phone, tablet and desktop.', 'প্রতিটি ফোন, ট্যাবলেট ও ডেস্কটপে নিখুঁত লেআউট।', 15, 0],
        ['custom-admin-panel', 'development', 'fa-solid fa-sliders', 'Custom Admin Panel', 'কাস্টম অ্যাডমিন প্যানেল', 'Control every part of your site without touching code.', 'কোড না ছুঁয়েই সাইটের সবকিছু নিয়ন্ত্রণ করুন।', 45, 0],
        ['website-maintenance', 'maintenance', 'fa-solid fa-screwdriver-wrench', 'Website Maintenance', 'ওয়েবসাইট মেইনটেন্যান্স', 'Updates, backups, monitoring and fixes every month.', 'প্রতি মাসে আপডেট, ব্যাকআপ, মনিটরিং ও সমস্যা সমাধান।', 10, 0],
    ];
    $svcId = [];
    foreach ($services as $i => [$slug, $cat, $icon, $en, $bn, $sen, $sbn, $price, $feat]) {
        $svcId[$slug] = $ins('services', ['category_id' => $catId[$cat], 'slug' => $slug, 'title_en' => $en, 'title_bn' => $bn, 'short_en' => $sen, 'short_bn' => $sbn,
            'description_en' => '<p>' . htmlspecialchars($sen) . '</p><p>Every project includes responsive design, security best practices, clean code and launch support.</p>',
            'description_bn' => '<p>' . htmlspecialchars($sbn) . '</p><p>প্রতিটি প্রজেক্টে রেসপন্সিভ ডিজাইন, নিরাপত্তা, পরিষ্কার কোড ও লঞ্চ সাপোর্ট অন্তর্ভুক্ত।</p>',
            'features_en' => "Responsive design\nSecure, clean code\nSEO-friendly\nInstallation support", 'features_bn' => "রেসপন্সিভ ডিজাইন\nনিরাপদ ও পরিষ্কার কোড\nSEO-ফ্রেন্ডলি\nইনস্টলেশন সাপোর্ট",
            'icon' => $icon, 'price_from' => $price, 'is_featured' => $feat, 'sort' => $i]);
    }

    // ------------------------------------------------------------------ products
    $products = [
        ['nodejs-development', 'nodejs-full-project', 'Node.js Full Project', 'Node.js ফুল প্রজেক্ট', 50, 6000, 1, 7, 3,
            "Full source code\nResponsive design\nBackend\nDatabase\nAuthentication\nAdmin panel\nAPI\nSecurity\nInstallation support\nDocumentation",
            "সম্পূর্ণ সোর্স কোড\nরেসপন্সিভ ডিজাইন\nব্যাকএন্ড\nডাটাবেস\nঅথেন্টিকেশন\nঅ্যাডমিন প্যানেল\nAPI\nসিকিউরিটি\nইনস্টলেশন সাপোর্ট\nডকুমেন্টেশন"],
        ['nodejs-development', 'nodejs-api-starter', 'Node.js API Starter', 'Node.js API স্টার্টার', 30, 3600, 0, 4, 1,
            "REST API\nJWT authentication\nMySQL / MongoDB\nRate limiting\nAPI documentation", "REST API\nJWT অথেন্টিকেশন\nMySQL / MongoDB\nরেট লিমিটিং\nAPI ডকুমেন্টেশন"],
        ['php-development', 'php-website', 'PHP Website', 'PHP ওয়েবসাইট', 10, 1200, 1, 3, 1,
            "5 pages\nAdmin panel\nResponsive design\nMySQL database\nContact system\nBasic SEO\nSecurity", "৫টি পেজ\nঅ্যাডমিন প্যানেল\nরেসপন্সিভ ডিজাইন\nMySQL ডাটাবেস\nকন্টাক্ট সিস্টেম\nবেসিক SEO\nসিকিউরিটি"],
        ['php-development', 'php-business-pro', 'PHP Business Pro', 'PHP বিজনেস প্রো', 35, 4200, 0, 7, 3,
            "Unlimited pages\nAdvanced admin panel\nBlog / news\nPayment integration\nSEO setup\nSpeed optimisation", "আনলিমিটেড পেজ\nঅ্যাডভান্সড অ্যাডমিন প্যানেল\nব্লগ / নিউজ\nপেমেন্ট ইন্টিগ্রেশন\nSEO সেটআপ\nস্পিড অপ্টিমাইজেশন"],
        ['full-website-development', 'complete-website', 'Complete Website Package', 'কমপ্লিট ওয়েবসাইট প্যাকেজ', 49, 5900, 1, 7, 3,
            "Custom design\nUp to 10 pages\nAdmin panel\nSEO & speed setup\nDomain & hosting setup\n3 months support", "কাস্টম ডিজাইন\nসর্বোচ্চ ১০টি পেজ\nঅ্যাডমিন প্যানেল\nSEO ও স্পিড সেটআপ\nডোমেইন ও হোস্টিং সেটআপ\n৩ মাস সাপোর্ট"],
        ['landing-page', 'landing-page-pro', 'Landing Page Pro', 'ল্যান্ডিং পেজ প্রো', 15, 1800, 1, 2, 1,
            "Conversion-focused design\nLead form\nAnalytics setup\nMobile-first", "কনভার্সন-কেন্দ্রিক ডিজাইন\nলিড ফর্ম\nঅ্যানালিটিক্স সেটআপ\nমোবাইল-ফার্স্ট"],
        ['ecommerce-website', 'ecommerce-store', 'E-commerce Store', 'ই-কমার্স স্টোর', 120, 14500, 1, 14, 3,
            "Product catalogue\nCart & checkout\nbKash / crypto payments\nOrder management\nCoupons\nAdmin dashboard", "প্রোডাক্ট ক্যাটালগ\nকার্ট ও চেকআউট\nবিকাশ / ক্রিপ্টো পেমেন্ট\nঅর্ডার ম্যানেজমেন্ট\nকুপন\nঅ্যাডমিন ড্যাশবোর্ড"],
        ['react-development', 'react-spa', 'React / Next.js App', 'React / Next.js অ্যাপ', 45, 5400, 1, 7, 2,
            "React or Next.js\nAPI integration\nAuthentication\nResponsive UI\nDeployment", "React বা Next.js\nAPI ইন্টিগ্রেশন\nঅথেন্টিকেশন\nরেসপন্সিভ UI\nডিপ্লয়মেন্ট"],
        ['ai-chatbot', 'ai-chatbot-integration', 'AI Chatbot Integration', 'AI চ্যাটবট ইন্টিগ্রেশন', 40, 4800, 1, 3, 2,
            "OpenAI-powered assistant\nTrained on your site info\nRate limiting\nChat history\nAdmin controls", "OpenAI চালিত অ্যাসিস্ট্যান্ট\nআপনার সাইটের তথ্য দিয়ে প্রশিক্ষিত\nরেট লিমিটিং\nচ্যাট হিস্টোরি\nঅ্যাডমিন কন্ট্রোল"],
        ['website-maintenance', 'monthly-maintenance', 'Monthly Maintenance', 'মাসিক মেইনটেন্যান্স', 10, 1200, 0, 1, 1,
            "Updates & backups\nUptime monitoring\nSecurity checks\nSmall fixes", "আপডেট ও ব্যাকআপ\nআপটাইম মনিটরিং\nসিকিউরিটি চেক\nছোটখাটো সমাধান"],
    ];
    foreach ($products as $i => [$svc, $slug, $en, $bn, $usd, $bdt, $feat, $days, $months, $fen, $fbn]) {
        $ins('products', ['service_id' => $svcId[$svc], 'slug' => $slug, 'name_en' => $en, 'name_bn' => $bn, 'price_usd' => $usd, 'price_bdt' => $bdt,
            'features_en' => $fen, 'features_bn' => $fbn, 'delivery_days' => $days, 'support_months' => $months, 'is_featured' => $feat, 'sort' => $i,
            'short_en' => strtok($fen, "\n") . ' and more.', 'short_bn' => strtok($fbn, "\n") . ' সহ আরও অনেক কিছু।']);
    }

    // ------------------------------------------------------------------ payment methods (disabled until configured)
    $methods = [
        ['bkash', 'bKash', 'BDT', ['number' => '', 'account_type' => 'Personal'],
            "Open bKash → Send Money to the number above → enter the exact amount → copy the Transaction ID (TrxID) and paste it below with a screenshot.",
            "বিকাশ অ্যাপ খুলুন → উপরের নম্বরে Send Money করুন → সঠিক পরিমাণ দিন → ট্রানজ্যাকশন আইডি (TrxID) কপি করে নিচে স্ক্রিনশটসহ জমা দিন।"],
        ['usdt_trc20', 'USDT (TRC20)', 'USD', ['address' => '', 'network' => 'TRON (TRC20)'],
            "Send USDT on the TRON (TRC20) network only. Sending on another network will lose funds. Paste the TXID after sending.",
            "শুধুমাত্র TRON (TRC20) নেটওয়ার্কে USDT পাঠান। অন্য নেটওয়ার্কে পাঠালে অর্থ হারিয়ে যাবে। পাঠানোর পর TXID জমা দিন।"],
        ['usdt_bep20', 'USDT (BEP20)', 'USD', ['address' => '', 'network' => 'BNB Smart Chain (BEP20)'],
            "Send USDT on BNB Smart Chain (BEP20) only. Paste the transaction hash (0x…) after sending.",
            "শুধুমাত্র BNB Smart Chain (BEP20) নেটওয়ার্কে USDT পাঠান। পাঠানোর পর ট্রানজ্যাকশন হ্যাশ (0x…) জমা দিন।"],
        ['binance_pay', 'Binance Pay', 'USD', ['pay_id' => '', 'pay_name' => '', 'qr' => '', 'link' => ''],
            "Open Binance → Pay → Send → enter our Pay ID (or scan the QR) → send the exact USDT amount → submit the Order ID as TXID.",
            "Binance খুলুন → Pay → Send → আমাদের Pay ID দিন (বা QR স্ক্যান করুন) → সঠিক পরিমাণ USDT পাঠান → অর্ডার আইডি TXID হিসেবে জমা দিন।"],
    ];
    foreach ($methods as $i => [$code, $name, $cur, $details, $ien, $ibn]) {
        $ins('payment_methods', ['code' => $code, 'name' => $name, 'currency' => $cur, 'enabled' => 0, 'details' => json_encode($details), 'instructions_en' => $ien, 'instructions_bn' => $ibn, 'sort' => $i]);
    }

    // ------------------------------------------------------------------ news
    $ncats = [['announcements', 'Announcements', 'ঘোষণা', 'fa-solid fa-bullhorn'], ['technology', 'Technology', 'প্রযুক্তি', 'fa-solid fa-microchip'],
        ['market', 'Market', 'মার্কেট', 'fa-solid fa-chart-line'], ['tips', 'Tips & Guides', 'টিপস ও গাইড', 'fa-solid fa-lightbulb']];
    $ncId = [];
    foreach ($ncats as $i => [$slug, $en, $bn, $icon]) $ncId[$slug] = $ins('news_categories', ['slug' => $slug, 'name_en' => $en, 'name_bn' => $bn, 'icon' => $icon, 'sort' => $i]);
    $ins('news', ['category_id' => $ncId['announcements'], 'author_id' => $o['admin_id'], 'slug' => 'welcome-to-our-new-platform', 'emoji' => '🚀', 'is_featured' => 1, 'status' => 'published',
        'title_en' => 'Welcome to our new platform', 'title_bn' => 'আমাদের নতুন প্ল্যাটফর্মে স্বাগতম',
        'excerpt_en' => 'Browse services, order online, pay with bKash or crypto and track everything from your profile.',
        'excerpt_bn' => 'সার্ভিস দেখুন, অনলাইনে অর্ডার করুন, বিকাশ বা ক্রিপ্টোতে পেমেন্ট করুন এবং প্রোফাইল থেকে সবকিছু ট্র্যাক করুন।',
        'content_en' => '<p>We are excited to launch our new platform! 🎉 Here is what you can do:</p><ul><li>Explore <a href="/services">all our services</a> and packages</li><li>Order online with <span class="rt-badge rt-badge-green">Buy Now</span></li><li>Pay with bKash, USDT or Binance Pay</li><li>Get instant notifications about your order</li></ul><div class="rt-alert rt-alert-success"><i class="fa-solid fa-circle-check rt-anim-pulse"></i> Install the app from the menu for the fastest experience.</div><p><a class="rt-btn" href="/services">Explore services</a></p>',
        'content_bn' => '<p>আমাদের নতুন প্ল্যাটফর্ম চালু হয়েছে! 🎉 আপনি যা করতে পারবেন:</p><ul><li><a href="/services">সব সার্ভিস</a> ও প্যাকেজ দেখুন</li><li><span class="rt-badge rt-badge-green">এখনই কিনুন</span> দিয়ে অনলাইনে অর্ডার করুন</li><li>বিকাশ, USDT বা Binance Pay দিয়ে পেমেন্ট করুন</li><li>অর্ডারের তাৎক্ষণিক নোটিফিকেশন পান</li></ul><div class="rt-alert rt-alert-success"><i class="fa-solid fa-circle-check rt-anim-pulse"></i> সবচেয়ে দ্রুত অভিজ্ঞতার জন্য মেনু থেকে অ্যাপটি ইনস্টল করুন।</div><p><a class="rt-btn" href="/services">সার্ভিস দেখুন</a></p>',
        'tags' => 'launch, platform', 'publish_at' => date('Y-m-d H:i:s', time() - 7200)]);
    $ins('news', ['category_id' => $ncId['technology'], 'author_id' => $o['admin_id'], 'slug' => 'new-nodejs-service-available', 'emoji' => '📢', 'status' => 'published',
        'title_en' => 'New Node.js service available', 'title_bn' => 'নতুন Node.js সার্ভিস চালু হয়েছে',
        'excerpt_en' => 'Full Node.js projects with backend, database, authentication and admin panel — from $50.',
        'excerpt_bn' => 'ব্যাকএন্ড, ডাটাবেস, অথেন্টিকেশন ও অ্যাডমিন প্যানেলসহ সম্পূর্ণ Node.js প্রজেক্ট — মাত্র $50 থেকে।',
        'content_en' => '<p><i class="fa-brands fa-node-js rt-up"></i> Our <strong>Node.js Full Project</strong> package is now available: full source code, responsive design, backend, database, authentication, admin panel, API, security, installation support and documentation.</p><p><a class="rt-btn" href="/services/nodejs-development">View package</a></p>',
        'content_bn' => '<p><i class="fa-brands fa-node-js rt-up"></i> আমাদের <strong>Node.js ফুল প্রজেক্ট</strong> প্যাকেজ এখন পাওয়া যাচ্ছে: সম্পূর্ণ সোর্স কোড, রেসপন্সিভ ডিজাইন, ব্যাকএন্ড, ডাটাবেস, অথেন্টিকেশন, অ্যাডমিন প্যানেল, API, সিকিউরিটি, ইনস্টলেশন সাপোর্ট ও ডকুমেন্টেশন।</p><p><a class="rt-btn" href="/services/nodejs-development">প্যাকেজ দেখুন</a></p>',
        'tags' => 'nodejs, service', 'publish_at' => date('Y-m-d H:i:s', time() - 3600)]);

    // ------------------------------------------------------------------ social links (enable after adding URLs)
    foreach ([['facebook', 'Facebook', 'fa-brands fa-facebook-f'], ['whatsapp', 'WhatsApp', 'fa-brands fa-whatsapp'], ['x', 'X (Twitter)', 'fa-brands fa-x-twitter'],
                 ['telegram', 'Telegram', 'fa-brands fa-telegram'], ['instagram', 'Instagram', 'fa-brands fa-instagram'], ['tiktok', 'TikTok', 'fa-brands fa-tiktok'], ['youtube', 'YouTube', 'fa-brands fa-youtube']] as $i => [$p, $l, $ic]) {
        $ins('social_links', ['platform' => $p, 'label' => $l, 'icon' => $ic, 'enabled' => 0, 'sort' => $i]);
    }

    // ------------------------------------------------------------------ settings
    $set = $pdo->prepare('INSERT INTO settings (k, v, grp) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)');
    foreach ($o['settings'] as $k => [$v, $grp]) $set->execute([$k, $v, $grp]);
}
