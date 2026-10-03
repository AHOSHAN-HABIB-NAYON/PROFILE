<?php
/**
 * Built-in assistant — works with NO API key.
 *
 * Understands Bangla, English and Banglish questions about services,
 * prices, payment, ordering, delivery, contact, news, team, account and
 * the FAQ, and answers from the live database. Replies carry optional
 * rich "cards" (service/product/news/contact) and quick-reply "chips".
 */
defined('APP') || exit;

/** Lower-case and normalise a message for keyword matching. */
function ail_norm(string $s): string
{
    $s = mb_strtolower(trim($s));
    $s = str_replace(['’', '`', '?', '!', '।', ',', '.', ':', ';', '"', '(', ')', '/'], [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '], $s);
    return ' ' . preg_replace('~\s+~u', ' ', $s) . ' ';
}

/** Does the message contain any of the keywords? (Latin keywords match whole words.) */
function ail_has(string $msg, array $words): bool
{
    foreach ($words as $w) {
        $w = mb_strtolower($w);
        if (preg_match('~^[a-z0-9 \-]+$~', $w)) {
            if (preg_match('~(?<![a-z0-9])' . preg_quote(trim($w), '~') . '(?![a-z0-9])~', $msg)) return true;
        } elseif (mb_strpos($msg, $w) !== false) {
            return true;
        }
    }
    return false;
}

function ail_lang(string $raw): string
{
    if (preg_match('~\p{Bengali}~u', $raw)) return 'bn';
    $m = ail_norm($raw);
    if (ail_has($m, ['koto', 'dam', 'kivabe', 'kibhabe', 'ami', 'apnar', 'apnara', 'ki ki', 'kemon', 'lagbe', 'chai', 'korte', 'taka', 'kinbo', 'bikash', 'ache', 'nai', 'koren', 'den', 'bolen'])) return 'bn';
    return 'en';
}

/** Distinctive keywords for each service (slug parts + Bangla title words, minus generic words). */
function ail_service_keywords(array $s): array
{
    $generic = ['development', 'website', 'web', 'system', 'setup', 'design', 'integration', 'full', 'custom', 'page', 'project', 'and', 'the', 'api',
        'application', 'app', 'news', 'portal', 'third', 'party', 'mobile', 'responsive', 'login', 'pro',
        'ডেভেলপমেন্ট', 'ওয়েবসাইট', 'ওয়েব', 'সিস্টেম', 'সেটআপ', 'ডিজাইন', 'ইন্টিগ্রেশন', 'সম্পূর্ণ', 'কাস্টম', 'পেজ', 'প্রজেক্ট', 'ও',
        'অ্যাপ্লিকেশন', 'অ্যাপ', 'নিউজ', 'পোর্টাল', 'থার্ড-পার্টি', 'মোবাইল', 'রেসপন্সিভ', 'লগইন'];
    $words = array_merge(explode('-', $s['slug']), preg_split('~[\s/()]+~u', mb_strtolower((string)$s['title_en'])), preg_split('~[\s/()]+~u', mb_strtolower((string)$s['title_bn'])));
    $aliases = [
        'nodejs-development' => ['node', 'nodejs', 'node.js', 'express', 'নোড'], 'php-development' => ['php', 'পিএইচপি', 'laravel'],
        'react-development' => ['react', 'next', 'nextjs', 'next.js', 'রিয়েক্ট'], 'ecommerce-website' => ['ecommerce', 'e-commerce', 'shop', 'store', 'ই-কমার্স', 'ইকমার্স', 'দোকান', 'অনলাইন শপ'],
        'landing-page' => ['landing', 'ল্যান্ডিং'], 'ai-chatbot' => ['chatbot', 'bot', 'ai', 'চ্যাটবট', 'এআই'], 'seo' => ['seo', 'google ranking', 'এসইও', 'র‍্যাংক'],
        'pwa' => ['pwa', 'installable', 'app'], 'portfolio-website' => ['portfolio', 'পোর্টফোলিও', 'cv'], 'news-portal' => ['news portal', 'নিউজ পোর্টাল'],
        'job-portal' => ['job', 'জব', 'চাকরি'], 'payment-integration' => ['payment gateway', 'gateway', 'stripe', 'পেমেন্ট গেটওয়ে'],
        'google-login' => ['google login', 'গুগল লগইন'], 'passkey' => ['passkey', 'fingerprint', 'পাসকি'], 'website-maintenance' => ['maintenance', 'মেইনটেন্যান্স'],
        'hosting-setup' => ['hosting', 'domain', 'ssl', 'হোস্টিং', 'ডোমেইন'], 'security-setup' => ['security', 'hack', 'malware', 'সিকিউরিটি', 'হ্যাক'],
        'html-css-website' => ['html', 'css', 'static'], 'speed-optimization' => ['speed', 'slow', 'fast', 'স্পিড', 'ধীর'],
        'admin-dashboard' => ['dashboard', 'ড্যাশবোর্ড'], 'saas-website' => ['saas', 'subscription'], 'trading-website' => ['trading', 'ট্রেডিং'],
        'investment-website' => ['investment', 'ইনভেস্টমেন্ট'], 'business-website' => ['business', 'company', 'বিজনেস', 'কোম্পানি'],
        'rest-api' => ['rest', 'rest api'], 'api-development' => ['api'], 'database-system' => ['database', 'mysql', 'ডাটাবেস'],
        'web-push' => ['push', 'পুশ'], 'email-system' => ['email system', 'smtp'], 'full-website-development' => ['website', 'ওয়েবসাইট', 'site', 'সাইট'],
    ];
    $kw = array_merge($words, $aliases[$s['slug']] ?? []);
    return array_values(array_unique(array_filter($kw, fn($w) => mb_strlen($w) >= 2 && !in_array($w, $generic, true) || in_array($w, $aliases[$s['slug']] ?? [], true))));
}

/** Find the services the message talks about, best first. */
function ail_match_services(string $msg): array
{
    $hits = [];
    foreach (rows('SELECT * FROM services WHERE status = 1') as $s) {
        $score = 0;
        foreach (ail_service_keywords($s) as $k) {
            if (!ail_has($msg, [$k])) continue;
            // generic words only break ties; technology/product words decide
            $score += in_array($k, ['website', 'ওয়েবসাইট', 'site', 'সাইট', 'app', 'ai', 'api', 'bot', 'business', 'company', 'fast', 'static'], true)
                ? 1 : mb_strlen($k) + (preg_match('~^[a-z0-9.+-]+$~', $k) ? 8 : 2); // latin tech words (php, react, node…) are strong signals
        }
        if ($score) $hits[] = [$score, $s];
    }
    usort($hits, fn($a, $b) => $b[0] <=> $a[0]);
    return array_column($hits, 1);
}

function ail_product_card(array $p, string $serviceSlug, string $l): array
{
    $usd = product_price($p, 'USD');
    $bdt = product_price($p, 'BDT');
    return ['icon' => fa($p['icon'] ?: 'fa-solid fa-box'), 'title' => loc($p, 'name', $l), 'sub' => ($p['delivery_days'] ? ($l === 'bn' ? bn_digits((string)$p['delivery_days']) . ' দিনে ডেলিভারি' : $p['delivery_days'] . ' days delivery') : ''),
        'price' => '$' . rtrim(rtrim(number_format($usd, 2), '0'), '.') . ' · ৳' . number_format($bdt), 'url' => url('/services/' . $serviceSlug)];
}

/**
 * Main entry: answer a visitor message from site data.
 * Returns ['reply' => string, 'cards' => [], 'chips' => []]
 */
function ai_local_reply(string $raw): array
{
    $l = ail_lang($raw);
    $L = fn(string $en, string $bn) => $l === 'bn' ? $bn : $en;
    $m = ail_norm($raw);
    $site = (string)setting('site_name');
    $cards = [];
    $defaultChips = [
        ['t' => $L('Services', 'সার্ভিস'), 'q' => $L('What services do you offer?', 'আপনারা কী কী সার্ভিস দেন?')],
        ['t' => $L('Prices', 'দাম'), 'q' => $L('What are your prices?', 'দাম কত?')],
        ['t' => $L('Payment', 'পেমেন্ট'), 'q' => $L('How can I pay?', 'কিভাবে পেমেন্ট করব?')],
        ['t' => $L('Talk to a human', 'মানুষের সাথে কথা'), 'action' => 'support'],
    ];
    $is = fn(array $w) => ail_has($m, $w);

    $intent = [
        'human' => $is(['human', 'agent', 'real person', 'live support', 'live chat', 'admin', 'মানুষ', 'এজেন্ট', 'লাইভ', 'অ্যাডমিন']),
        'payment' => $is(['payment', 'pay', 'paying', 'bkash', 'bikash', 'usdt', 'binance', 'crypto', 'trc20', 'bep20', 'nagad', 'rocket', 'method', 'পেমেন্ট', 'বিকাশ', 'ক্রিপ্টো', 'বাইনান্স', 'নগদ', 'টাকা পাঠা', 'পে করব', 'পেমেন্ট মেথড']),
        'order' => $is(['order', 'buy', 'purchase', 'checkout', 'kinbo', 'kinte', 'অর্ডার', 'কিনব', 'কিনতে', 'কেনা', 'কিভাবে নেব', 'নিতে চাই']),
        'contact' => $is(['contact', 'whatsapp', 'phone', 'call', 'email', 'mail', 'number', 'address', 'office', 'location', 'যোগাযোগ', 'হোয়াটসঅ্যাপ', 'ফোন', 'নম্বর', 'নাম্বার', 'ইমেইল', 'ঠিকানা', 'অফিস']),
        'delivery' => $is(['delivery', 'how long', 'days', 'deadline', 'duration', 'when', 'ডেলিভারি', 'কতদিন', 'কত দিন', 'কত সময়', 'সময় লাগ', 'কবে']),
        'price' => $is(['price', 'prices', 'cost', 'how much', 'pricing', 'rate', 'charge', 'fee', 'budget', 'cheap', 'package', 'dam', 'koto', 'taka', 'দাম', 'মূল্য', 'কত', 'টাকা', 'খরচ', 'বাজেট', 'প্যাকেজ', 'সস্তা']),
        'services' => $is(['service', 'services', 'offer', 'provide', 'what do you do', 'what can you', 'সার্ভিস', 'সেবা', 'কী কী', 'কি কি', 'কাজ করেন', 'কি করেন', 'ki ki']),
        'news' => $is(['news', 'update', 'updates', 'latest', 'blog', 'post', 'নিউজ', 'খবর', 'আপডেট', 'পোস্ট']),
        'team' => $is(['team', 'developer', 'developers', 'who are you', 'about you', 'about us', 'company', 'টিম', 'ডেভেলপার', 'কারা', 'আপনারা কে', 'সম্পর্কে']),
        'account' => $is(['login', 'log in', 'register', 'sign up', 'signup', 'account', 'password', '2fa', 'verify', 'লগইন', 'অ্যাকাউন্ট', 'একাউন্ট', 'রেজিস্টার', 'পাসওয়ার্ড', 'ভেরিফাই']),
        'refund' => $is(['refund', 'money back', 'guarantee', 'cancel', 'রিফান্ড', 'ফেরত', 'গ্যারান্টি', 'বাতিল']),
        'thanks' => $is(['thank', 'thanks', 'thx', 'tnx', 'ধন্যবাদ', 'থ্যাংকস', 'শুকরিয়া']),
        'greet' => $is(['hi', 'hello', 'hey', 'hola', 'salam', 'assalamu', 'good morning', 'good evening', 'হাই', 'হ্যালো', 'হেলো', 'সালাম', 'আসসালামু', 'নমস্কার', 'শুভ']),
    ];
    $services = ail_match_services($m);
    // a clear FAQ hit beats keyword intents ("Do you provide source code?")
    if (!$intent['human'] && ($faq = ail_faq($m, $l, .6))) return ['reply' => $faq, 'cards' => [], 'chips' => $defaultChips];
    // "latest news" / "contact" style questions are not about a service
    if ($intent['news'] && !$intent['price']) $services = [];

    // ---------------- talk to a human ----------------
    if ($intent['human']) {
        return ['reply' => $L("Sure! Tap **Live support** and a real person from our team will reply — usually within a few hours.",
            "অবশ্যই! **লাইভ সাপোর্ট** ট্যাবে চাপুন — আমাদের টিমের একজন মানুষ উত্তর দেবেন, সাধারণত কয়েক ঘণ্টার মধ্যে।"),
            'cards' => ail_contact_cards($L), 'chips' => [['t' => $L('Open live support', 'লাইভ সাপোর্ট খুলুন'), 'action' => 'support']]];
    }

    // ---------------- a specific service (optionally with price/delivery) ----------------
    if ($services && !$intent['payment'] && !$intent['contact']) {
        $s = $services[0];
        $products = rows('SELECT * FROM products WHERE service_id = ? AND status = 1 ORDER BY is_featured DESC, sort, id LIMIT 4', [$s['id']]);
        $title = loc($s, 'title', $l);
        $text = "**$title** — " . loc($s, 'short', $l);
        if ($products) {
            $min = min(array_map(fn($p) => product_price($p, 'USD'), $products));
            $text .= "\n" . $L('Packages start from **$' . $min . '**. Here are the options:', 'প্যাকেজ শুরু **$' . $min . '** থেকে। অপশনগুলো দেখুন:');
            foreach ($products as $p) $cards[] = ail_product_card($p, $s['slug'], $l);
        } else {
            $text .= "\n" . ($s['price_from'] ? $L('Starts from **$' . (float)$s['price_from'] . '**. ', 'শুরু **$' . (float)$s['price_from'] . '** থেকে। ') : '')
                . $L('The final price depends on your requirements — send us the details for a free quote.', 'চূড়ান্ত দাম আপনার প্রয়োজনের উপর নির্ভর করে — বিস্তারিত পাঠালে ফ্রি কোটেশন দেব।');
            $cards[] = ['icon' => fa($s['icon']), 'title' => $title, 'sub' => $L('View details', 'বিস্তারিত দেখুন'), 'url' => url('/services/' . $s['slug'])];
        }
        if (count($services) > 1) {
            $others = array_slice($services, 1, 3);
            $text .= "\n" . $L('Related: ', 'সম্পর্কিত: ') . implode(', ', array_map(fn($x) => loc($x, 'title', $l), $others));
        }
        return ['reply' => $text, 'cards' => $cards, 'chips' => [
            ['t' => $L('How to order', 'কিভাবে অর্ডার করব'), 'q' => $L('How do I order?', 'কিভাবে অর্ডার করব?')],
            ['t' => $L('Payment methods', 'পেমেন্ট মেথড'), 'q' => $L('How can I pay?', 'কিভাবে পেমেন্ট করব?')],
            ['t' => $L('Open service', 'সার্ভিস পেজ'), 'url' => url('/services/' . $s['slug'])],
        ]];
    }

    // ---------------- payment ----------------
    if ($intent['payment']) {
        $methods = rows('SELECT name, currency FROM payment_methods WHERE enabled = 1 ORDER BY sort');
        if ($methods) {
            $list = implode("\n", array_map(fn($x) => '• ' . $x['name'] . ' (' . ($x['currency'] === 'BDT' ? $L('pay in BDT', 'টাকায়') : $L('pay in USD/USDT', 'USD/USDT তে')) . ')', $methods));
            $text = $L("We accept:\n$list", "আমরা যেভাবে পেমেন্ট নিই:\n$list");
        } else {
            $text = $L('We accept bKash, USDT (TRC20/BEP20) and Binance Pay. Contact us and we will share the payment details.', 'আমরা বিকাশ, USDT (TRC20/BEP20) ও Binance Pay নিই। পেমেন্টের তথ্যের জন্য আমাদের সাথে যোগাযোগ করুন।');
        }
        if (setting_bool('payment.allow_balance')) $text .= "\n" . $L('• Account balance (instant)', '• অ্যাকাউন্ট ব্যালেন্স (সাথে সাথে)');
        $text .= "\n\n" . $L("**How it works:** click **Buy now** on a package → choose a method → send the exact amount → submit the TXID + screenshot. We verify it and notify you right away.",
            "**কিভাবে কাজ করে:** প্যাকেজে **এখনই কিনুন** চাপুন → মেথড বাছুন → সঠিক পরিমাণ পাঠান → TXID ও স্ক্রিনশট জমা দিন। যাচাই করে সাথে সাথে জানিয়ে দেব।");
        return ['reply' => $text, 'cards' => [], 'chips' => [
            ['t' => $L('See packages', 'প্যাকেজ দেখুন'), 'q' => $L('What are your prices?', 'দাম কত?')],
            ['t' => $L('My orders', 'আমার অর্ডার'), 'url' => url('/payment')],
            ['t' => $L('Talk to a human', 'মানুষের সাথে কথা'), 'action' => 'support'],
        ]];
    }

    // ---------------- ordering ----------------
    if ($intent['order']) {
        return ['reply' => $L("Ordering takes 2 minutes:\n1. Open a service and pick a package\n2. Tap **Buy now** (log in or create an account)\n3. Choose bKash / USDT / Binance Pay and send the amount\n4. Submit the TXID and a screenshot\n5. We verify it and start your project — you get a notification at every step.",
            "অর্ডার করতে মাত্র ২ মিনিট:\n১. একটি সার্ভিস খুলে প্যাকেজ বাছুন\n২. **এখনই কিনুন** চাপুন (লগইন বা অ্যাকাউন্ট খুলুন)\n৩. বিকাশ / USDT / Binance Pay দিয়ে টাকা পাঠান\n৪. TXID ও স্ক্রিনশট জমা দিন\n৫. যাচাই করে কাজ শুরু করব — প্রতিটি ধাপে নোটিফিকেশন পাবেন।"),
            'cards' => [['icon' => 'fa-solid fa-layer-group', 'title' => $L('Browse services', 'সার্ভিস দেখুন'), 'sub' => $L('Pick a package', 'একটি প্যাকেজ বাছুন'), 'url' => url('/services')]],
            'chips' => [['t' => $L('Prices', 'দাম'), 'q' => $L('What are your prices?', 'দাম কত?')], ['t' => $L('Payment methods', 'পেমেন্ট মেথড'), 'q' => $L('How can I pay?', 'কিভাবে পেমেন্ট করব?')]]];
    }

    // ---------------- contact ----------------
    if ($intent['contact']) {
        $parts = [];
        if (setting('contact.whatsapp')) $parts[] = 'WhatsApp: ' . setting('contact.whatsapp');
        if (setting('contact.phone')) $parts[] = $L('Phone: ', 'ফোন: ') . setting('contact.phone');
        if (setting('contact.email')) $parts[] = $L('Email: ', 'ইমেইল: ') . setting('contact.email');
        if (setting_l('contact.address')) $parts[] = $L('Address: ', 'ঠিকানা: ') . loc(['x_en' => setting('contact.address_en'), 'x_bn' => setting('contact.address_bn')], 'x', $l);
        if (setting_l('contact.hours')) $parts[] = $L('Hours: ', 'সময়: ') . loc(['x_en' => setting('contact.hours_en'), 'x_bn' => setting('contact.hours_bn')], 'x', $l);
        return ['reply' => $L("You can reach us here:\n", "এভাবে যোগাযোগ করতে পারেন:\n") . implode("\n", $parts ?: [$L('Use the contact form or live support.', 'কন্টাক্ট ফর্ম বা লাইভ সাপোর্ট ব্যবহার করুন।')]),
            'cards' => ail_contact_cards($L), 'chips' => [['t' => $L('Live support', 'লাইভ সাপোর্ট'), 'action' => 'support']]];
    }

    // ---------------- delivery time ----------------
    if ($intent['delivery']) {
        $r = row('SELECT MIN(delivery_days) mn, MAX(delivery_days) mx FROM products WHERE status = 1 AND delivery_days > 1');
        $mn = (int)($r['mn'] ?? 3);
        $mx = (int)($r['mx'] ?? 14);
        return ['reply' => $L("Most projects are delivered in **{$mn}–{$mx} days**, depending on the package. Each package shows its exact delivery time and support period.",
            "বেশিরভাগ প্রজেক্ট **" . bn_digits("{$mn}–{$mx}") . " দিনে** ডেলিভারি দেওয়া হয়, প্যাকেজ অনুযায়ী। প্রতিটি প্যাকেজে সঠিক ডেলিভারি সময় ও সাপোর্ট পিরিয়ড লেখা থাকে।"),
            'cards' => [], 'chips' => [['t' => $L('See packages', 'প্যাকেজ দেখুন'), 'q' => $L('What are your prices?', 'দাম কত?')]]];
    }

    // ---------------- prices (no specific service) ----------------
    if ($intent['price']) {
        $ps = rows('SELECT p.*, s.slug AS sslug FROM products p JOIN services s ON s.id = p.service_id WHERE p.status = 1 AND s.status = 1 ORDER BY p.is_featured DESC, p.price_usd LIMIT 5');
        foreach ($ps as $p) $cards[] = ail_product_card($p, $p['sslug'], $l);
        $min = $ps ? min(array_map(fn($p) => product_price($p, 'USD'), $ps)) : null;
        return ['reply' => $min !== null
            ? $L("Our packages start from **\$$min**. Popular options:", "আমাদের প্যাকেজ শুরু মাত্র **\$$min** থেকে। জনপ্রিয় অপশন:")
            : $L('Prices depend on the project — send us your requirements for a free quote.', 'দাম প্রজেক্ট অনুযায়ী — প্রয়োজন জানালে ফ্রি কোটেশন দেব।'),
            'cards' => $cards, 'chips' => [
                ['t' => 'Node.js', 'q' => $L('Node.js price', 'Node.js এর দাম কত?')], ['t' => 'PHP', 'q' => $L('PHP website price', 'PHP ওয়েবসাইটের দাম কত?')],
                ['t' => $L('E-commerce', 'ই-কমার্স'), 'q' => $L('E-commerce price', 'ই-কমার্স ওয়েবসাইটের দাম কত?')], ['t' => $L('All services', 'সব সার্ভিস'), 'url' => url('/services')]]];
    }

    // ---------------- services overview ----------------
    if ($intent['services']) {
        $cats = rows('SELECT c.*, COUNT(s.id) n FROM service_categories c JOIN services s ON s.category_id = c.id AND s.status = 1 WHERE c.status = 1 GROUP BY c.id ORDER BY c.sort');
        $list = implode("\n", array_map(fn($c) => '• ' . loc($c, 'name', $l) . ' (' . ($l === 'bn' ? bn_digits((string)$c['n']) : $c['n']) . ')', $cats));
        foreach (rows('SELECT * FROM services WHERE status = 1 AND is_featured = 1 ORDER BY sort LIMIT 4') as $s) {
            $cards[] = ['icon' => fa($s['icon']), 'title' => loc($s, 'title', $l), 'sub' => loc($s, 'short', $l), 'url' => url('/services/' . $s['slug'])];
        }
        return ['reply' => $L("We build complete websites and web apps. Our service categories:\n$list\n\nPopular right now:", "আমরা সম্পূর্ণ ওয়েবসাইট ও ওয়েব অ্যাপ তৈরি করি। আমাদের সার্ভিস ক্যাটাগরি:\n$list\n\nজনপ্রিয় সার্ভিস:"),
            'cards' => $cards, 'chips' => [['t' => $L('Prices', 'দাম'), 'q' => $L('What are your prices?', 'দাম কত?')], ['t' => $L('All services', 'সব সার্ভিস'), 'url' => url('/services')]]];
    }

    // ---------------- news ----------------
    if ($intent['news']) {
        foreach (rows("SELECT id, title_en, title_bn, emoji, publish_at FROM news WHERE status = 'published' AND publish_at <= NOW() ORDER BY publish_at DESC LIMIT 3") as $n) {
            $cards[] = ['icon' => 'fa-regular fa-newspaper', 'title' => trim(($n['emoji'] ? $n['emoji'] . ' ' : '') . loc($n, 'title', $l)), 'sub' => time_ago($n['publish_at']), 'url' => url('/news/' . $n['id'])];
        }
        return ['reply' => $cards ? $L('Here are our latest updates:', 'আমাদের সর্বশেষ আপডেট:') : $L('No news yet — check back soon!', 'এখনো কোনো নিউজ নেই — শিগগিরই আসছে!'),
            'cards' => $cards, 'chips' => [['t' => $L('All news', 'সব নিউজ'), 'url' => url('/news')]]];
    }

    // ---------------- team / about ----------------
    if ($intent['team']) {
        $about = loc(['x_en' => setting('home.about_text_en'), 'x_bn' => setting('home.about_text_bn')], 'x', $l);
        return ['reply' => "**$site** — $about", 'cards' => [['icon' => 'fa-solid fa-users', 'title' => $L('Meet the team', 'টিমের সাথে পরিচিত হন'), 'sub' => '', 'url' => url('/team')]], 'chips' => $defaultChips];
    }

    // ---------------- account help ----------------
    if ($intent['account']) {
        return ['reply' => $L("• **Create an account:** tap Sign up, verify your email, done.\n• **Forgot password:** use “Forgot password?” on the login page.\n• **Extra security:** turn on 2FA or add a passkey in Profile → Security.",
            "• **অ্যাকাউন্ট খুলতে:** সাইন আপ চাপুন, ইমেইল ভেরিফাই করুন — ব্যস।\n• **পাসওয়ার্ড ভুলে গেলে:** লগইন পেজে “পাসওয়ার্ড ভুলে গেছেন?” চাপুন।\n• **বাড়তি নিরাপত্তা:** প্রোফাইল → সিকিউরিটি থেকে 2FA বা পাসকি চালু করুন।"),
            'cards' => [], 'chips' => [['t' => $L('Log in', 'লগইন'), 'url' => url('/login')], ['t' => $L('Sign up', 'সাইন আপ'), 'url' => url('/register')]]];
    }

    // ---------------- FAQ match ----------------
    if ($faq = ail_faq($m, $l)) return ['reply' => $faq, 'cards' => [], 'chips' => $defaultChips];

    if ($intent['refund']) {
        return ['reply' => $L('If something is not right, contact us before or right after payment — unpaid orders can be cancelled any time, and our team reviews every paid order personally.',
            'কোনো সমস্যা হলে পেমেন্টের আগে বা পরপরই যোগাযোগ করুন — পেমেন্ট না করা অর্ডার যেকোনো সময় বাতিল করা যায়, আর প্রতিটি পেইড অর্ডার আমাদের টিম নিজে দেখে।'),
            'cards' => ail_contact_cards($L), 'chips' => [['t' => $L('Live support', 'লাইভ সাপোর্ট'), 'action' => 'support']]];
    }
    if ($intent['thanks']) return ['reply' => $L("You're welcome! 😊 Anything else I can help with?", 'আপনাকেও ধন্যবাদ! 😊 আর কিছু জানতে চান?'), 'cards' => [], 'chips' => $defaultChips];
    if ($intent['greet'] || mb_strlen(trim($raw)) <= 3) {
        return ['reply' => $L("Hi! 👋 I'm the $site assistant. Ask me about our services, prices, payment or anything else.", "হ্যালো! 👋 আমি $site এর অ্যাসিস্ট্যান্ট। সার্ভিস, দাম, পেমেন্ট বা যেকোনো বিষয়ে জিজ্ঞাসা করুন।"),
            'cards' => [], 'chips' => $defaultChips];
    }

    // ---------------- fallback: search services & news text ----------------
    $words = array_filter(preg_split('~\s+~u', trim($m)), fn($w) => mb_strlen($w) >= 4);
    foreach (array_slice($words, 0, 5) as $w) {
        $like = '%' . addcslashes($w, '%_\\') . '%';
        foreach (rows('SELECT slug, title_en, title_bn, short_en, short_bn, icon FROM services WHERE status = 1 AND (short_en LIKE ? OR short_bn LIKE ? OR description_en LIKE ? OR description_bn LIKE ?) LIMIT 3', [$like, $like, $like, $like]) as $s) {
            $cards[$s['slug']] = ['icon' => fa($s['icon']), 'title' => loc($s, 'title', $l), 'sub' => loc($s, 'short', $l), 'url' => url('/services/' . $s['slug'])];
        }
    }
    if ($cards) return ['reply' => $L('These might help:', 'এগুলো কাজে আসতে পারে:'), 'cards' => array_values(array_slice($cards, 0, 3)), 'chips' => $defaultChips];

    return ['reply' => $L("I'm not sure I understood that 🤔 Try asking about our services, prices, payment or delivery — or talk to our team directly.",
        "দুঃখিত, প্রশ্নটা ঠিক বুঝতে পারিনি 🤔 সার্ভিস, দাম, পেমেন্ট বা ডেলিভারি নিয়ে জিজ্ঞাসা করুন — অথবা সরাসরি আমাদের টিমের সাথে কথা বলুন।"),
        'cards' => [], 'chips' => $defaultChips];
}

function ail_contact_cards(callable $L): array
{
    $c = [];
    $wa = preg_replace('~\D~', '', (string)setting('contact.whatsapp'));
    if ($wa) $c[] = ['icon' => 'fa-brands fa-whatsapp', 'title' => 'WhatsApp', 'sub' => '+' . $wa, 'url' => 'https://wa.me/' . $wa];
    if (setting('contact.email')) $c[] = ['icon' => 'fa-regular fa-envelope', 'title' => $L('Email', 'ইমেইল'), 'sub' => (string)setting('contact.email'), 'url' => 'mailto:' . setting('contact.email')];
    $c[] = ['icon' => 'fa-solid fa-headset', 'title' => $L('Contact page', 'যোগাযোগ পেজ'), 'sub' => $L('Form, FAQ & more', 'ফর্ম, FAQ ও আরও'), 'url' => url('/contact')];
    return $c;
}

/** Best FAQ answer by word overlap (both languages). */
function ail_faq(string $m, string $l, float $ratio = .4): ?string
{
    $best = null;
    $bestScore = 0;
    $msgWords = array_filter(preg_split('~\s+~u', trim($m)), fn($w) => mb_strlen($w) >= 3);
    if (!$msgWords) return null;
    foreach ([$l, $l === 'bn' ? 'en' : 'bn'] as $lang) {
        foreach (lines((string)setting('contact.faq_' . $lang)) as $line) {
            [$q, $a] = array_map('trim', array_pad(explode('|', $line, 2), 2, ''));
            $qWords = array_filter(preg_split('~\s+~u', trim(ail_norm($q))), fn($w) => mb_strlen($w) >= 3);
            $score = count(array_intersect($msgWords, $qWords));
            if ($score > $bestScore && $score >= max(2, (int)ceil(count($qWords) * $ratio))) { $best = $a; $bestScore = $score; }
        }
        if ($best) break;
    }
    return $best;
}
