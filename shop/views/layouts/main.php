<?php
/** @var string $content @var array $meta */
$site = (string) setting('site_name');
$themeCookie = $_COOKIE['theme'] ?? '';
$theme = Settings::on('theme_toggle') && in_array($themeCookie, ['light', 'dark'], true) ? $themeCookie : (setting('theme_default') === 'dark' ? 'dark' : 'light');
$cartCount = CartService::count();
$favicon = setting('favicon') ?: '/assets/icons/icon-192.png';
$primary = preg_match('/^#[0-9a-f]{6}$/i', (string) setting('primary_color')) ? setting('primary_color') : '#4f46e5';
$wa = preg_replace('/\D/', '', (string) setting('whatsapp_number'));
$config = [
    'csrf' => Csrf::token(),
    'site' => $site,
    'whatsapp' => ['enabled' => Settings::on('whatsapp_enabled') && $wa !== '', 'number' => $wa, 'message' => setting('whatsapp_message'), 'general' => setting('whatsapp_general_message')],
    'pixel' => ['enabled' => Settings::on('meta_enabled') && setting('meta_pixel_id') !== '', 'id' => (string) setting('meta_pixel_id')],
    'gtag' => ['enabled' => Settings::on('gtag_enabled') && setting('gtag_id') !== '', 'id' => (string) setting('gtag_id'), 'ads' => (string) setting('gads_conversion_id'), 'label' => (string) setting('gads_conversion_label')],
    'pwa' => Settings::on('pwa_enabled'),
    'themeToggle' => Settings::on('theme_toggle'),
    'eventId' => $meta['event_id'] ?? null,
];
?><!doctype html>
<html lang="bn" data-theme="<?= e($theme) ?>">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title><?= e($meta['full_title']) ?></title>
<meta name="description" content="<?= e($meta['description']) ?>">
<?php if (!empty($meta['keywords'])): ?><meta name="keywords" content="<?= e($meta['keywords']) ?>"><?php endif; ?>
<meta name="robots" content="<?= e($meta['robots']) ?>">
<link rel="canonical" href="<?= e($meta['canonical']) ?>">
<meta property="og:site_name" content="<?= e($site) ?>">
<meta property="og:type" content="<?= e($meta['og_type']) ?>">
<meta property="og:title" content="<?= e($meta['full_title']) ?>">
<meta property="og:description" content="<?= e($meta['description']) ?>">
<meta property="og:url" content="<?= e($meta['canonical']) ?>">
<?php if ($meta['og_image']): ?><meta property="og:image" content="<?= e($meta['og_image']) ?>"><?php endif; ?>
<meta property="og:locale" content="bn_BD">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="<?= e(setting('pwa_theme_color', $primary)) ?>">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="<?= e(setting('pwa_short_name') ?: $site) ?>">
<link rel="manifest" href="/manifest.json">
<link rel="icon" href="<?= e(str_starts_with($favicon, '/') ? $favicon : '/' . $favicon) ?>">
<link rel="apple-touch-icon" href="<?= e(is_file(BASE_PATH . '/uploads/branding/icon-192.png') ? '/uploads/branding/icon-192.png' : '/assets/icons/icon-192.png') ?>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" href="/assets/vendor/font-awesome/fonts/fontawesome-webfont.woff2?v=4.7.0" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="<?= asset('vendor/font-awesome/css/font-awesome.min.css') ?>">
<link rel="stylesheet" href="<?= asset('css/app.css') ?>">
<style>:root{--primary:<?= e($primary) ?>;--cols:<?= max(1, min(3, (int) setting('grid_mobile', 2))) ?>;--grid-tablet:<?= max(2, min(5, (int) setting('grid_tablet', 3))) ?>;--grid-desktop:<?= max(3, min(6, (int) setting('grid_desktop', 5))) ?>}</style>
<?php foreach ((array) ($meta['jsonld'] ?? []) as $ld): ?>
<script type="application/ld+json"><?= json_encode($ld, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG) ?></script>
<?php endforeach; ?>
</head>
<body data-page="<?= e($meta['page']) ?>">
<a class="skip-link" href="#app">মূল কনটেন্টে যান</a>
<div id="progress" class="progress" aria-hidden="true"><span></span></div>

<header class="app-header">
  <div class="container header-row">
    <button type="button" class="icon-btn back-btn" data-back aria-label="পেছনে যান"><i class="fa fa-arrow-left"></i></button>
    <span class="appbar-title" data-appbar-title><?= e($meta['title']) ?></span>
    <a href="/" class="brand" aria-label="<?= e($site) ?> হোম">
      <?php if (setting('logo')): ?>
        <img src="/<?= e(setting('logo')) ?>" alt="<?= e($site) ?>" width="120" height="32" class="brand-logo">
      <?php else: ?>
        <span class="brand-mark"><i class="fa fa-shopping-bag" aria-hidden="true"></i></span><span class="brand-name"><?= e($site) ?></span>
      <?php endif; ?>
    </a>
    <form class="header-search" action="/products" method="get" role="search" data-search-form>
      <i class="fa fa-search" aria-hidden="true"></i>
      <input type="search" name="q" placeholder="পণ্য খুঁজুন…" autocomplete="off" aria-label="পণ্য খুঁজুন" data-search-input>
      <div class="search-suggest" data-search-results hidden></div>
    </form>
    <nav class="desk-nav" aria-label="প্রধান মেনু">
      <a href="/" data-nav="home">হোম</a>
      <a href="/products" data-nav="products">সকল পণ্য</a>
      <a href="/categories" data-nav="categories">ক্যাটাগরি</a>
      <a href="/my-orders" data-nav="more">আমার অর্ডার</a>
      <a href="/contact" data-nav="support">সাপোর্ট</a>
    </nav>
    <div class="header-actions">
      <button type="button" class="icon-btn" data-open-search aria-label="খুঁজুন"><i class="fa fa-search"></i></button>
      <?php if (Settings::on('theme_toggle')): ?>
      <button type="button" class="icon-btn only-desktop" data-theme-toggle aria-label="থিম পরিবর্তন"><i class="fa fa-moon-o"></i></button>
      <?php endif; ?>
      <button type="button" class="btn btn-sm btn-soft only-desktop" data-install hidden><i class="fa fa-download"></i> অ্যাপ ইনস্টল</button>
      <a href="/cart" class="icon-btn cart-btn" aria-label="কার্ট" data-nav="cart">
        <i class="fa fa-shopping-cart"></i><span class="badge-count" data-cart-count<?= $cartCount ? '' : ' hidden' ?>><?= bn_num($cartCount) ?></span>
      </a>
    </div>
  </div>
</header>

<main id="app" class="app-main" tabindex="-1" data-page="<?= e($meta['page']) ?>" data-nav-key="<?= e($meta['nav']) ?>">
<?= $content ?>
</main>

<footer class="app-footer">
  <div class="container footer-grid">
    <div>
      <strong class="footer-brand"><?= e($site) ?></strong>
      <p class="muted small"><?= e(setting('site_tagline')) ?></p>
    </div>
    <div class="small">
      <p><i class="fa fa-truck"></i> <?= e(setting('delivery_info')) ?></p>
      <p><i class="fa fa-money"></i> <?= e(setting('cod_info')) ?></p>
    </div>
    <div class="small footer-links">
      <a href="/products">সকল পণ্য</a><a href="/categories">ক্যাটাগরি</a><a href="/contact">যোগাযোগ</a>
      <?php if (setting('facebook_url')): ?><a href="<?= e(setting('facebook_url')) ?>" target="_blank" rel="noopener"><i class="fa fa-facebook-square"></i> Facebook</a><?php endif; ?>
    </div>
  </div>
  <p class="container copyright">© <?= bn_num(date('Y')) ?> <?= e($site) ?> · সর্বস্বত্ব সংরক্ষিত</p>
</footer>

<nav class="bottom-nav" aria-label="মোবাইল মেনু">
  <a href="/" data-nav="home"><i class="fa fa-home"></i><span>হোম</span></a>
  <a href="/categories" data-nav="categories"><i class="fa fa-th-large"></i><span>ক্যাটাগরি</span></a>
  <a href="/cart" data-nav="cart" class="bn-cart"><i class="fa fa-shopping-cart"></i><span>কার্ট</span><b class="badge-count" data-cart-count<?= $cartCount ? '' : ' hidden' ?>><?= bn_num($cartCount) ?></b></a>
  <a href="/contact" data-nav="support"><i class="fa fa-headphones"></i><span>সাপোর্ট</span></a>
  <button type="button" data-open-sheet="more" data-nav="more"><i class="fa fa-bars"></i><span>আরও</span></button>
</nav>

<?php if ($config['whatsapp']['enabled']): ?>
<a class="wa-fab" href="https://wa.me/<?= e($wa) ?>" target="_blank" rel="noopener" data-whatsapp aria-label="WhatsApp-এ যোগাযোগ"><i class="fa fa-whatsapp"></i></a>
<?php endif; ?>

<div class="sheet" data-sheet="more" hidden>
  <div class="sheet-backdrop" data-close-sheet></div>
  <div class="sheet-panel" role="dialog" aria-modal="true" aria-label="আরও অপশন">
    <div class="sheet-handle"></div>
    <div class="sheet-list">
      <a href="/my-orders"><i class="fa fa-list-alt"></i> আমার অর্ডার</a>
      <a href="/products"><i class="fa fa-th"></i> সকল পণ্য</a>
      <?php if (Settings::on('flash_enabled')): ?><a href="/products?filter=flash"><i class="fa fa-bolt"></i> ফ্ল্যাশ সেল</a><?php endif; ?>
      <?php if (Settings::on('free_delivery_enabled')): ?><a href="/products?filter=free"><i class="fa fa-truck"></i> ফ্রি ডেলিভারি</a><?php endif; ?>
      <a href="/contact"><i class="fa fa-phone"></i> যোগাযোগ</a>
      <?php if (setting('facebook_url')): ?><a href="<?= e(setting('facebook_url')) ?>" target="_blank" rel="noopener" data-no-spa><i class="fa fa-facebook-square"></i> Facebook পেজ</a><?php endif; ?>
      <?php if (Settings::on('theme_toggle')): ?><button type="button" data-theme-toggle><i class="fa fa-moon-o"></i> <span data-theme-label>ডার্ক মোড</span></button><?php endif; ?>
      <button type="button" data-install hidden><i class="fa fa-download"></i> অ্যাপ ইনস্টল করুন</button>
    </div>
  </div>
</div>

<div class="sheet" data-sheet="install" hidden>
  <div class="sheet-backdrop" data-close-sheet></div>
  <div class="sheet-panel install-panel" role="dialog" aria-modal="true" aria-label="অ্যাপ ইনস্টল">
    <div class="sheet-handle"></div>
    <span class="brand-mark lg"><i class="fa fa-shopping-bag"></i></span>
    <strong class="install-site"><?= e($site) ?></strong>
    <h2>অ্যাপ হিসেবে ইনস্টল করুন</h2>
    <p class="muted small">ফোনে অ্যাপের মতো ব্যবহার করুন — দ্রুত খুলবে, কম ডেটা লাগবে।</p>
    <div class="install-art" aria-hidden="true"><span class="phone"><i class="fa fa-shopping-bag"></i></span><span class="plus"><i class="fa fa-plus"></i></span></div>
    <button type="button" class="btn btn-primary btn-block btn-cta" data-install-confirm><i class="fa fa-download"></i> ইনস্টল করুন</button>
    <button type="button" class="btn btn-ghost btn-block" data-install-later>পরে</button>
  </div>
</div>

<div class="search-overlay" data-search-overlay hidden>
  <div class="search-overlay-bar">
    <button type="button" class="icon-btn" data-close-search aria-label="বন্ধ করুন"><i class="fa fa-arrow-left"></i></button>
    <form action="/products" method="get" role="search" data-search-form class="grow">
      <input type="search" name="q" placeholder="পণ্য খুঁজুন…" autocomplete="off" aria-label="পণ্য খুঁজুন" data-search-input>
    </form>
  </div>
  <div class="search-overlay-results" data-search-results></div>
</div>

<div class="toast-wrap" aria-live="polite" aria-atomic="true" data-toasts></div>
<script type="application/json" id="app-config"><?= json_encode($config, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP) ?></script>
<?php foreach (['ajax', 'cache', 'animations', 'lazyload', 'router', 'prefetch', 'navigation', 'cart', 'product', 'checkout', 'whatsapp', 'tracking', 'pwa', 'app'] as $js): ?>
<script src="<?= asset('js/' . $js . '.js') ?>" defer></script>
<?php endforeach; ?>
</body>
</html>
