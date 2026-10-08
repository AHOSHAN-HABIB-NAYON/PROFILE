<?php
/**
 * Static application constants that are not admin-editable.
 */
return [
    'order_statuses' => [
        'pending'         => ['label' => 'Pending',         'bn' => 'অপেক্ষমাণ',          'color' => 'warning'],
        'confirmed'       => ['label' => 'Confirmed',       'bn' => 'নিশ্চিত',             'color' => 'info'],
        'processing'      => ['label' => 'Processing',      'bn' => 'প্রসেসিং',            'color' => 'info'],
        'sent_to_courier' => ['label' => 'Sent to Courier', 'bn' => 'কুরিয়ারে পাঠানো',     'color' => 'primary'],
        'shipped'         => ['label' => 'Shipped',         'bn' => 'পথে আছে',             'color' => 'primary'],
        'delivered'       => ['label' => 'Delivered',       'bn' => 'ডেলিভারি সম্পন্ন',    'color' => 'success'],
        'cancelled'       => ['label' => 'Cancelled',       'bn' => 'বাতিল',              'color' => 'danger'],
        'returned'        => ['label' => 'Returned',        'bn' => 'ফেরত',               'color' => 'danger'],
        'fraud'           => ['label' => 'Fraud',           'bn' => 'সন্দেহজনক',           'color' => 'danger'],
        'blocked'         => ['label' => 'Blocked',         'bn' => 'ব্লকড',               'color' => 'muted'],
    ],

    // Statuses after which the order may no longer be edited (sent out of our hands)
    'locked_statuses' => ['sent_to_courier', 'shipped', 'delivered', 'returned'],

    // Statuses that release reserved stock back to inventory
    'stock_release_statuses' => ['cancelled', 'returned', 'fraud', 'blocked'],

    'districts' => [
        'ঢাকা', 'গাজীপুর', 'নারায়ণগঞ্জ', 'নরসিংদী', 'মুন্সীগঞ্জ', 'মানিকগঞ্জ', 'টাঙ্গাইল', 'কিশোরগঞ্জ',
        'ফরিদপুর', 'গোপালগঞ্জ', 'মাদারীপুর', 'রাজবাড়ী', 'শরীয়তপুর', 'চট্টগ্রাম', 'কক্সবাজার', 'কুমিল্লা',
        'ব্রাহ্মণবাড়িয়া', 'চাঁদপুর', 'ফেনী', 'লক্ষ্মীপুর', 'নোয়াখালী', 'খাগড়াছড়ি', 'রাঙ্গামাটি', 'বান্দরবান',
        'রাজশাহী', 'বগুড়া', 'জয়পুরহাট', 'নওগাঁ', 'নাটোর', 'চাঁপাইনবাবগঞ্জ', 'পাবনা', 'সিরাজগঞ্জ',
        'খুলনা', 'বাগেরহাট', 'চুয়াডাঙ্গা', 'যশোর', 'ঝিনাইদহ', 'কুষ্টিয়া', 'মাগুরা', 'মেহেরপুর', 'নড়াইল', 'সাতক্ষীরা',
        'বরিশাল', 'বরগুনা', 'ভোলা', 'ঝালকাঠি', 'পটুয়াখালী', 'পিরোজপুর',
        'সিলেট', 'হবিগঞ্জ', 'মৌলভীবাজার', 'সুনামগঞ্জ',
        'রংপুর', 'দিনাজপুর', 'গাইবান্ধা', 'কুড়িগ্রাম', 'লালমনিরহাট', 'নীলফামারী', 'পঞ্চগড়', 'ঠাকুরগাঁও',
        'ময়মনসিংহ', 'জামালপুর', 'নেত্রকোনা', 'শেরপুর',
    ],

    // Admin roles → areas they may NOT access
    'role_restrictions' => [
        'owner'   => [],
        'manager' => ['backup', 'security.admins'],
        'staff'   => ['settings', 'security', 'backup', 'plugins', 'tracking', 'trash', 'analytics', 'delivery', 'compressor'],
    ],

    'upload' => [
        'max_bytes'      => 8 * 1024 * 1024,
        'max_dimension'  => 8000,
        'allowed_mimes'  => ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'],
    ],

    'image_sizes' => [
        'product' => ['lg' => 1200, 'md' => 600, 'sm' => 320],
        'banner'  => ['lg' => 1600, 'md' => 1000, 'sm' => 640],
        'category'=> ['md' => 300, 'sm' => 120],
    ],
];
