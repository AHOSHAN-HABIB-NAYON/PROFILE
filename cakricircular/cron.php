<?php
// =========================================================
//  অটোমেশনের ক্রন এন্ট্রি
//  ─ Hostinger hPanel → Advanced → Cron Jobs → "PHP" ধরন বেছে এই ফাইলের পথ দিন,
//    প্রতি ৩০ মিনিট (মিনিটের ঘরে: */30, বাকি সব ঘরে: *)
//  ─ বিকল্প: URL দিয়ে চালানো — https://সাইট/cron.php?key=গোপন-কী
//    (কী টা এডমিন → অটোমেশন পাতায় দেখা যাবে)
// =========================================================
/* কমান্ড লাইনে (ক্রন) চললে ব্রাউজারের মতো সাইটের ঠিকানা জানা থাকে না —
   এডমিন পাতা একবার খুললে যে ঠিকানা জমা হয়, সেটা দিয়ে ইমেইলের লিংক ঠিক রাখি */
if (PHP_SAPI === 'cli' && empty($_SERVER['HTTP_HOST'])) {
    $hf = __DIR__ . '/uploads/site/.site_url';
    $su = is_file($hf) ? trim((string)@file_get_contents($hf)) : '';
    if ($su !== '' && ($pu = parse_url($su)) && !empty($pu['host'])) {
        $_SERVER['HTTP_HOST'] = $pu['host'];
        if (($pu['scheme'] ?? '') === 'https') { $_SERVER['HTTPS'] = 'on'; $_SERVER['SERVER_PORT'] = 443; }
    }
    /* পাবলিক সাইটের চেয়ে কম অগ্রাধিকারে চলি — ভিজিটরের পাতা খোলায় প্রভাব পড়বে না */
    if (function_exists('proc_nice')) @proc_nice(10);
}

require __DIR__ . '/config/config.php';
require __DIR__ . '/config/db.php';
require __DIR__ . '/config/helpers.php';

/* ব্রাউজার থেকে এলে গোপন কী ছাড়া চলবে না */
if (PHP_SAPI !== 'cli') {
    $key = (string)($_GET['key'] ?? '');
    $real = setting('auto_cron_key', '');
    if ($real === '' || !hash_equals($real, $key)) {
        http_response_code(403);
        exit('Forbidden');
    }
    header('Content-Type: text/plain; charset=utf-8');
    header('X-Robots-Tag: noindex, nofollow');
}

ensure_auto_schema();
ensure_auto_fails();
ensure_auto_fix3();
ensure_auto_v61();
ensure_auto_v62();
require APP_ROOT . '/app/automation.php';

/* এডমিনের "একটি চালান" থেকে ডাকা হলে — কাজের পরিচয় (job) সহ আসে */
$job    = preg_replace('/[^a-f0-9]/', '', (string)($_GET['job'] ?? ''));
$manual = PHP_SAPI !== 'cli' && !empty($_GET['manual']) && $job !== '';

if (PHP_SAPI !== 'cli') {
    /* যে ডেকেছে তাকে সাথে সাথে ছেড়ে দিই — কাজ চলবে সার্ভারে নিজে নিজে */
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    ignore_user_abort(true);
    @set_time_limit(300);
    echo "started\n";
    if (function_exists('litespeed_finish_request'))   litespeed_finish_request();
    elseif (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
    else flush();
}

$sum = ['msg' => 'অজানা ত্রুটি', 'stop' => 'অজানা ত্রুটি', 'created' => 0, 'found' => 0, 'events' => []];
try {
    $sum = $manual ? auto_run(true, 1) : auto_run(false);
} catch (Throwable $e) {
    $sum['msg'] = $sum['stop'] = 'ত্রুটি: ' . $e->getMessage();
    auto_log($sum['msg'], 'error');
}
if ($manual) {
    set_setting('auto_job', json_encode(['state' => 'done', 'id' => $job, 'at' => time(), 'sum' => $sum], JSON_UNESCAPED_UNICODE));
}
if (PHP_SAPI === 'cli') echo date('Y-m-d H:i:s') . ' — ' . ($sum['msg'] ?: 'শেষ') . "\n";
