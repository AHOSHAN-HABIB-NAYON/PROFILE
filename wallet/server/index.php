<?php
declare(strict_types=1);

require __DIR__ . '/app/bootstrap.php';

if (Auth::user() !== null) {
    header('Location: dashboard.php');
    exit;
}
send_page_headers();
$googleClientId = (string) config('google_client_id', '');
?><!doctype html>
<html lang="bn">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= e(config('app_name')) ?> — লগইন</title>
    <meta name="theme-color" content="#0B6E4F">
    <link rel="icon" href="<?= e(asset('icon.svg')) ?>" type="image/svg+xml">
    <link rel="stylesheet" href="<?= e(asset('css/app.css')) ?>">
</head>
<body class="auth-page" data-google-client-id="<?= e($googleClientId) ?>">
<main class="auth">
    <section class="auth-brand" aria-labelledby="brand-title">
        <div class="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 48 48"><rect x="4" y="11" width="40" height="30" rx="7" fill="currentColor" opacity=".25"/><rect x="4" y="7" width="34" height="30" rx="7" fill="currentColor"/><circle cx="31" cy="22" r="4" fill="#0B6E4F"/></svg>
        </div>
        <h1 id="brand-title"><?= e(config('app_name')) ?></h1>
        <p class="tagline">আপনার টাকা, নিরাপদে জমা।</p>
        <ul class="features">
            <li><span class="feature-icon" aria-hidden="true">৳</span> বিকাশ, নগদ বা কার্ড থেকে টাকা যোগ করুন</li>
            <li><span class="feature-icon" aria-hidden="true">⇄</span> ইমেইল দিয়ে মুহূর্তে টাকা পাঠান</li>
            <li><span class="feature-icon" aria-hidden="true">✓</span> পাসকি দিয়ে পাসওয়ার্ড ছাড়াই নিরাপদ লগইন</li>
        </ul>
        <p class="demo-badge">ডেমো সংস্করণ — এখানে আসল টাকা লেনদেন হয় না</p>
    </section>

    <section class="auth-card" aria-label="লগইন">
        <div class="tabs" role="tablist">
            <button type="button" role="tab" class="tab is-active" aria-selected="true" aria-controls="login-form" id="tab-login">লগইন</button>
            <button type="button" role="tab" class="tab" aria-selected="false" aria-controls="register-form" id="tab-register">নতুন অ্যাকাউন্ট</button>
        </div>

        <form id="login-form" class="form" role="tabpanel" aria-labelledby="tab-login" novalidate>
            <label class="field">
                <span>ইমেইল</span>
                <input type="email" name="email" autocomplete="username webauthn" required inputmode="email">
            </label>
            <label class="field">
                <span>পাসওয়ার্ড</span>
                <input type="password" name="password" autocomplete="current-password" required>
            </label>
            <p class="form-error" role="alert" hidden></p>
            <button type="submit" class="btn btn-primary btn-block">লগইন করুন</button>
        </form>

        <form id="register-form" class="form" role="tabpanel" aria-labelledby="tab-register" novalidate hidden>
            <label class="field">
                <span>আপনার নাম</span>
                <input type="text" name="name" autocomplete="name" required maxlength="100">
            </label>
            <label class="field">
                <span>ইমেইল</span>
                <input type="email" name="email" autocomplete="email" required inputmode="email">
            </label>
            <label class="field">
                <span>পাসওয়ার্ড</span>
                <input type="password" name="password" autocomplete="new-password" required minlength="8">
                <small>কমপক্ষে ৮ অক্ষর</small>
            </label>
            <p class="form-error" role="alert" hidden></p>
            <button type="submit" class="btn btn-primary btn-block">অ্যাকাউন্ট খুলুন</button>
        </form>

        <div class="divider"><span>অথবা</span></div>

        <div class="alt-logins">
            <div id="google-button" class="google-slot">
                <?php if ($googleClientId === ''): ?>
                    <button type="button" class="btn btn-outline btn-block" disabled>Google লগইন এখনো চালু হয়নি</button>
                <?php endif; ?>
            </div>
            <button type="button" id="passkey-login" class="btn btn-outline btn-block">
                <svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="9" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M2 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 11h7m-2 0v3m-2-3v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                পাসকি দিয়ে লগইন
            </button>
        </div>
    </section>
</main>

<div id="toast" class="toast" role="status" aria-live="polite" hidden></div>

<script src="<?= e(asset('vendor/jquery.min.js')) ?>"></script>
<script src="<?= e(asset('js/common.js')) ?>"></script>
<script src="<?= e(asset('js/login.js')) ?>"></script>
<?php if ($googleClientId !== ''): ?>
<script src="https://accounts.google.com/gsi/client" async></script>
<?php endif; ?>
</body>
</html>
