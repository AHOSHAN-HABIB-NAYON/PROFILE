<?php
declare(strict_types=1);

require __DIR__ . '/app/bootstrap.php';

$user = Auth::user();
if ($user === null) {
    header('Location: index.php');
    exit;
}
send_page_headers();
$limits = config('limits');
?><!doctype html>
<html lang="bn">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= e(config('app_name')) ?></title>
    <meta name="theme-color" content="#0B6E4F">
    <link rel="icon" href="<?= e(asset('icon.svg')) ?>" type="image/svg+xml">
    <link rel="stylesheet" href="<?= e(asset('css/app.css')) ?>">
</head>
<body class="dash-page">
<header class="topbar">
    <a class="topbar-brand" href="dashboard.php">
        <span class="brand-mark brand-mark-sm" aria-hidden="true">
            <svg viewBox="0 0 48 48"><rect x="4" y="11" width="40" height="30" rx="7" fill="currentColor" opacity=".25"/><rect x="4" y="7" width="34" height="30" rx="7" fill="currentColor"/><circle cx="31" cy="22" r="4" fill="#fff"/></svg>
        </span>
        <?= e(config('app_name')) ?>
    </a>
    <div class="topbar-user">
        <span class="avatar" id="avatar" aria-hidden="true"><?= e(mb_substr($user['name'], 0, 1)) ?></span>
        <span class="topbar-name" id="user-name"><?= e($user['name']) ?></span>
        <button type="button" class="btn btn-ghost btn-sm" id="logout">লগআউট</button>
    </div>
</header>

<main class="dash">
    <section class="balance-card" aria-labelledby="balance-label">
        <div class="balance-top">
            <span id="balance-label">বর্তমান ব্যালেন্স</span>
            <button type="button" class="balance-toggle" id="balance-toggle" aria-pressed="false">লুকান</button>
        </div>
        <p class="balance-amount" id="balance"><span class="skeleton skeleton-amount"></span></p>
        <div class="balance-stats">
            <div><span>এই মাসে এসেছে</span><strong id="month-in">—</strong></div>
            <div><span>এই মাসে গেছে</span><strong id="month-out">—</strong></div>
        </div>
    </section>

    <section class="actions" aria-label="লেনদেন">
        <button type="button" class="action" data-open="dlg-deposit">
            <span class="action-icon action-in" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></span>
            টাকা যোগ
        </button>
        <button type="button" class="action" data-open="dlg-send">
            <span class="action-icon action-send" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12h12m-5-6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
            টাকা পাঠান
        </button>
        <button type="button" class="action" data-open="dlg-withdraw">
            <span class="action-icon action-out" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 5v14m-6-6 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
            টাকা তুলুন
        </button>
    </section>

    <div class="dash-grid">
        <section class="card" aria-labelledby="history-title">
            <h2 id="history-title">লেনদেনের তালিকা</h2>
            <ul class="tx-list" id="tx-list" aria-busy="true">
                <li class="tx tx-skeleton"><span class="skeleton"></span></li>
                <li class="tx tx-skeleton"><span class="skeleton"></span></li>
                <li class="tx tx-skeleton"><span class="skeleton"></span></li>
            </ul>
            <div class="empty" id="tx-empty" hidden>
                <p class="empty-title">এখনো কোনো লেনদেন নেই</p>
                <p>টাকা যোগ করে শুরু করুন।</p>
                <button type="button" class="btn btn-primary btn-sm" data-open="dlg-deposit">টাকা যোগ করুন</button>
            </div>
            <button type="button" class="btn btn-ghost btn-block" id="tx-more" hidden>আরও দেখুন</button>
        </section>

        <aside class="card" aria-labelledby="security-title">
            <h2 id="security-title">নিরাপত্তা</h2>
            <p class="muted">পাসকি থাকলে আঙুলের ছাপ বা ফেস দিয়েই লগইন করা যায়, পাসওয়ার্ড লাগে না।</p>
            <ul class="passkey-list" id="passkey-list"></ul>
            <button type="button" class="btn btn-outline btn-block" id="passkey-add">নতুন পাসকি যোগ করুন</button>

            <dl class="account-info">
                <div><dt>ইমেইল</dt><dd id="info-email"><?= e($user['email']) ?></dd></div>
                <div><dt>Google</dt><dd id="info-google"><?= $user['google_sub'] ? 'যুক্ত আছে' : 'যুক্ত নেই' ?></dd></div>
                <div><dt>পাসওয়ার্ড</dt><dd id="info-password"><?= $user['password_hash'] ? 'সেট করা আছে' : 'নেই' ?></dd></div>
            </dl>
        </aside>
    </div>
</main>

<dialog class="sheet" id="dlg-deposit" aria-labelledby="dlg-deposit-title">
    <form class="form" data-action="deposit" novalidate>
        <header class="sheet-head">
            <h2 id="dlg-deposit-title">টাকা যোগ করুন</h2>
            <button type="button" class="icon-btn" data-close aria-label="বন্ধ করুন">✕</button>
        </header>
        <label class="field">
            <span>পরিমাণ (টাকা)</span>
            <input type="text" name="amount" inputmode="decimal" autocomplete="off" required placeholder="যেমন: ৫০০">
            <small>সর্বনিম্ন ৳<?= e(bn_taka($limits['deposit_min'])) ?>, সর্বোচ্চ ৳<?= e(bn_taka($limits['deposit_max'])) ?></small>
        </label>
        <div class="quick-amounts" aria-label="দ্রুত পরিমাণ">
            <button type="button" data-amount="500">৳৫০০</button>
            <button type="button" data-amount="1000">৳১,০০০</button>
            <button type="button" data-amount="5000">৳৫,০০০</button>
        </div>
        <fieldset class="methods">
            <legend>কোথা থেকে</legend>
            <label><input type="radio" name="method" value="bkash" checked><span>বিকাশ</span></label>
            <label><input type="radio" name="method" value="nagad"><span>নগদ</span></label>
            <label><input type="radio" name="method" value="rocket"><span>রকেট</span></label>
            <label><input type="radio" name="method" value="card"><span>কার্ড</span></label>
        </fieldset>
        <p class="form-error" role="alert" hidden></p>
        <button type="submit" class="btn btn-primary btn-block">টাকা যোগ করুন</button>
    </form>
</dialog>

<dialog class="sheet" id="dlg-send" aria-labelledby="dlg-send-title">
    <form class="form" data-action="transfer" novalidate>
        <header class="sheet-head">
            <h2 id="dlg-send-title">টাকা পাঠান</h2>
            <button type="button" class="icon-btn" data-close aria-label="বন্ধ করুন">✕</button>
        </header>
        <label class="field">
            <span>প্রাপকের ইমেইল</span>
            <input type="email" name="to_email" autocomplete="off" required inputmode="email">
            <small class="recipient" id="recipient" aria-live="polite"></small>
        </label>
        <label class="field">
            <span>পরিমাণ (টাকা)</span>
            <input type="text" name="amount" inputmode="decimal" autocomplete="off" required>
        </label>
        <label class="field">
            <span>নোট (ঐচ্ছিক)</span>
            <input type="text" name="note" maxlength="120" autocomplete="off" placeholder="যেমন: বাসা ভাড়া">
        </label>
        <p class="form-error" role="alert" hidden></p>
        <button type="submit" class="btn btn-primary btn-block">টাকা পাঠান</button>
    </form>
</dialog>

<dialog class="sheet" id="dlg-withdraw" aria-labelledby="dlg-withdraw-title">
    <form class="form" data-action="withdraw" novalidate>
        <header class="sheet-head">
            <h2 id="dlg-withdraw-title">টাকা তুলুন</h2>
            <button type="button" class="icon-btn" data-close aria-label="বন্ধ করুন">✕</button>
        </header>
        <label class="field">
            <span>পরিমাণ (টাকা)</span>
            <input type="text" name="amount" inputmode="decimal" autocomplete="off" required>
            <small>সর্বনিম্ন ৳<?= e(bn_taka($limits['withdraw_min'])) ?></small>
        </label>
        <fieldset class="methods">
            <legend>কোথায় যাবে</legend>
            <label><input type="radio" name="method" value="bkash" checked><span>বিকাশ</span></label>
            <label><input type="radio" name="method" value="nagad"><span>নগদ</span></label>
            <label><input type="radio" name="method" value="rocket"><span>রকেট</span></label>
            <label><input type="radio" name="method" value="bank"><span>ব্যাংক</span></label>
        </fieldset>
        <p class="form-error" role="alert" hidden></p>
        <button type="submit" class="btn btn-primary btn-block">টাকা তুলুন</button>
    </form>
</dialog>

<div id="toast" class="toast" role="status" aria-live="polite" hidden></div>

<script src="<?= e(asset('vendor/jquery.min.js')) ?>"></script>
<script src="<?= e(asset('js/common.js')) ?>"></script>
<script src="<?= e(asset('js/dashboard.js')) ?>"></script>
</body>
</html>
