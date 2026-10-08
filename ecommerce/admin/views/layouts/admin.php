<?php
/**
 * Admin app shell: header, sidebar (desktop) / drawer + bottom nav (mobile).
 * Only <main id="app-main"> changes during navigation.
 * @var array $meta @var string $content
 */
$nonce = View::nonce();
$user = AdminAuth::user();
$unread = Notification::unreadCount();
$sections = [
    'Overview' => [
        ['dashboard', '/admin', 'fa-solid fa-gauge-high', 'Dashboard', 'dashboard'],
        ['analytics', '/admin/analytics', 'fa-solid fa-chart-line', 'Analytics', 'analytics'],
        ['notifications', '/admin/notifications', 'fa-solid fa-bell', 'Notifications', 'notifications'],
    ],
    'Catalog' => [
        ['products', '/admin/products', 'fa-solid fa-box', 'Products', 'products'],
        ['categories', '/admin/categories', 'fa-solid fa-table-cells-large', 'Categories', 'categories'],
        ['banners', '/admin/banners', 'fa-solid fa-images', 'Banners', 'banners'],
        ['coupons', '/admin/coupons', 'fa-solid fa-ticket', 'Coupons', 'coupons'],
        ['compressor', '/admin/compressor', 'fa-solid fa-file-zipper', 'Image Compressor', 'compressor'],
    ],
    'Sales' => [
        ['orders', '/admin/orders', 'fa-solid fa-bag-shopping', 'Orders', 'orders'],
        ['customers', '/admin/customers', 'fa-solid fa-users', 'Customers', 'customers'],
        ['delivery', '/admin/delivery', 'fa-solid fa-truck', 'Delivery', 'delivery'],
        ['courier', '/admin/courier', 'fa-solid fa-truck-fast', 'Courier', 'courier'],
    ],
    'Growth' => [
        ['tracking', '/admin/tracking', 'fa-solid fa-bullseye', 'Pixel & Tracking', 'tracking'],
        ['plugins', '/admin/plugins', 'fa-solid fa-puzzle-piece', 'Plugins', 'plugins'],
    ],
    'System' => [
        ['settings', '/admin/settings', 'fa-solid fa-gear', 'Settings', 'settings'],
        ['security', '/admin/security', 'fa-solid fa-shield-halved', 'Security', 'security'],
        ['backup', '/admin/backup', 'fa-solid fa-database', 'Backup', 'backup'],
        ['trash', '/admin/trash', 'fa-solid fa-trash-can-arrow-up', 'Trash', 'trash'],
    ],
];
$bottom = [
    ['dashboard', '/admin', 'fa-solid fa-gauge-high', 'Dashboard'],
    ['orders', '/admin/orders', 'fa-solid fa-bag-shopping', 'Orders'],
    ['products', '/admin/products', 'fa-solid fa-box', 'Products'],
    ['analytics', '/admin/analytics', 'fa-solid fa-chart-line', 'Analytics'],
];
$appConfig = ['base' => base_path(), 'scope' => 'admin', 'currency' => '৳', 'bnDigits' => false, 'version' => 0, 'darkMode' => true];
$pageData = ['page' => $meta['page'], 'nav' => $meta['nav'], 'track' => [], 'cache' => false];
?><!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="csrf-token" content="<?= e(Csrf::adminToken()) ?>">
<meta name="theme-color" content="<?= e(setting('pwa_theme_color')) ?>">
<title><?= e($meta['full_title']) ?></title>
<meta name="description" content="">
<link rel="canonical" href="<?= e($meta['canonical']) ?>">
<link rel="icon" href="<?= e(setting('favicon') ? upload_url(setting('favicon')) : asset('icons/favicon.png')) ?>">
<link rel="preconnect" href="https://cdnjs.cloudflare.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap" media="print" data-async-css>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" crossorigin="anonymous" referrerpolicy="no-referrer">
<link rel="stylesheet" href="<?= e(asset('css/base.css')) ?>">
<link rel="stylesheet" href="<?= e(asset('css/modal.css')) ?>">
<link rel="stylesheet" href="<?= e(asset('css/sidebar.css')) ?>">
<link rel="stylesheet" href="<?= e(asset('css/bottom-nav.css')) ?>">
<link rel="stylesheet" href="<?= e(admin_asset('css/admin.css')) ?>">
<?php foreach ($meta['style_urls'] as $href): ?><link rel="stylesheet" href="<?= e($href) ?>"><?php endforeach; ?>
<?= View::component('theme-vars') ?>
<script nonce="<?= e($nonce) ?>">(function(){try{var t=localStorage.getItem('ns-admin-theme');if(t)document.documentElement.setAttribute('data-theme',JSON.parse(t));}catch(e){}})();</script>
</head>
<body class="admin">
<a class="skip-link" href="#app-main">Skip to content</a>
<div class="progress" id="progress" aria-hidden="true"><span></span></div>

<header class="a-header">
  <button type="button" class="icon-btn a-menu" data-action="drawer-open" aria-label="Open menu" aria-controls="sidebar" aria-expanded="false"><i class="fa-solid fa-bars" aria-hidden="true"></i></button>
  <a href="<?= e(url('/admin')) ?>" class="a-brand">
    <span class="brand-mark"><i class="fa-solid fa-bag-shopping" aria-hidden="true"></i></span>
    <span class="a-brand-text"><strong><?= e(setting('store_name')) ?></strong><small>Admin</small></span>
  </a>
  <div class="a-header-actions">
    <a href="<?= e(url('/')) ?>" class="icon-btn" target="_blank" rel="noopener" aria-label="View store" title="View store"><i class="fa-solid fa-store" aria-hidden="true"></i></a>
    <button type="button" class="icon-btn" data-action="admin-theme" aria-label="Toggle dark mode" title="Dark mode"><i class="fa-solid fa-circle-half-stroke" aria-hidden="true"></i></button>
    <a href="<?= e(url('/admin/notifications')) ?>" class="icon-btn" aria-label="Notifications" data-nav="notifications" title="Notifications">
      <i class="fa-solid fa-bell" aria-hidden="true"></i>
      <span class="badge-count" data-notif-count<?= $unread ? '' : ' hidden' ?>><?= $unread > 99 ? '99+' : $unread ?></span>
    </a>
    <div class="a-user">
      <button type="button" class="a-avatar" data-action="user-menu" aria-haspopup="true" aria-expanded="false" aria-label="Account menu"><?= e(mb_strtoupper(mb_substr($user['name'] ?? 'A', 0, 1))) ?></button>
      <div class="a-user-menu" hidden>
        <p class="a-user-name"><?= e($user['name'] ?? '') ?><span class="muted small d-block"><?= e($user['email'] ?? '') ?> · <?= e($user['role'] ?? '') ?></span></p>
        <a href="<?= e(url('/admin/account')) ?>"><i class="fa-solid fa-user-gear" aria-hidden="true"></i> Account &amp; 2FA</a>
        <form method="post" action="<?= e(url('/admin/logout')) ?>" data-no-spa>
          <?= csrf_field() ?>
          <button type="submit"><i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i> Sign out</button>
        </form>
      </div>
    </div>
  </div>
</header>

<div class="shell a-shell">
  <div class="drawer-backdrop" data-action="drawer-close" hidden></div>
  <aside class="sidebar a-sidebar" id="sidebar" aria-label="Admin navigation">
    <div class="sidebar-head">
      <strong>Menu</strong>
      <button type="button" class="icon-btn" data-action="drawer-close" aria-label="Close menu"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
    </div>
    <?php foreach ($sections as $label => $items): ?>
      <?php $items = array_filter($items, static fn($i) => AdminAuth::authorize($i[4])); if (!$items) continue; ?>
      <p class="side-label"><?= e($label) ?></p>
      <nav class="side-nav">
        <?php foreach ($items as [$key, $href, $ic, $text]): ?>
          <a href="<?= e(url($href)) ?>" class="side-link<?= $meta['nav'] === $key ? ' is-active' : '' ?>" data-nav="<?= e($key) ?>"<?= $meta['nav'] === $key ? ' aria-current="page"' : '' ?>>
            <i class="<?= e($ic) ?>" aria-hidden="true"></i><span><?= e($text) ?></span>
            <?php if ($key === 'notifications' && $unread): ?><span class="side-count" data-notif-count><?= $unread > 99 ? '99+' : $unread ?></span><?php endif; ?>
          </a>
        <?php endforeach; ?>
      </nav>
    <?php endforeach; ?>
  </aside>

  <main id="app-main" class="main a-main" data-page="<?= e($meta['page']) ?>" tabindex="-1">
<?= $content ?>
  </main>
</div>

<nav class="bottom-nav" aria-label="Admin navigation">
  <div class="bottom-nav-inner">
    <span class="bn-indicator" aria-hidden="true"></span>
    <?php foreach ($bottom as [$key, $href, $ic, $text]): ?>
      <a href="<?= e(url($href)) ?>" class="bn-item<?= $meta['nav'] === $key ? ' is-active' : '' ?>" data-nav="<?= e($key) ?>"><span class="bn-icon"><i class="<?= e($ic) ?>" aria-hidden="true"></i></span><span class="bn-label"><?= e($text) ?></span></a>
    <?php endforeach; ?>
    <button type="button" class="bn-item" data-action="drawer-open"><span class="bn-icon"><i class="fa-solid fa-grip" aria-hidden="true"></i></span><span class="bn-label">More</span></button>
  </div>
</nav>

<div class="toast-stack" id="toasts" role="status" aria-live="polite"></div>
<div class="modal-root" id="modal-root"></div>
<script type="application/json" id="app-config"><?= json_attr($appConfig) ?></script>
<script type="application/json" id="page-data"><?= json_attr($pageData) ?></script>
<script src="<?= e(asset('js/core.js')) ?>" defer nonce="<?= e($nonce) ?>"></script>
<script src="<?= e(asset('js/router.js')) ?>" defer nonce="<?= e($nonce) ?>"></script>
<script src="<?= e(admin_asset('js/admin.js')) ?>" defer nonce="<?= e($nonce) ?>"></script>
<?php foreach ($meta['script_urls'] as $src): ?><script src="<?= e($src) ?>" defer nonce="<?= e($nonce) ?>"></script><?php endforeach; ?>
</body>
</html>
