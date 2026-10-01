<?php
/**
 * Branded HTML email templates (Bengali). Returns [subject, html].
 */
declare(strict_types=1);

function email_layout(string $title, string $bodyHtml, ?string $buttonText = null, ?string $buttonUrl = null): string
{
    $site = e(setting('site_name', 'Probaho'));
    $color = e(setting('theme_color', '#5b4bff'));
    $logo = e(abs_url(brand_logo()));
    $button = $buttonText && $buttonUrl
        ? '<p style="margin:28px 0 8px"><a href="' . e($buttonUrl) . '" style="background:' . $color . ';color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:12px;font-weight:600;display:inline-block">' . e($buttonText) . '</a></p>'
        : '';
    $footer = e(setting('footer_text', ''));
    $year = date('Y');
    return <<<HTML
<!doctype html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{$title}</title></head>
<body style="margin:0;background:#f4f5fb;font-family:'Hind Siliguri','Noto Sans Bengali',Segoe UI,Arial,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5fb;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 30px rgba(17,24,39,.06)">
<tr><td style="background:{$color};padding:22px 28px"><img src="{$logo}" alt="{$site}" height="32" style="height:32px;vertical-align:middle"> <span style="color:#fff;font-weight:700;font-size:18px;vertical-align:middle;margin-left:8px">{$site}</span></td></tr>
<tr><td style="padding:28px 28px 8px"><h1 style="margin:0 0 14px;font-size:20px;color:#111827">{$title}</h1><div style="font-size:15px;line-height:1.75;color:#374151">{$bodyHtml}</div>{$button}</td></tr>
<tr><td style="padding:20px 28px 26px;font-size:12px;color:#9ca3af;border-top:1px solid #f1f2f6">{$footer}<br>© {$year} {$site}. এটি একটি স্বয়ংক্রিয় ইমেইল।</td></tr>
</table></td></tr></table></body></html>
HTML;
}

function email_template(string $name, array $v): array
{
    $site = (string) setting('site_name', 'Probaho');
    $n = e($v['name'] ?? 'গ্রাহক');
    switch ($name) {
        case 'welcome':
            return ["{$site}-এ স্বাগতম 🎉", email_layout('স্বাগতম, ' . $n . '!',
                '<p>আপনার অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে। এখন থেকে ওয়ালেট, Binance Pay, QR পেমেন্ট ও সব সার্ভিস ব্যবহার করতে পারবেন।</p><p>নিরাপত্তার জন্য সেটিংস থেকে একটি Passkey যোগ করার পরামর্শ দিচ্ছি।</p>',
                'ড্যাশবোর্ড খুলুন', abs_url('/dashboard'))];
        case 'verify_email':
            return ['ইমেইল ভেরিফাই করুন — ' . $site, email_layout('আপনার ইমেইল ভেরিফাই করুন',
                '<p>প্রিয় ' . $n . ', আপনার ইমেইল ঠিকানা নিশ্চিত করতে নিচের বাটনে চাপুন। লিংকটি ২৪ ঘণ্টা কার্যকর থাকবে।</p>',
                'ইমেইল ভেরিফাই করুন', (string) $v['url'])];
        case 'reset_password':
            return ['পাসওয়ার্ড রিসেট — ' . $site, email_layout('পাসওয়ার্ড রিসেট করুন',
                '<p>আপনার অ্যাকাউন্টের পাসওয়ার্ড রিসেটের অনুরোধ পাওয়া গেছে। লিংকটি ১ ঘণ্টা কার্যকর থাকবে।</p><p>আপনি অনুরোধ না করলে এই ইমেইলটি উপেক্ষা করুন।</p>',
                'নতুন পাসওয়ার্ড সেট করুন', (string) $v['url'])];
        case 'login_alert':
            return ['নতুন লগইন শনাক্ত হয়েছে — ' . $site, email_layout('নতুন লগইন',
                '<p>আপনার অ্যাকাউন্টে নতুন লগইন হয়েছে:</p><p><b>পদ্ধতি:</b> ' . e($v['method'] ?? '') . '<br><b>ডিভাইস:</b> ' . e($v['device'] ?? '') . '<br><b>IP:</b> ' . e($v['ip'] ?? '') . '<br><b>সময়:</b> ' . e($v['time'] ?? '') . '</p><p>এটি আপনি না হলে এখনই পাসওয়ার্ড পরিবর্তন করুন এবং অন্যান্য সেশন বন্ধ করুন।</p>',
                'নিরাপত্তা সেটিংস', abs_url('/settings'))];
        case 'passkey_added':
            return ['নতুন Passkey যোগ হয়েছে — ' . $site, email_layout('নতুন Passkey যোগ হয়েছে',
                '<p>আপনার অ্যাকাউন্টে <b>' . e($v['passkey'] ?? '') . '</b> নামে একটি নতুন Passkey যোগ হয়েছে (' . e($v['device'] ?? '') . ')।</p><p>এটি আপনি না করলে এখনই Passkey মুছে ফেলুন এবং পাসওয়ার্ড পরিবর্তন করুন।</p>',
                'Passkey দেখুন', abs_url('/settings#passkeys'))];
        case 'payment_success':
            return ['পেমেন্ট সফল ✓ — ' . $site, email_layout('পেমেন্ট সফল হয়েছে',
                '<p>আপনার লেনদেন সফলভাবে সম্পন্ন হয়েছে।</p><p><b>পরিমাণ:</b> ' . e($v['amount'] ?? '') . '<br><b>মেথড:</b> ' . e($v['method'] ?? '') . '<br><b>লেনদেন আইডি:</b> ' . e($v['uid'] ?? '') . '</p>',
                'লেনদেন দেখুন', abs_url('/transaction/' . ($v['uid'] ?? '')))];
        case 'payment_failed':
            return ['পেমেন্ট ব্যর্থ — ' . $site, email_layout('পেমেন্ট সম্পন্ন হয়নি',
                '<p>দুঃখিত, আপনার লেনদেনটি সম্পন্ন হয়নি।</p><p><b>পরিমাণ:</b> ' . e($v['amount'] ?? '') . '<br><b>লেনদেন আইডি:</b> ' . e($v['uid'] ?? '') . '<br><b>কারণ:</b> ' . e($v['reason'] ?? 'অজানা') . '</p><p>প্রয়োজনে সাপোর্টে যোগাযোগ করুন।</p>',
                'লেনদেন দেখুন', abs_url('/transaction/' . ($v['uid'] ?? '')))];
        case 'new_product':
            return ['নতুন: ' . ($v['title'] ?? '') . ' — ' . $site, email_layout(e($v['title'] ?? ''),
                '<p>' . e($v['summary'] ?? '') . '</p>', 'বিস্তারিত দেখুন', (string) ($v['url'] ?? abs_url('/products')))];
        case 'security_alert':
            return ['নিরাপত্তা সতর্কতা — ' . $site, email_layout('নিরাপত্তা সতর্কতা', '<p>' . e($v['message'] ?? '') . '</p>', 'অ্যাকাউন্ট দেখুন', abs_url('/settings'))];
        case 'report_update':
            return ['রিপোর্ট আপডেট #' . ($v['uid'] ?? '') . ' — ' . $site, email_layout('আপনার রিপোর্টের আপডেট',
                '<p>রিপোর্ট <b>#' . e($v['uid'] ?? '') . '</b>-এর স্ট্যাটাস: <b>' . e($v['status'] ?? '') . '</b></p>' . (!empty($v['reply']) ? '<p><b>উত্তর:</b><br>' . nl2br(e($v['reply'])) . '</p>' : ''),
                'রিপোর্ট দেখুন', abs_url('/report'))];
        case 'admin_message':
        default:
            return [(string) ($v['title'] ?? $site), email_layout(e($v['title'] ?? $site), nl2br(e($v['body'] ?? '')),
                !empty($v['url']) ? 'বিস্তারিত দেখুন' : null, !empty($v['url']) ? abs_url((string) $v['url']) : null)];
    }
}
