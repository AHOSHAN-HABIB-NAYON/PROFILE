<?php
/** @var string $content @var string $title @var string $page */
$nav = [
    ['dashboard', '/admin', 'tachometer', 'ড্যাশবোর্ড'],
    ['orders', '/admin/orders', 'shopping-bag', 'অর্ডার'],
    ['products', '/admin/products', 'cube', 'পণ্য'],
    ['categories', '/admin/categories', 'th-large', 'ক্যাটাগরি'],
    ['combos', '/admin/combos', 'gift', 'কম্বো'],
    ['stock', '/admin/stock', 'cubes', 'স্টক'],
    ['flash-sale', '/admin/flash-sale', 'bolt', 'ফ্ল্যাশ সেল'],
    ['banners', '/admin/banners', 'picture-o', 'ব্যানার'],
    ['coupons', '/admin/coupons', 'ticket', 'কুপন'],
    ['couriers', '/admin/couriers', 'truck', 'কুরিয়ার'],
    ['fraud', '/admin/fraud', 'shield', 'ফ্রড চেক'],
    ['blocked-ips', '/admin/blocked-ips', 'ban', 'ব্লকড IP'],
    ['analytics', '/admin/analytics', 'bar-chart', 'অ্যানালিটিক্স'],
    ['notifications', '/admin/notifications', 'bell', 'নোটিফিকেশন'],
    ['trash', '/admin/trash', 'trash', 'ট্র্যাশ'],
    ['settings', '/admin/settings', 'cog', 'সেটিংস'],
];
$active = View::adminNavKey();
$unread = Notifier::unreadCount();
$pending = (int) DB::val("SELECT COUNT(*) FROM orders WHERE status = 'pending' AND deleted_at IS NULL");
?><!doctype html>
<html lang="bn" data-theme="<?= e(in_array($_COOKIE['admin_theme'] ?? '', ['light', 'dark'], true) ? $_COOKIE['admin_theme'] : 'light') ?>">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title><?= e($title) ?> · অ্যাডমিন</title>
<link rel="icon" href="/assets/icons/icon-192.png">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="<?= asset('vendor/font-awesome/css/font-awesome.min.css') ?>">
<link rel="stylesheet" href="<?= asset('css/app.css') ?>">
<link rel="stylesheet" href="<?= asset('css/admin.css') ?>">
</head>
<body class="admin-body">
<div id="progress" class="progress" aria-hidden="true"><span></span></div>
<aside class="sidebar" aria-label="অ্যাডমিন মেনু">
  <a href="/admin" class="side-brand"><span class="brand-mark"><i class="fa fa-shopping-bag"></i></span><span><?= e(setting('site_name')) ?><small>অ্যাডমিন প্যানেল</small></span></a>
  <nav class="side-nav">
    <?php foreach ($nav as [$key, $href, $icon, $label]): ?>
      <a href="<?= $href ?>" data-nav="<?= $key ?>" class="<?= $active === $key ? 'active' : '' ?>"><i class="fa fa-<?= $icon ?>"></i><span><?= $label ?></span>
        <?php if ($key === 'orders' && $pending): ?><b class="side-badge" data-pending-count><?= bn_num($pending) ?></b><?php endif; ?>
        <?php if ($key === 'notifications'): ?><b class="side-badge" data-notif-count<?= $unread ? '' : ' hidden' ?>><?= bn_num($unread) ?></b><?php endif; ?>
      </a>
    <?php endforeach; ?>
  </nav>
</aside>
<div class="admin-wrap">
  <header class="admin-top">
    <h1 class="admin-title" data-admin-title><?= e($title) ?></h1>
    <div class="admin-top-actions">
      <a href="/" class="icon-btn" target="_blank" rel="noopener" aria-label="সাইট দেখুন" title="সাইট দেখুন"><i class="fa fa-external-link"></i></a>
      <button type="button" class="icon-btn" data-admin-theme aria-label="থিম পরিবর্তন"><i class="fa fa-moon-o"></i></button>
      <a href="/admin/notifications" class="icon-btn" aria-label="নোটিফিকেশন" data-nav="notifications"><i class="fa fa-bell-o"></i><span class="badge-count" data-notif-count<?= $unread ? '' : ' hidden' ?>><?= bn_num($unread) ?></span></a>
      <form method="post" action="/admin/logout" data-no-spa class="inline-form">
        <?= Csrf::field() ?>
        <button class="icon-btn" aria-label="লগআউট" title="লগআউট"><i class="fa fa-sign-out"></i></button>
      </form>
    </div>
  </header>
  <main id="app" class="admin-main" tabindex="-1" data-scope="/admin" data-page="<?= e($page) ?>" data-nav-key="<?= e($active) ?>">
<?= $content ?>
  </main>
</div>

<nav class="bottom-nav admin-bnav" aria-label="মোবাইল মেনু">
  <a href="/admin" data-nav="dashboard"><i class="fa fa-tachometer"></i><span>ড্যাশবোর্ড</span></a>
  <a href="/admin/orders" data-nav="orders"><i class="fa fa-shopping-bag"></i><span>অর্ডার</span><?php if ($pending): ?><b class="badge-count" data-pending-count><?= bn_num($pending) ?></b><?php endif; ?></a>
  <a href="/admin/products" data-nav="products"><i class="fa fa-cube"></i><span>পণ্য</span></a>
  <a href="/admin/notifications" data-nav="notifications"><i class="fa fa-bell"></i><span>অ্যালার্ট</span><b class="badge-count" data-notif-count<?= $unread ? '' : ' hidden' ?>><?= bn_num($unread) ?></b></a>
  <button type="button" data-open-sheet="admin-more"><i class="fa fa-bars"></i><span>আরও</span></button>
</nav>
<div class="sheet" data-sheet="admin-more" hidden>
  <div class="sheet-backdrop" data-close-sheet></div>
  <div class="sheet-panel" role="dialog" aria-modal="true" aria-label="সব মডিউল">
    <div class="sheet-handle"></div>
    <div class="module-grid">
      <?php foreach ($nav as [$key, $href, $icon, $label]): ?>
        <a href="<?= $href ?>" data-nav="<?= $key ?>"><i class="fa fa-<?= $icon ?>"></i><span><?= $label ?></span></a>
      <?php endforeach; ?>
    </div>
  </div>
</div>
<div class="modal" data-modal hidden>
  <div class="modal-backdrop" data-close-modal></div>
  <div class="modal-panel" role="dialog" aria-modal="true">
    <div class="modal-head"><h2 data-modal-title></h2><button type="button" class="icon-btn" data-close-modal aria-label="বন্ধ করুন"><i class="fa fa-times"></i></button></div>
    <div class="modal-body" data-modal-body></div>
  </div>
</div>
<div class="toast-wrap" aria-live="polite" data-toasts></div>
<script type="application/json" id="app-config"><?= json_encode(['csrf' => Csrf::token(), 'admin' => true], JSON_HEX_TAG) ?></script>
<?php foreach (['ajax', 'cache', 'animations', 'lazyload', 'router', 'navigation', 'editor', 'admin'] as $js): ?>
<script src="<?= asset('js/' . $js . '.js') ?>" defer></script>
<?php endforeach; ?>
</body>
</html>
