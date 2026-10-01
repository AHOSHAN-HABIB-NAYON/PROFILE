<?php
/**
 * Admin panel building blocks:
 *  - admin_resources(): declarative CRUD definitions (services, products, FAQ, KB ...)
 *  - admin_settings_schema(): every Admin Settings field, grouped by page
 *  - render helpers for fields, settings forms and pagination
 */
declare(strict_types=1);

function admin_resources(): array
{
    static $r = null;
    if ($r !== null) {
        return $r;
    }
    $icons = array_keys(Icons::PATHS);
    $catOptions = ['' => '— নেই —'] + array_column(db()->all('SELECT id, name FROM service_categories ORDER BY sort_order'), 'name', 'id');
    $productOptions = ['' => '— নেই —'] + array_column(db()->all('SELECT id, title_bn FROM products ORDER BY id DESC LIMIT 200'), 'title_bn', 'id');
    return $r = [
        'services' => [
            'table' => 'services', 'title' => 'সার্ভিস', 'ability' => 'content', 'order' => 'sort_order, id', 'sortable' => true,
            'search' => ['title', 'subtitle', 'slug'],
            'columns' => ['icon' => 'আইকন', 'title' => 'শিরোনাম', 'category_id' => 'ক্যাটাগরি', 'price' => 'মূল্য', 'sort_order' => 'ক্রম', 'is_active' => 'সক্রিয়'],
            'fields' => [
                'title' => ['label' => 'শিরোনাম (Title)', 'type' => 'text', 'required' => true, 'max' => 150],
                'slug' => ['label' => 'URL slug', 'type' => 'slug', 'from' => 'title', 'hint' => '/services/{slug}'],
                'subtitle' => ['label' => 'সাবটাইটেল', 'type' => 'text', 'max' => 150],
                'description' => ['label' => 'বিবরণ', 'type' => 'textarea'],
                'category_id' => ['label' => 'ক্যাটাগরি', 'type' => 'select', 'options' => $catOptions, 'nullable' => true],
                'icon' => ['label' => 'আইকন', 'type' => 'icon', 'options' => $icons, 'folder' => 'services'],
                'color' => ['label' => 'রঙ', 'type' => 'color', 'default' => '#5b4bff'],
                'badge' => ['label' => 'ব্যাজ (যেমন: নতুন)', 'type' => 'text', 'max' => 30],
                'price' => ['label' => 'মূল্য (০ = ফ্রি / লিংক)', 'type' => 'money', 'default' => '0'],
                'action_url' => ['label' => 'অ্যাকশন URL (ঐচ্ছিক)', 'type' => 'text', 'max' => 255, 'hint' => 'যেমন /payment/binance-pay অথবা https://...'],
                'sort_order' => ['label' => 'ক্রম', 'type' => 'number', 'default' => '0'],
                'is_active' => ['label' => 'সক্রিয়', 'type' => 'toggle', 'default' => '1'],
            ],
        ],
        'service-categories' => [
            'table' => 'service_categories', 'title' => 'সার্ভিস ক্যাটাগরি', 'ability' => 'content', 'order' => 'sort_order, id', 'sortable' => true,
            'columns' => ['name' => 'নাম', 'slug' => 'Slug', 'sort_order' => 'ক্রম', 'is_active' => 'সক্রিয়'],
            'fields' => [
                'name' => ['label' => 'নাম', 'type' => 'text', 'required' => true, 'max' => 100],
                'slug' => ['label' => 'Slug', 'type' => 'slug', 'from' => 'name'],
                'sort_order' => ['label' => 'ক্রম', 'type' => 'number', 'default' => '0'],
                'is_active' => ['label' => 'সক্রিয়', 'type' => 'toggle', 'default' => '1'],
            ],
        ],
        'payment-methods' => [
            'table' => 'payment_methods', 'title' => 'পেমেন্ট মেথড', 'ability' => 'finance', 'order' => 'sort_order, id', 'sortable' => true,
            'columns' => ['icon' => 'আইকন', 'name' => 'নাম', 'code' => 'কোড', 'direction' => 'ধরন', 'fee_percent' => 'ফি %', 'show_on_landing' => 'ল্যান্ডিং', 'is_active' => 'সক্রিয়'],
            'fields' => [
                'name' => ['label' => 'নাম', 'type' => 'text', 'required' => true, 'max' => 100],
                'code' => ['label' => 'কোড (ইউনিক, ইংরেজি)', 'type' => 'slug', 'from' => 'name', 'hint' => 'binance_pay ও qr কোড সিস্টেম-সংরক্ষিত'],
                'description' => ['label' => 'সংক্ষিপ্ত বিবরণ', 'type' => 'text', 'max' => 255],
                'icon' => ['label' => 'আইকন', 'type' => 'icon', 'options' => $icons, 'folder' => 'methods'],
                'color' => ['label' => 'রঙ', 'type' => 'color', 'default' => '#5b4bff'],
                'direction' => ['label' => 'ব্যবহার', 'type' => 'select', 'options' => ['both' => 'জমা ও উত্তোলন', 'deposit' => 'শুধু জমা', 'withdraw' => 'শুধু উত্তোলন']],
                'account_label' => ['label' => 'অ্যাকাউন্ট ফিল্ডের লেবেল', 'type' => 'text', 'max' => 100],
                'instructions' => ['label' => 'নির্দেশনা (ইউজার দেখবে)', 'type' => 'textarea'],
                'min_amount' => ['label' => 'সর্বনিম্ন', 'type' => 'money', 'default' => '1'],
                'max_amount' => ['label' => 'সর্বোচ্চ', 'type' => 'money', 'default' => '10000'],
                'fee_percent' => ['label' => 'ফি (%)', 'type' => 'money', 'default' => '0'],
                'fee_fixed' => ['label' => 'ফিক্সড ফি', 'type' => 'money', 'default' => '0'],
                'sort_order' => ['label' => 'ক্রম', 'type' => 'number', 'default' => '0'],
                'show_on_landing' => ['label' => 'ল্যান্ডিং পেজে দেখান', 'type' => 'toggle', 'default' => '1'],
                'is_active' => ['label' => 'সক্রিয়', 'type' => 'toggle', 'default' => '1'],
            ],
        ],
        'products' => [
            'table' => 'products', 'title' => 'প্রোডাক্ট / রিলিজ', 'ability' => 'content', 'order' => 'id DESC',
            'search' => ['title_bn', 'title_en', 'slug', 'category'],
            'columns' => ['cover_image' => 'কভার', 'title_bn' => 'শিরোনাম', 'category' => 'ক্যাটাগরি', 'release_date' => 'রিলিজ', 'is_featured' => 'ফিচার্ড', 'status' => 'স্ট্যাটাস', 'views' => 'ভিউ'],
            'fields' => [
                'title_bn' => ['label' => 'বাংলা শিরোনাম', 'type' => 'text', 'required' => true, 'max' => 190],
                'title_en' => ['label' => 'English title', 'type' => 'text', 'max' => 190],
                'slug' => ['label' => 'URL slug', 'type' => 'slug', 'from' => 'title_en', 'hint' => '/products/{slug}'],
                'summary' => ['label' => 'সংক্ষিপ্ত সারাংশ', 'type' => 'text', 'max' => 300],
                'description' => ['label' => 'বিবরণ', 'type' => 'textarea', 'rows' => 10],
                'cover_image' => ['label' => 'কভার ছবি', 'type' => 'image', 'folder' => 'products'],
                'gallery' => ['label' => 'গ্যালারি', 'type' => 'gallery', 'folder' => 'products'],
                'category' => ['label' => 'ক্যাটাগরি', 'type' => 'text', 'max' => 80],
                'release_date' => ['label' => 'রিলিজ তারিখ', 'type' => 'date', 'default' => date('Y-m-d')],
                'button_text' => ['label' => 'বাটন টেক্সট', 'type' => 'text', 'max' => 60],
                'button_url' => ['label' => 'বাটন URL', 'type' => 'text', 'max' => 255],
                'is_featured' => ['label' => 'ফিচার্ড', 'type' => 'toggle', 'default' => '0'],
                'status' => ['label' => 'স্ট্যাটাস', 'type' => 'select', 'options' => ['draft' => 'খসড়া', 'published' => 'প্রকাশিত']],
                'notify_inapp' => ['label' => 'প্রকাশে ইন-অ্যাপ নোটিফিকেশন', 'type' => 'toggle', 'default' => '1'],
                'notify_push' => ['label' => 'প্রকাশে পুশ নোটিফিকেশন', 'type' => 'toggle', 'default' => '0'],
                'notify_email' => ['label' => 'প্রকাশে ইমেইল নোটিফিকেশন', 'type' => 'toggle', 'default' => '0'],
            ],
        ],
        'posts' => [
            'table' => 'product_posts', 'title' => 'পোস্ট / ঘোষণা', 'ability' => 'content', 'order' => 'is_pinned DESC, id DESC',
            'search' => ['title', 'body'],
            'columns' => ['title' => 'শিরোনাম', 'type' => 'ধরন', 'is_pinned' => 'পিন', 'status' => 'স্ট্যাটাস', 'created_at' => 'তারিখ'],
            'fields' => [
                'title' => ['label' => 'শিরোনাম', 'type' => 'text', 'required' => true, 'max' => 190],
                'body' => ['label' => 'বিস্তারিত', 'type' => 'textarea'],
                'type' => ['label' => 'ধরন', 'type' => 'select', 'options' => ['announcement' => 'ঘোষণা', 'news' => 'খবর', 'update' => 'আপডেট']],
                'product_id' => ['label' => 'সংশ্লিষ্ট প্রোডাক্ট', 'type' => 'select', 'options' => $productOptions, 'nullable' => true],
                'url' => ['label' => 'লিংক (ঐচ্ছিক)', 'type' => 'text', 'max' => 255],
                'is_pinned' => ['label' => 'ড্যাশবোর্ডে পিন', 'type' => 'toggle', 'default' => '0'],
                'status' => ['label' => 'স্ট্যাটাস', 'type' => 'select', 'options' => ['published' => 'প্রকাশিত', 'draft' => 'খসড়া']],
            ],
        ],
        'faqs' => [
            'table' => 'faqs', 'title' => 'FAQ', 'ability' => 'content', 'order' => 'sort_order, id', 'sortable' => true,
            'columns' => ['question' => 'প্রশ্ন', 'sort_order' => 'ক্রম', 'is_active' => 'সক্রিয়'],
            'fields' => [
                'question' => ['label' => 'প্রশ্ন', 'type' => 'text', 'required' => true, 'max' => 255],
                'answer' => ['label' => 'উত্তর', 'type' => 'textarea', 'required' => true],
                'sort_order' => ['label' => 'ক্রম', 'type' => 'number', 'default' => '0'],
                'is_active' => ['label' => 'সক্রিয়', 'type' => 'toggle', 'default' => '1'],
            ],
        ],
        'pages' => [
            'table' => 'pages', 'title' => 'পেজ', 'ability' => 'content', 'order' => 'id', 'nodelete' => true,
            'columns' => ['title' => 'শিরোনাম', 'slug' => 'Slug', 'updated_at' => 'আপডেট'],
            'fields' => [
                'title' => ['label' => 'শিরোনাম', 'type' => 'text', 'required' => true, 'max' => 190],
                'slug' => ['label' => 'Slug', 'type' => 'readonly'],
                'content' => ['label' => 'কনটেন্ট', 'type' => 'textarea', 'rows' => 16, 'required' => true],
            ],
        ],
        'knowledge' => [
            'table' => 'ai_knowledge', 'title' => 'AI নলেজ বেস', 'ability' => 'support', 'order' => 'priority DESC, id',
            'search' => ['title', 'content', 'keywords'],
            'columns' => ['title' => 'শিরোনাম', 'category' => 'ক্যাটাগরি', 'priority' => 'অগ্রাধিকার', 'is_active' => 'সক্রিয়'],
            'fields' => [
                'title' => ['label' => 'শিরোনাম', 'type' => 'text', 'required' => true, 'max' => 190],
                'category' => ['label' => 'ক্যাটাগরি', 'type' => 'select', 'options' => ['site' => 'সাইট তথ্য', 'payment' => 'পেমেন্ট', 'wallet' => 'ওয়ালেট', 'account' => 'অ্যাকাউন্ট', 'security' => 'নিরাপত্তা', 'support' => 'সাপোর্ট', 'pwa' => 'অ্যাপ', 'policy' => 'নীতি', 'announcement' => 'ঘোষণা', 'general' => 'সাধারণ']],
                'keywords' => ['label' => 'কীওয়ার্ড (কমা দিয়ে, বাংলা+ইংরেজি)', 'type' => 'text', 'max' => 500],
                'content' => ['label' => 'উত্তর / তথ্য', 'type' => 'textarea', 'rows' => 8, 'required' => true],
                'priority' => ['label' => 'অগ্রাধিকার (বেশি = আগে)', 'type' => 'number', 'default' => '0'],
                'is_active' => ['label' => 'সক্রিয়', 'type' => 'toggle', 'default' => '1'],
            ],
        ],
    ];
}

/** Every editable setting, grouped by admin page → section. */
function admin_settings_schema(): array
{
    $themeOpts = ['light' => 'লাইট', 'dark' => 'ডার্ক', 'system' => 'সিস্টেম'];
    return [
        'settings' => [
            'সাধারণ (General)' => [
                'site_name' => ['সাইটের নাম', 'text'], 'site_name_bn' => ['সাইটের নাম (বাংলা)', 'text'], 'site_tagline' => ['ট্যাগলাইন', 'text'],
                'site_description' => ['বিবরণ (SEO)', 'textarea'], 'contact_email' => ['যোগাযোগ ইমেইল', 'text'], 'contact_phone' => ['ফোন', 'text'],
                'contact_address' => ['ঠিকানা', 'text'], 'timezone' => ['টাইমজোন', 'select', array_combine(DateTimeZone::listIdentifiers(), DateTimeZone::listIdentifiers())],
                'currency_code' => ['কারেন্সি কোড', 'text'], 'currency_symbol' => ['কারেন্সি চিহ্ন', 'text'], 'maintenance_mode' => ['রক্ষণাবেক্ষণ মোড', 'toggle'],
            ],
            'ব্র্যান্ডিং (Branding)' => [
                'logo' => ['লোগো (PNG/WEBP, বর্গাকার)', 'image'], 'favicon' => ['Favicon', 'image'], 'og_image' => ['OG ইমেজ (1200×630)', 'image'],
                'theme_color' => ['থিম রঙ', 'color'], 'login_title' => ['লগইন শিরোনাম', 'text'], 'login_subtitle' => ['লগইন সাবটাইটেল', 'text'],
            ],
            'ল্যান্ডিং পেজ' => [
                'hero_title' => ['হিরো শিরোনাম', 'text'], 'hero_subtitle' => ['হিরো বিবরণ (বাংলা)', 'textarea'], 'hero_subtitle_en' => ['Hero supporting text (English)', 'textarea'],
                'about_text' => ['আমাদের সম্পর্কে', 'textarea'], 'footer_text' => ['ফুটার টেক্সট', 'text'],
                'analytics_head' => ['Analytics / Head কোড (ঐচ্ছিক)', 'textarea', null, 'শুধুমাত্র বিশ্বস্ত স্ক্রিপ্ট দিন — সব পাবলিক পেজে যুক্ত হবে।'],
            ],
            'অথেন্টিকেশন (Authentication)' => [
                'auth_manual' => ['ম্যানুয়াল লগইন (ইমেইল/মোবাইল + পাসওয়ার্ড)', 'toggle'], 'auth_google' => ['Google লগইন', 'toggle'],
                'google_client_id' => ['Google Client ID', 'text'], 'google_client_secret' => ['Google Client Secret', 'secret', null, 'Redirect URI: ' . abs_url('/auth/google/callback')],
                'auth_passkey' => ['Passkey লগইন', 'toggle'], 'auth_registration' => ['নতুন রেজিস্ট্রেশন', 'toggle'],
                'auth_email_verification' => ['ইমেইল ভেরিফিকেশন বাধ্যতামূলক (লেনদেনের আগে)', 'toggle'], 'auth_2fa' => ['ইউজার 2FA (Authenticator)', 'toggle'],
            ],
            'থিম (Theme)' => [
                'theme_light' => ['লাইট মোড', 'toggle'], 'theme_dark' => ['ডার্ক মোড', 'toggle'], 'theme_system' => ['সিস্টেম মোড', 'toggle'],
                'theme_default' => ['ডিফল্ট থিম', 'select', $themeOpts], 'accent_color' => ['অ্যাকসেন্ট রঙ', 'color'],
            ],
            'ওয়ালেট ও ট্রান্সফার' => [
                'transfer_enabled' => ['ট্রান্সফার চালু', 'toggle'], 'transfer_fee_percent' => ['ট্রান্সফার ফি (%)', 'number'], 'transfer_fee_fixed' => ['ট্রান্সফার ফিক্সড ফি', 'number'],
                'transfer_min' => ['সর্বনিম্ন ট্রান্সফার', 'number'], 'transfer_max' => ['সর্বোচ্চ ট্রান্সফার', 'number'], 'withdraw_enabled' => ['উত্তোলন চালু', 'toggle'],
            ],
            'AI সহকারী' => [
                'ai_enabled' => ['AI চ্যাটবট চালু', 'toggle'], 'ai_name' => ['চ্যাটবটের নাম', 'text'], 'ai_welcome' => ['স্বাগত বার্তা', 'textarea'],
                'ai_quick_questions' => ['দ্রুত প্রশ্ন (প্রতি লাইনে একটি)', 'textarea'],
                'ai_provider' => ['AI প্রোভাইডার', 'select', ['local' => 'বিল্ট-ইন (নলেজ বেস থেকে, API লাগে না)', 'anthropic' => 'Anthropic Claude', 'openai' => 'OpenAI-compatible API']],
                'ai_model' => ['মডেল', 'text', null, 'Anthropic: claude-opus-5-5 (ডিফল্ট) · অন্য প্রোভাইডারে তাদের মডেল নাম'],
                'ai_api_key' => ['API Key', 'secret', null, 'সার্ভারে এনক্রিপ্ট করে রাখা হয় — কখনো ব্রাউজারে পাঠানো হয় না।'],
                'ai_base_url' => ['API Base URL (ঐচ্ছিক)', 'text', null, 'ফাঁকা রাখলে প্রোভাইডারের ডিফল্ট ব্যবহার হবে।'],
                'ai_system_prompt' => ['সিস্টেম নির্দেশনা', 'textarea'], 'ai_log_chats' => ['চ্যাট লগ সংরক্ষণ', 'toggle'],
            ],
        ],
        'binance' => [
            'Binance Pay (পেমেন্ট মেথড)' => [
                'binance_enabled' => ['Binance Pay চালু', 'toggle'],
                'binance_mode' => ['মোড', 'select', ['manual' => 'Manual — Pay ID + Order ID যাচাই', 'api' => 'Merchant API — স্বয়ংক্রিয়']],
                'binance_api_key' => ['API Key (Certificate SN)', 'text'], 'binance_api_secret' => ['API Secret', 'secret', null, 'Webhook URL: ' . abs_url('/payment/binance-pay/webhook')],
                'binance_pay_id' => ['Binance Pay ID (Manual মোড)', 'text'], 'binance_pay_name' => ['Pay ID নাম', 'text'],
                'binance_currency' => ['কারেন্সি', 'select', ['USDT' => 'USDT', 'BUSD' => 'BUSD', 'USDC' => 'USDC', 'BNB' => 'BNB', 'BTC' => 'BTC']],
                'binance_min' => ['সর্বনিম্ন', 'number'], 'binance_max' => ['সর্বোচ্চ', 'number'], 'binance_expire_minutes' => ['অর্ডারের মেয়াদ (মিনিট)', 'number'],
                'binance_instructions' => ['নির্দেশনা (ইউজার ও AI দেখবে)', 'textarea'],
            ],
        ],
        'support' => [
            'সাপোর্ট পেজ' => [
                'support.title' => ['সাপোর্ট শিরোনাম', 'text'], 'support.description' => ['বিবরণ', 'textarea'],
                'support.working_hours' => ['কাজের সময়', 'text'], 'support.response_message' => ['রেসপন্স বার্তা', 'text'],
            ],
            'Telegram' => [
                'support.telegram_enabled' => ['Telegram চালু', 'toggle'], 'support.telegram_name' => ['নাম', 'text'],
                'support.telegram_username' => ['ইউজারনেম', 'text'], 'support.telegram_url' => ['URL', 'text', null, 'যেমন https://t.me/username'],
            ],
            'WhatsApp' => [
                'support.whatsapp_enabled' => ['WhatsApp চালু', 'toggle'], 'support.whatsapp_name' => ['নাম', 'text'],
                'support.whatsapp_number' => ['নম্বর', 'text'], 'support.whatsapp_url' => ['URL', 'text', null, 'যেমন https://wa.me/8801XXXXXXXXX'],
            ],
        ],
        'smtp' => [
            'SMTP ইমেইল' => [
                'smtp.is_enabled' => ['ইমেইল পাঠানো চালু', 'toggle'], 'smtp.host' => ['SMTP Host', 'text'], 'smtp.port' => ['Port', 'number'],
                'smtp.username' => ['Username', 'text'], 'smtp.password' => ['Password', 'secret'],
                'smtp.encryption' => ['Encryption', 'select', ['tls' => 'TLS (STARTTLS, 587)', 'ssl' => 'SSL (465)', 'none' => 'None']],
                'smtp.from_email' => ['From Email', 'text'], 'smtp.from_name' => ['From Name', 'text'],
            ],
        ],
        'push' => [
            'Web Push' => [
                'push_enabled' => ['পুশ নোটিফিকেশন চালু', 'toggle'], 'push_subject' => ['VAPID Subject', 'text', null, 'mailto:you@example.com অথবা https://your-site'],
            ],
        ],
        'pwa' => [
            'PWA' => [
                'pwa_enabled' => ['PWA চালু', 'toggle'], 'pwa_auto_prompt' => ['স্বয়ংক্রিয় ইনস্টল প্রম্পট', 'toggle'],
                'pwa_install_delay' => ['প্রম্পট দেখানোর আগে বিলম্ব (সেকেন্ড)', 'number'], 'pwa_app_name' => ['অ্যাপের নাম', 'text'],
                'pwa_short_name' => ['ছোট নাম', 'text'], 'pwa_description' => ['বিবরণ', 'textarea'], 'pwa_icon' => ['অ্যাপ আইকন (512×512 PNG)', 'image'],
                'theme_color' => ['থিম রঙ', 'color'], 'pwa_background_color' => ['ব্যাকগ্রাউন্ড রঙ', 'color'],
            ],
        ],
        'security' => [
            'সেশন ও লগইন' => [
                'security_session_timeout' => ['সেশন টাইমআউট (মিনিট নিষ্ক্রিয়তা)', 'number'], 'security_remember_days' => ['"মনে রাখুন" মেয়াদ (দিন)', 'number'],
                'security_max_attempts' => ['সর্বোচ্চ ভুল লগইন চেষ্টা', 'number'], 'security_lockout_minutes' => ['লকআউট সময় (মিনিট)', 'number'],
            ],
            'পাসওয়ার্ড নীতি' => [
                'security_password_min' => ['সর্বনিম্ন দৈর্ঘ্য', 'number'], 'security_password_strong' => ['অক্ষর + সংখ্যা বাধ্যতামূলক', 'toggle'],
            ],
            'CAPTCHA' => [
                'captcha_provider' => ['প্রোভাইডার', 'select', ['none' => 'বন্ধ', 'builtin' => 'বিল্ট-ইন (গণিত)', 'turnstile' => 'Cloudflare Turnstile', 'recaptcha' => 'Google reCAPTCHA v2']],
                'captcha_on_login' => ['লগইনে', 'toggle'], 'captcha_on_register' => ['রেজিস্ট্রেশনে', 'toggle'],
                'captcha_site_key' => ['Site Key', 'text'], 'captcha_secret' => ['Secret Key', 'secret'],
            ],
            'অ্যাডমিন ও সতর্কতা' => [
                'security_admin_2fa' => ['সব অ্যাডমিনের জন্য 2FA বাধ্যতামূলক', 'toggle'], 'security_login_alerts' => ['ইউজার লগইন সতর্কতা (ইন-অ্যাপ + ইমেইল)', 'toggle'],
                'security_notify_admin_email' => ['অ্যাডমিন নোটিফিকেশন ইমেইল', 'text', null, 'নতুন রিপোর্ট ইত্যাদির সতর্কতা এই ঠিকানায় যাবে।'],
            ],
        ],
    ];
}

/** Render a single settings field. */
function admin_setting_field(string $key, array $def): string
{
    [$label, $type] = $def;
    $opts = $def[2] ?? null;
    $hint = $def[3] ?? '';
    $name = 'settings[' . e($key) . ']';
    $val = in_array($key, Settings::SECRET_KEYS, true) ? '' : (string) Settings::get($key, '');
    $id = 'set-' . preg_replace('/[^a-z0-9]/', '-', $key);
    $h = '<div class="field">';
    switch ($type) {
        case 'toggle':
            return '<label class="setting-toggle"><span>' . e($label) . ($hint ? '<small>' . e($hint) . '</small>' : '') . '</span>'
                . '<input type="hidden" name="' . $name . '" value="0"><span class="switch"><input type="checkbox" name="' . $name . '" value="1" ' . ($val === '1' ? 'checked' : '') . '><span></span></span></label>';
        case 'textarea':
            $h .= '<label for="' . $id . '">' . e($label) . '</label><textarea class="textarea" id="' . $id . '" name="' . $name . '" rows="4">' . e($val) . '</textarea>';
            break;
        case 'select':
            $h .= '<label for="' . $id . '">' . e($label) . '</label><select class="select" id="' . $id . '" name="' . $name . '">';
            foreach ((array) $opts as $k => $v) {
                $h .= '<option value="' . e($k) . '" ' . ((string) $k === $val ? 'selected' : '') . '>' . e($v) . '</option>';
            }
            $h .= '</select>';
            break;
        case 'secret':
            $isSet = Settings::get($key, '') !== '';
            $h .= '<label for="' . $id . '">' . e($label) . ' ' . ($isSet ? '<span class="badge badge-ok">সেট করা আছে</span>' : '<span class="badge badge-muted">সেট করা নেই</span>') . '</label>'
                . '<input class="input" type="password" id="' . $id . '" name="' . $name . '" autocomplete="new-password" placeholder="' . ($isSet ? '•••••••• (পরিবর্তন করতে নতুন মান দিন)' : '') . '">';
            break;
        case 'color':
            $h .= '<label for="' . $id . '">' . e($label) . '</label><div class="row"><input type="color" class="color-input" id="' . $id . '" name="' . $name . '" value="' . e($val ?: '#5b4bff') . '"><code>' . e($val) . '</code></div>';
            break;
        case 'image':
            $h .= '<label for="' . $id . '">' . e($label) . '</label><div class="row">'
                . ($val !== '' ? '<img src="' . e(upload_url($val)) . '" alt="" class="thumb">' : '')
                . '<input class="input grow" type="file" id="' . $id . '" name="files[' . e($key) . ']" accept="image/png,image/jpeg,image/webp"></div>'
                . ($val !== '' ? '<label class="check small" style="margin-top:6px"><input type="checkbox" name="remove[]" value="' . e($key) . '"> ডিফল্টে ফিরুন</label>' : '');
            break;
        case 'number':
            $h .= '<label for="' . $id . '">' . e($label) . '</label><input class="input" type="number" step="any" id="' . $id . '" name="' . $name . '" value="' . e($val) . '">';
            break;
        default:
            $h .= '<label for="' . $id . '">' . e($label) . '</label><input class="input" id="' . $id . '" name="' . $name . '" value="' . e($val) . '">';
    }
    if ($hint !== '') {
        $h .= '<div class="hint">' . e($hint) . '</div>';
    }
    return $h . '</div>';
}

function admin_settings_form(string $page): string
{
    $schema = admin_settings_schema()[$page] ?? [];
    $out = '<form action="' . e(url('/v2admin/api/settings/save')) . '" method="post" enctype="multipart/form-data" data-ajax class="settings-form">' . csrf_field()
        . '<input type="hidden" name="page" value="' . e($page) . '"><div class="form-error" hidden></div>';
    foreach ($schema as $title => $fields) {
        $out .= '<section class="card admin-card"><h3 class="card-title" style="margin-bottom:14px">' . e($title) . '</h3><div class="settings-grid">';
        foreach ($fields as $key => $def) {
            $out .= admin_setting_field($key, $def);
        }
        $out .= '</div></section>';
    }
    return $out . '<div class="sticky-save"><button type="submit" class="btn btn-primary btn-lg">' . icon('check') . ' সংরক্ষণ করুন</button></div></form>';
}

function admin_pagination(int $total, int $page, int $per, array $query = []): string
{
    $pages = (int) ceil($total / $per);
    if ($pages <= 1) {
        return '';
    }
    $base = strtok($_SERVER['REQUEST_URI'] ?? '', '?');
    $link = static function (int $p) use ($base, $query) {
        return e($base . '?' . http_build_query(array_merge($query, ['page' => $p])));
    };
    $out = '<nav class="pager">';
    if ($page > 1) {
        $out .= '<a href="' . $link($page - 1) . '" data-link>← আগের</a>';
    }
    $out .= '<span>পৃষ্ঠা ' . bn_digits((string) $page) . ' / ' . bn_digits((string) $pages) . '</span>';
    if ($page < $pages) {
        $out .= '<a href="' . $link($page + 1) . '" data-link>পরের →</a>';
    }
    return $out . '</nav>';
}

function admin_stat(string $iconName, string $label, string $value, string $tone = 'brand', string $href = ''): string
{
    $inner = '<span class="stat-ic tone-' . e($tone) . '">' . icon($iconName) . '</span><span><small>' . e($label) . '</small><b class="num">' . e($value) . '</b></span>';
    return $href ? '<a href="' . e(url($href)) . '" class="card admin-stat" data-link>' . $inner . '</a>' : '<div class="card admin-stat">' . $inner . '</div>';
}

/** Product publish hook: send optional notifications once. */
function admin_product_published(int $id): array
{
    $p = db()->row('SELECT * FROM products WHERE id = ?', [$id]);
    if (!$p || $p['status'] !== 'published' || $p['notified_at']) {
        return [];
    }
    $channels = array_keys(array_filter(['inapp' => $p['notify_inapp'], 'push' => $p['notify_push'], 'email' => $p['notify_email']]));
    db()->q('UPDATE products SET notified_at = NOW(), published_at = COALESCE(published_at, NOW()) WHERE id = ?', [$id]);
    if (!$channels) {
        return [];
    }
    return Notify::campaign('all', '', 'product', 'নতুন: ' . $p['title_bn'], (string) ($p['summary'] ?: mb_substr((string) $p['description'], 0, 140)), '/products/' . $p['slug'], $channels, 'new_product', [
        'title' => $p['title_bn'], 'summary' => (string) $p['summary'], 'url' => abs_url('/products/' . $p['slug']),
    ]);
}

/** Guard for /v2admin/api/* handlers. */
function admin_api(?string $ability = null): array
{
    require_post();
    $a = AdminAuth::user();
    if (!$a) {
        fail('সেশন শেষ। আবার লগইন করুন।', 401, ['redirect' => url('/v2admin/login')]);
    }
    if ($ability && !AdminAuth::can($ability)) {
        fail('এই কাজের অনুমতি আপনার নেই।', 403);
    }
    return $a;
}
