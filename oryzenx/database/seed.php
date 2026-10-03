<?php
/** Initial content so a fresh install is immediately usable. Everything is editable in Admin. */
return function (): void {
    if ((int)DB::val('SELECT COUNT(*) FROM services') > 0) return;

    $cats = [
        ['development', 'Development', 'ডেভেলপমেন্ট', 'fa-solid fa-code'],
        ['websites', 'Websites', 'ওয়েবসাইট', 'fa-solid fa-globe'],
        ['api', 'API & Integration', 'এপিআই ও ইন্টিগ্রেশন', 'fa-solid fa-plug'],
        ['optimization', 'Optimization & Security', 'অপ্টিমাইজেশন ও সিকিউরিটি', 'fa-solid fa-shield-halved'],
        ['ai', 'AI & Automation', 'এআই ও অটোমেশন', 'fa-solid fa-robot'],
    ];
    $catId = [];
    foreach ($cats as $i => [$slug, $name, $bn, $icon]) {
        $catId[$slug] = DB::insert('service_categories', ['slug' => $slug, 'name' => $name, 'name_bn' => $bn, 'icon' => $icon, 'sort_order' => $i]);
    }

    $full = ['Full source code', 'Responsive design', 'Backend + Database', 'Authentication system', 'Admin panel', 'API integration', 'Security implementation', 'Deployment support', 'Documentation', 'Customization'];
    $fullBn = ['সম্পূর্ণ সোর্স কোড', 'রেসপন্সিভ ডিজাইন', 'ব্যাকএন্ড + ডাটাবেস', 'অথেন্টিকেশন সিস্টেম', 'অ্যাডমিন প্যানেল', 'এপিআই ইন্টিগ্রেশন', 'সিকিউরিটি', 'ডিপ্লয়মেন্ট সাপোর্ট', 'ডকুমেন্টেশন', 'কাস্টমাইজেশন'];
    // slug, title, title_bn, short, short_bn, icon, color, price, currency, cat, featured, vip, features(null = full set)
    $services = [
        ['nodejs', 'Node.js Full Project', 'Node.js ফুল প্রজেক্ট', 'Modern web application with admin panel', 'অ্যাডমিন প্যানেলসহ আধুনিক ওয়েব অ্যাপ্লিকেশন', 'fa-brands fa-node-js', '#16a34a', 50, 'USD', 'development', 1, 1, null],
        ['react', 'React Development', 'রিয়্যাক্ট ডেভেলপমেন্ট', 'Modern UI/UX single page application', 'আধুনিক UI/UX সিঙ্গেল পেজ অ্যাপ্লিকেশন', 'fa-brands fa-react', '#0ea5e9', 40, 'USD', 'development', 1, 0, ['Component architecture', 'Responsive UI', 'State management', 'API integration', 'Performance optimization', 'Source code']],
        ['php', '5 Page PHP Website', '৫ পেজ PHP ওয়েবসাইট', 'PHP website with admin panel and MySQL', 'অ্যাডমিন প্যানেল ও MySQL সহ PHP ওয়েবসাইট', 'fa-brands fa-php', '#6366f1', 10, 'USD', 'development', 1, 0, ['5 pages', 'Admin panel', 'Responsive design', 'MySQL database', 'Basic SEO', 'Contact system']],
        ['html-css', 'HTML/CSS Website', 'HTML/CSS ওয়েবসাইট', 'Fast static website, pixel-perfect', 'দ্রুত স্ট্যাটিক ওয়েবসাইট', 'fa-brands fa-html5', '#ea580c', 8, 'USD', 'websites', 0, 0, ['Responsive layout', 'Clean code', 'Fast loading', 'Basic SEO']],
        ['landing-page', 'Landing Page', 'ল্যান্ডিং পেজ', 'High-converting business landing page', 'বিজনেস ল্যান্ডিং পেজ', 'fa-solid fa-rocket', '#8b5cf6', 15, 'USD', 'websites', 1, 0, ['Conversion focused design', 'Mobile first', 'Contact form', 'Speed optimized']],
        ['api', 'API Development', 'এপিআই ডেভেলপমেন্ট', 'REST API & integration', 'REST API ও ইন্টিগ্রেশন', 'fa-solid fa-diagram-project', '#0891b2', 30, 'USD', 'api', 1, 0, ['REST endpoints', 'Authentication (JWT/session)', 'Documentation', 'Rate limiting', 'Validation', 'Testing']],
        ['rest-api', 'REST API', 'REST API', 'Secure, documented REST endpoints', 'নিরাপদ ও ডকুমেন্টেড REST এন্ডপয়েন্ট', 'fa-solid fa-code-branch', '#0284c7', 25, 'USD', 'api', 0, 0, ['CRUD endpoints', 'Auth', 'Docs', 'Versioning']],
        ['admin-panel', 'Admin Panel', 'অ্যাডমিন প্যানেল', 'Complete admin dashboard for your business', 'আপনার ব্যবসার জন্য সম্পূর্ণ অ্যাডমিন ড্যাশবোর্ড', 'fa-solid fa-gauge-high', '#2563eb', 35, 'USD', 'development', 0, 0, ['User management', 'Roles & permissions', 'Reports', 'Settings']],
        ['ecommerce', 'E-commerce Store', 'ই-কমার্স স্টোর', 'Online store with payment integration', 'পেমেন্টসহ অনলাইন স্টোর', 'fa-solid fa-cart-shopping', '#db2777', 80, 'USD', 'websites', 1, 1, ['Product catalog', 'Cart & checkout', 'Payment gateway', 'Order management', 'Admin panel', 'Coupons']],
        ['job-website', 'Job Website', 'জব ওয়েবসাইট', 'Job portal with employer & candidate panels', 'এমপ্লয়ার ও ক্যান্ডিডেট প্যানেলসহ জব পোর্টাল', 'fa-solid fa-briefcase', '#0d9488', 90, 'USD', 'websites', 0, 0, ['Job posting', 'Applications', 'CV upload', 'Employer dashboard', 'Search & filters']],
        ['trading-website', 'Trading Website', 'ট্রেডিং ওয়েবসাইট', 'Trading platform with live charts', 'লাইভ চার্টসহ ট্রেডিং প্ল্যাটফর্ম', 'fa-solid fa-chart-line', '#16a34a', 150, 'USD', 'websites', 0, 1, ['Live charts', 'Wallet system', 'Deposits & withdrawals', 'Admin control', 'Security']],
        ['investment-website', 'Investment Website', 'ইনভেস্টমেন্ট ওয়েবসাইট', 'Investment plans, wallets and reports', 'ইনভেস্টমেন্ট প্ল্যান, ওয়ালেট ও রিপোর্ট', 'fa-solid fa-sack-dollar', '#ca8a04', 120, 'USD', 'websites', 0, 1, ['Plans & ROI', 'Wallets', 'Referral system', 'Reports', 'Admin panel']],
        ['portfolio', 'Portfolio Website', 'পোর্টফোলিও ওয়েবসাইট', 'Personal portfolio that stands out', 'আকর্ষণীয় ব্যক্তিগত পোর্টফোলিও', 'fa-solid fa-id-badge', '#7c3aed', 12, 'USD', 'websites', 0, 0, ['Projects showcase', 'CV download', 'Contact form']],
        ['business-website', 'Business Website', 'বিজনেস ওয়েবসাইট', 'Professional company website', 'প্রফেশনাল কোম্পানি ওয়েবসাইট', 'fa-solid fa-building', '#1d4ed8', 30, 'USD', 'websites', 0, 0, ['Company pages', 'Services', 'Blog', 'Contact', 'SEO']],
        ['news-website', 'News Website', 'নিউজ ওয়েবসাইট', 'News portal with categories and editor', 'ক্যাটাগরি ও এডিটরসহ নিউজ পোর্টাল', 'fa-solid fa-newspaper', '#dc2626', 60, 'USD', 'websites', 0, 0, ['Categories', 'Rich editor', 'Breaking news', 'Ads slots', 'SEO']],
        ['blog-website', 'Blog Website', 'ব্লগ ওয়েবসাইট', 'Fast, SEO-friendly blog', 'দ্রুত ও SEO-বান্ধব ব্লগ', 'fa-solid fa-blog', '#f97316', 20, 'USD', 'websites', 0, 0, ['Posts & categories', 'Comments', 'SEO', 'Share buttons']],
        ['cms', 'CMS', 'সিএমএস', 'Custom content management system', 'কাস্টম কনটেন্ট ম্যানেজমেন্ট সিস্টেম', 'fa-solid fa-layer-group', '#4f46e5', 70, 'USD', 'development', 0, 0, ['Pages & media', 'Roles', 'Editor', 'SEO tools']],
        ['dashboard', 'Dashboard', 'ড্যাশবোর্ড', 'Analytics dashboard with charts', 'চার্টসহ অ্যানালিটিক্স ড্যাশবোর্ড', 'fa-solid fa-chart-pie', '#0ea5e9', 40, 'USD', 'development', 0, 0, ['Charts', 'Reports', 'Exports', 'Filters']],
        ['custom-web-app', 'Custom Web Application', 'কাস্টম ওয়েব অ্যাপ্লিকেশন', 'Tailor-made application for your workflow', 'আপনার কাজের জন্য কাস্টম অ্যাপ্লিকেশন', 'fa-solid fa-cubes', '#2563eb', 100, 'USD', 'development', 1, 1, null],
        ['pwa', 'PWA', 'পিডব্লিউএ', 'Installable app experience for your site', 'ওয়েবসাইটকে ইনস্টলযোগ্য অ্যাপ বানান', 'fa-solid fa-mobile-screen-button', '#059669', 25, 'USD', 'development', 0, 0, ['Manifest & icons', 'Offline support', 'Push notifications', 'Install prompt']],
        ['optimization', 'Website Optimization', 'ওয়েবসাইট অপ্টিমাইজেশন', 'Speed up your website dramatically', 'আপনার ওয়েবসাইটকে দ্রুত করুন', 'fa-solid fa-gauge', '#16a34a', 15, 'USD', 'optimization', 0, 0, ['Core Web Vitals', 'Image optimization', 'Caching', 'Report']],
        ['seo', 'SEO', 'এসইও', 'Technical & on-page SEO', 'টেকনিক্যাল ও অন-পেজ এসইও', 'fa-solid fa-magnifying-glass-chart', '#ea580c', 20, 'USD', 'optimization', 0, 0, ['Technical audit', 'Meta & schema', 'Sitemap', 'Search Console setup']],
        ['security', 'Website Security', 'ওয়েবসাইট সিকিউরিটি', 'Audit and harden your website', 'ওয়েবসাইট অডিট ও সুরক্ষা', 'fa-solid fa-shield-halved', '#dc2626', 30, 'USD', 'optimization', 0, 0, ['Security audit', 'Malware cleanup', 'Hardening', 'SSL setup']],
        ['payment-integration', 'Payment Integration', 'পেমেন্ট ইন্টিগ্রেশন', 'bKash, crypto & gateway integration', 'বিকাশ, ক্রিপ্টো ও গেটওয়ে ইন্টিগ্রেশন', 'fa-solid fa-credit-card', '#e11d48', 25, 'USD', 'api', 0, 0, ['Gateway setup', 'Webhooks', 'Verification', 'Testing']],
        ['third-party-api', 'Third-party API Integration', 'থার্ড-পার্টি এপিআই ইন্টিগ্রেশন', 'Connect any external service', 'যেকোনো এক্সটার্নাল সার্ভিস সংযোগ', 'fa-solid fa-plug-circle-bolt', '#0891b2', 20, 'USD', 'api', 0, 0, ['API client', 'Error handling', 'Caching', 'Docs']],
        ['ai-integration', 'AI Integration', 'এআই ইন্টিগ্রেশন', 'Add AI features to your product', 'আপনার প্রোডাক্টে এআই যোগ করুন', 'fa-solid fa-brain', '#7c3aed', 40, 'USD', 'ai', 1, 0, ['Chatbots', 'Content generation', 'Classification', 'Secure server-side keys']],
        ['openai-integration', 'OpenAI Integration', 'OpenAI ইন্টিগ্রেশন', 'GPT powered assistants and tools', 'GPT ভিত্তিক অ্যাসিস্ট্যান্ট ও টুল', 'fa-solid fa-robot', '#10a37f', 35, 'USD', 'ai', 0, 0, ['Chat completion', 'Assistants', 'Embeddings', 'Usage limits']],
        ['automation', 'Automation', 'অটোমেশন', 'Automate repetitive business tasks', 'রিপিটেটিভ কাজ অটোমেট করুন', 'fa-solid fa-gears', '#475569', 30, 'USD', 'ai', 0, 0, ['Workflow design', 'Bots & scripts', 'Scheduling', 'Reports']],
        ['database', 'Database Development', 'ডাটাবেস ডেভেলপমেন্ট', 'Schema design, optimization and migration', 'স্কিমা ডিজাইন, অপ্টিমাইজেশন ও মাইগ্রেশন', 'fa-solid fa-database', '#0369a1', 25, 'USD', 'development', 0, 0, ['Schema design', 'Indexing', 'Migrations', 'Backups']],
        ['custom-software', 'Custom Software', 'কাস্টম সফটওয়্যার', 'Software built exactly for your needs', 'আপনার প্রয়োজন অনুযায়ী সফটওয়্যার', 'fa-solid fa-laptop-code', '#1e40af', 150, 'USD', 'development', 0, 1, null],
    ];
    foreach ($services as $i => $s) {
        [$slug, $title, $titleBn, $short, $shortBn, $icon, $color, $price, $cur, $cat, $feat, $vip, $features] = $s;
        $id = DB::insert('services', [
            'category_id' => $catId[$cat], 'slug' => $slug, 'title' => $title, 'title_bn' => $titleBn, 'short_desc' => $short, 'short_desc_bn' => $shortBn,
            'description' => '<p>' . e($short) . '. We deliver clean, secure and well-documented work with responsive design and post-delivery support.</p>',
            'icon' => $icon, 'icon_color' => $color, 'price' => $price, 'currency' => $cur, 'price_plus' => 1, 'delivery_days' => '3-7', 'support_days' => '30',
            'is_featured' => $feat, 'is_vip' => $vip, 'sort_order' => $i,
        ]);
        foreach ($features ?? $full as $j => $f) {
            DB::insert('service_features', ['service_id' => $id, 'feature' => $f, 'feature_bn' => $features === null ? $fullBn[$j] : null, 'sort_order' => $j]);
        }
    }

    $methods = [
        ['bkash', 'bKash', 'mobile', null, 'img/pay/bkash.svg', '01700000000', 'Oryzenx', 'Personal', 'Send Money to the number above, then enter the bKash transaction ID.', 'উপরের নম্বরে Send Money করুন, তারপর বিকাশ ট্রানজেকশন আইডি দিন।'],
        ['usdt_trc20', 'USDT (TRC20)', 'crypto', 'TRC20', 'img/pay/usdt.svg', '', '', null, 'Send USDT on the TRON (TRC20) network only.', 'শুধুমাত্র TRON (TRC20) নেটওয়ার্কে USDT পাঠান।'],
        ['usdt_bep20', 'USDT (BEP20)', 'crypto', 'BEP20', 'img/pay/usdt-bep.svg', '', '', null, 'Send USDT on the BNB Smart Chain (BEP20) network only.', 'শুধুমাত্র BNB Smart Chain (BEP20) নেটওয়ার্কে USDT পাঠান।'],
        ['binance_pay', 'Binance Pay', 'exchange', null, 'img/pay/binance.svg', '', '', null, 'Pay with Binance Pay to the Pay ID above and paste the order ID.', 'উপরের Pay ID তে Binance Pay করুন এবং অর্ডার আইডি দিন।'],
    ];
    foreach ($methods as $i => [$code, $name, $type, $net, $logo, $acc, $accName, $accType, $ins, $insBn]) {
        DB::insert('payment_methods', ['code' => $code, 'name' => $name, 'type' => $type, 'network' => $net, 'logo' => $logo, 'account_number' => $acc,
            'account_name' => $accName, 'account_type' => $accType, 'instructions' => $ins, 'instructions_bn' => $insBn, 'is_active' => 1, 'sort_order' => $i]);
    }

    $pc = [];
    foreach ([['development', 'Development', 'ডেভেলপমেন্ট'], ['updates', 'Updates', 'আপডেট'], ['crypto', 'Crypto', 'ক্রিপ্টো'], ['ai', 'AI', 'এআই']] as $i => [$slug, $n, $bn]) {
        $pc[$slug] = DB::insert('post_categories', ['slug' => $slug, 'name' => $n, 'name_bn' => $bn, 'sort_order' => $i]);
    }
    $posts = [
        ['🎉', 'New payment system live', 'নতুন পেমেন্ট সিস্টেম চালু', 'updates', 24],
        ['🤖', 'AI chatbot is now more powerful', 'AI চ্যাটবট এখন আরও শক্তিশালী', 'ai', 12],
        ['💡', 'Web development tips for 2026', 'Web Development Tips', 'development', 8],
        ['🚀', 'Node.js full project service launched', 'Node.js নতুন সার্ভিস চালু', 'development', 5],
        ['📈', 'Bitcoin market update', 'Bitcoin Market Update', 'crypto', 2],
    ];
    foreach ($posts as [$icon, $title, $titleBn, $cat, $hoursAgo]) {
        DB::insert('posts', [
            'category_id' => $pc[$cat], 'title' => $titleBn, 'slug' => slugify($title), 'icon' => $icon,
            'excerpt' => $title . ' — read the full update from the Oryzenx team.',
            'content' => '<p>' . $icon . ' <strong>' . e($title) . '</strong></p><p>This is a sample post created during installation. Edit or delete it from <em>Admin → Posts</em>.</p><ul><li>✅ Fast</li><li>⚡ Secure</li><li>🔥 Modern</li></ul>',
            'tags' => $cat . ', oryzenx', 'status' => 'published', 'published_at' => date('Y-m-d H:i:s', time() - $hoursAgo * 3600),
        ]);
    }

    $team = [
        ['Rahatul Islam', 'CEO & Founder', 'সিইও ও প্রতিষ্ঠাতা', 'Full-stack engineer leading product and delivery.', 'Node.js, React, Architecture', 1, 'VIP'],
        ['Samia Akter', 'Node.js Developer', 'Node.js ডেভেলপার', 'Builds fast APIs and real-time systems.', 'Node.js, Express, MongoDB', 1, 'VIP'],
        ['Mehedi Hasan', 'PHP Master', 'PHP মাস্টার', 'Core PHP, Laravel and MySQL specialist.', 'PHP, MySQL, Security', 0, null],
        ['Nabila Rahman', 'SEO Specialist', 'SEO স্পেশালিস্ট', 'Technical SEO and growth.', 'SEO, Analytics, Content', 0, null],
    ];
    foreach ($team as $i => [$n, $r, $rbn, $bio, $skills, $vip, $badge]) {
        DB::insert('team_members', ['name' => $n, 'role' => $r, 'role_bn' => $rbn, 'bio' => $bio, 'skills' => $skills, 'is_vip' => $vip, 'badge_text' => $badge, 'badge_animated' => $vip, 'sort_order' => $i]);
    }

    $faqs = [
        ['How do I order a service?', 'কিভাবে সার্ভিস অর্ডার করব?', 'Open a service, tap Buy Now, pay with any listed method and submit the transaction ID. We confirm after verification.', 'সার্ভিস খুলে Buy Now চাপুন, পেমেন্ট করে ট্রানজেকশন আইডি জমা দিন। যাচাই শেষে আমরা নিশ্চিত করব।'],
        ['How long does delivery take?', 'ডেলিভারিতে কত সময় লাগে?', 'Most projects are delivered in 3–7 days. Larger projects get a timeline before starting.', 'বেশিরভাগ প্রজেক্ট ৩–৭ দিনে ডেলিভারি হয়। বড় প্রজেক্টে শুরুতেই সময়সূচি জানানো হয়।'],
        ['Do I get the full source code?', 'আমি কি সম্পূর্ণ সোর্স কোড পাব?', 'Yes. Full source code and documentation are included with every project.', 'হ্যাঁ। প্রতিটি প্রজেক্টে সম্পূর্ণ সোর্স কোড ও ডকুমেন্টেশন দেওয়া হয়।'],
        ['Which payment methods do you accept?', 'কোন কোন পেমেন্ট মাধ্যম গ্রহণ করেন?', 'bKash, USDT (TRC20/BEP20) and Binance Pay.', 'বিকাশ, USDT (TRC20/BEP20) এবং Binance Pay।'],
        ['Is support included after delivery?', 'ডেলিভারির পরে কি সাপোর্ট পাব?', 'Yes, every project includes free support for the period shown on the service page.', 'হ্যাঁ, সার্ভিস পেজে উল্লেখিত সময় পর্যন্ত ফ্রি সাপোর্ট দেওয়া হয়।'],
    ];
    foreach ($faqs as $i => [$q, $qbn, $a, $abn]) DB::insert('faqs', ['question' => $q, 'question_bn' => $qbn, 'answer' => $a, 'answer_bn' => $abn, 'category' => 'General', 'sort_order' => $i]);

    $slides = [
        ['Node.js & React', 'Node.js ও React', 'Full-stack apps with admin panel', 'অ্যাডমিন প্যানেলসহ ফুল-স্ট্যাক অ্যাপ', 'fa-brands fa-node-js', '/services/nodejs'],
        ['E-commerce', 'ই-কমার্স', 'Sell online with integrated payments', 'পেমেন্টসহ অনলাইনে বিক্রি করুন', 'fa-solid fa-cart-shopping', '/services/ecommerce'],
        ['AI Integration', 'এআই ইন্টিগ্রেশন', 'Chatbots and smart automation', 'চ্যাটবট ও স্মার্ট অটোমেশন', 'fa-solid fa-robot', '/services/ai-integration'],
    ];
    foreach ($slides as $i => [$t, $tbn, $s, $sbn, $ic, $link]) DB::insert('slides', ['title' => $t, 'title_bn' => $tbn, 'subtitle' => $s, 'subtitle_bn' => $sbn, 'icon' => $ic, 'link' => $link, 'button_text' => 'View', 'sort_order' => $i]);
};
