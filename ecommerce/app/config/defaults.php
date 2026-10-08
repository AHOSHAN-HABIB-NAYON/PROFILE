<?php
/**
 * Default values for every admin-editable setting.
 * The database `settings` table stores only overrides.
 */
return [
    // Branding
    'store_name'            => defined('STORE_NAME') ? STORE_NAME : 'NovaShop',
    'store_tagline'         => 'বিশ্বস্ত অনলাইন শপিং — ক্যাশ অন ডেলিভারি',
    'logo'                  => '',
    'favicon'               => '',
    'og_image'              => '',
    'contact_phone'         => defined('STORE_PHONE') ? STORE_PHONE : '',
    'contact_email'         => defined('STORE_EMAIL') ? STORE_EMAIL : '',
    'contact_address'       => 'ঢাকা, বাংলাদেশ',
    'facebook_url'          => '',
    'messenger_url'         => '',
    'instagram_url'         => '',
    'youtube_url'           => '',
    'tiktok_url'            => '',

    // WhatsApp
    'whatsapp_enabled'      => '1',
    'whatsapp_number'       => defined('STORE_WHATSAPP') ? STORE_WHATSAPP : '+8801757827996',
    'whatsapp_position'     => 'right',
    'whatsapp_greeting'     => 'কোনো প্রশ্ন? আমাদের সাথে কথা বলুন',
    'whatsapp_message'      => 'আসসালামু আলাইকুম। আমি একটি পণ্য সম্পর্কে জানতে চাই।',

    // Theme
    'primary_color'         => '#4f46e5',
    'primary_dark'          => '#4338ca',
    'secondary_color'       => '#7c3aed',
    'accent_color'          => '#06b6d4',
    'dark_mode_enabled'     => '1',
    'default_theme'         => 'light',

    // Currency & numbers
    'currency'              => 'BDT',
    'currency_symbol'       => '৳',
    'bengali_digits'        => '1',

    // Delivery
    'delivery_inside'       => '70',
    'delivery_outside'      => '130',
    'inside_districts'      => 'ঢাকা',
    'free_delivery_enabled' => '0',
    'free_delivery_threshold' => '0',
    'delivery_time_inside'  => '১-২ দিন',
    'delivery_time_outside' => '২-৪ দিন',

    // Catalog
    'products_per_page'     => '24',
    'low_stock_threshold'   => '10',
    'allow_backorder'       => '0',
    'coupon_enabled'        => '1',

    // Orders / anti-fraud
    'dup_enabled'           => '1',
    'dup_window_hours'      => '24',
    'dup_block_hours'       => '24',
    'dup_max_attempts'      => '3',
    'dup_check_ip'          => '1',
    'dup_check_phone'       => '1',
    'dup_check_device'      => '1',
    'order_min_amount'      => '0',
    'geoip_enabled'         => '1',

    // Home page
    'home_sections'         => json_encode([
        ['key' => 'hero',          'enabled' => 1, 'limit' => 5,  'sort' => 'manual'],
        ['key' => 'categories',    'enabled' => 1, 'limit' => 12, 'sort' => 'manual'],
        ['key' => 'flash',         'enabled' => 1, 'limit' => 8,  'sort' => 'manual'],
        ['key' => 'featured',      'enabled' => 1, 'limit' => 8,  'sort' => 'manual'],
        ['key' => 'coupon',        'enabled' => 1, 'limit' => 1,  'sort' => 'manual'],
        ['key' => 'combo',         'enabled' => 1, 'limit' => 8,  'sort' => 'manual'],
        ['key' => 'free_delivery', 'enabled' => 1, 'limit' => 8,  'sort' => 'latest'],
        ['key' => 'popular',       'enabled' => 1, 'limit' => 8,  'sort' => 'popular'],
        ['key' => 'latest',        'enabled' => 1, 'limit' => 12, 'sort' => 'latest'],
        ['key' => 'cta',           'enabled' => 1, 'limit' => 1,  'sort' => 'manual'],
    ], JSON_UNESCAPED_UNICODE),
    'flash_sale_title'      => 'ফ্ল্যাশ সেল',
    'flash_sale_ends_at'    => '',
    'hero_title'            => 'সেরা পণ্য, সেরা দামে',
    'hero_subtitle'         => 'সারা বাংলাদেশে ক্যাশ অন ডেলিভারি — পণ্য হাতে পেয়ে টাকা দিন।',
    'cta_title'             => 'অর্ডার করতে সাহায্য লাগবে?',
    'cta_text'              => 'আমাদের সাপোর্ট টিম সবসময় আপনার পাশে আছে। হোয়াটসঅ্যাপে মেসেজ দিন।',
    'cta_button'            => 'যোগাযোগ করুন',
    'cta_link'              => '',
    'announcement_enabled'  => '1',
    'announcement_text'     => 'সারা দেশে ক্যাশ অন ডেলিভারি • পণ্য হাতে পেয়ে মূল্য পরিশোধ করুন',

    // Customer-facing texts
    'text_order_success_title' => 'অর্ডার নিশ্চিত হয়েছে',
    'text_order_success_body'  => 'আমাদের সাথে শপিং করার জন্য ধন্যবাদ।',
    'text_order_success_call'  => 'আমাদের একজন প্রতিনিধি আপনাকে কল করবেন।',
    'text_checkout_note'       => 'অর্ডার কনফার্ম করার পর আমাদের প্রতিনিধি ফোনে যোগাযোগ করবেন।',
    'text_whatsapp_order'      => "আসসালামু আলাইকুম।\nআমি আমার অর্ডার সম্পর্কে জানতে চাই।\n\nঅর্ডার আইডি: #{order}\nনাম: {name}\nফোন: {phone}\n\nআমি এই অর্ডার সম্পর্কে জানতে চাই।",

    // Static pages
    'page_about'            => '<p>আমরা একটি বিশ্বস্ত অনলাইন শপ। মানসম্মত পণ্য ও দ্রুত ডেলিভারি আমাদের অঙ্গীকার।</p>',
    'page_privacy'          => '<p>আপনার নাম, ফোন ও ঠিকানা শুধুমাত্র অর্ডার ডেলিভারির কাজে ব্যবহার করা হয়। আমরা কোনো তৃতীয় পক্ষের কাছে আপনার তথ্য বিক্রি করি না।</p>',
    'page_terms'            => '<p>অর্ডার করার মাধ্যমে আপনি আমাদের শর্তাবলীতে সম্মত হচ্ছেন। পণ্যের মূল্য ও প্রাপ্যতা পরিবর্তন হতে পারে।</p>',
    'page_return'           => '<p>পণ্য হাতে পাওয়ার সময় ডেলিভারি ম্যানের সামনে চেক করে নিন। ত্রুটিপূর্ণ পণ্য ৩ দিনের মধ্যে ফেরত/পরিবর্তনযোগ্য।</p>',

    // SEO
    'seo_title'             => '',
    'seo_description'       => 'অনলাইনে নির্ভরযোগ্য কেনাকাটা — সারা বাংলাদেশে ক্যাশ অন ডেলিভারি।',
    'seo_keywords'          => 'online shop, bangladesh, cash on delivery',

    // PWA
    'pwa_enabled'           => '1',
    'pwa_short_name'        => defined('STORE_NAME') ? STORE_NAME : 'NovaShop',
    'pwa_theme_color'       => '#4f46e5',
    'pwa_bg_color'          => '#f5f6fb',
    'pwa_icon'              => '',

    // System
    'maintenance_mode'      => '0',
    'maintenance_message'   => 'আমরা সাইটটি আপডেট করছি। কিছুক্ষণ পর আবার চেষ্টা করুন।',
    'google_client_id'      => defined('GOOGLE_CLIENT_ID') ? GOOGLE_CLIENT_ID : '',
    'cache_version'         => '1',
];
