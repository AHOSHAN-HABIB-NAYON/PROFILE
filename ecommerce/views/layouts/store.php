<?php
/**
 * Storefront shell. Everything outside <main id="app-main"> stays mounted
 * during client-side navigation; only the main content is swapped.
 * @var array $meta
 * @var string $content
 */
$nonce = View::nonce();
$tracking = Tracking::browserConfig();
$darkEnabled = setting('dark_mode_enabled') === '1';
$favicon = setting('favicon') ? upload_url(setting('favicon')) : asset('icons/favicon.png');
$baseStyles = ['base', 'header', 'sidebar', 'bottom-nav', 'footer', 'modal', 'product-card'];
$appConfig = [
    'base'        => base_path(),
    'version'     => (int)setting('cache_version', 1),
    'csrfCookie'  => Csrf::PUBLIC_COOKIE,
    'currency'    => setting('currency_symbol', '৳'),
    'bnDigits'    => setting('bengali_digits', '1') === '1',
    'darkMode'    => $darkEnabled,
    'defaultTheme'=> setting('default_theme', 'light'),
    'pwa'         => setting('pwa_enabled') === '1',
    'sw'          => base_path() . '/sw.js',
    'whatsapp'    => setting('whatsapp_enabled') === '1' ? preg_replace('/\D+/', '', en_digits((string)setting('whatsapp_number'))) : '',
    'tracking'    => $tracking,
    'scope'       => 'store',
];
$pageData = ['page' => $meta['page'], 'nav' => $meta['nav'], 'track' => $meta['track'], 'cache' => $meta['cacheable'], 'styles' => $meta['style_urls'], 'scripts' => $meta['script_urls']];
?><!doctype html>
<html lang="bn" data-theme="<?= e(setting('default_theme', 'light') === 'dark' && $darkEnabled ? 'dark' : 'light') ?>">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title><?= e($meta['full_title']) ?></title>
<meta name="description" content="<?= e($meta['description']) ?>">
<meta name="robots" content="<?= e($meta['robots']) ?>">
<link rel="canonical" href="<?= e($meta['canonical']) ?>">
<meta property="og:site_name" content="<?= e(setting('store_name')) ?>">
<meta property="og:locale" content="bn_BD">
<meta property="og:type" content="<?= e($meta['type']) ?>">
<meta property="og:title" content="<?= e($meta['full_title']) ?>">
<meta property="og:description" content="<?= e($meta['description']) ?>">
<meta property="og:url" content="<?= e($meta['canonical']) ?>">
<meta property="og:image" content="<?= e($meta['image']) ?>">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="<?= e($meta['full_title']) ?>">
<meta name="twitter:description" content="<?= e($meta['description']) ?>">
<meta name="twitter:image" content="<?= e($meta['image']) ?>">
<meta name="theme-color" content="<?= e(setting('pwa_theme_color')) ?>">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="<?= e(setting('pwa_short_name')) ?>">
<link rel="icon" href="<?= e($favicon) ?>">
<link rel="apple-touch-icon" href="<?= e(setting('pwa_icon') ? upload_url(str_replace('-512.png', '-180.png', setting('pwa_icon'))) : asset('icons/icon-192.png')) ?>">
<?php if (setting('pwa_enabled') === '1'): ?><link rel="manifest" href="<?= e(url('/manifest.json')) ?>"><?php endif; ?>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://cdnjs.cloudflare.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap" media="print" data-async-css>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" crossorigin="anonymous" referrerpolicy="no-referrer" media="print" data-async-css>
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap"><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css"></noscript>
<?php foreach ($baseStyles as $s): ?>
<link rel="stylesheet" href="<?= e(asset('css/' . $s . '.css')) ?>">
<?php endforeach; ?>
<?php foreach ($meta['style_urls'] as $href): ?>
<link rel="stylesheet" href="<?= e($href) ?>" data-page-style>
<?php endforeach; ?>
<?= View::component('theme-vars') ?>
<script nonce="<?= e($nonce) ?>">(function(){try{var t=localStorage.getItem('ns-theme');if(t&&<?= $darkEnabled ? 'true' : 'false' ?>)document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>
<script type="application/ld+json" id="jsonld"><?= json_attr($meta['jsonld']) ?></script>
<?php if ($tracking['gtm']): ?>
<script nonce="<?= e($nonce) ?>">(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;var n=d.querySelector('[nonce]');if(n)j.setAttribute('nonce',n.nonce||n.getAttribute('nonce'));f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','<?= e($tracking['gtm']) ?>');</script>
<?php endif; ?>
</head>
<body class="store">
<?php if ($tracking['gtm']): ?><noscript><iframe src="https://www.googletagmanager.com/ns.html?id=<?= e($tracking['gtm']) ?>" height="0" width="0" style="display:none;visibility:hidden" title="gtm"></iframe></noscript><?php endif; ?>
<a class="skip-link" href="#app-main">মূল কনটেন্টে যান</a>
<div class="progress" id="progress" aria-hidden="true"><span></span></div>
<?php if (setting('announcement_enabled') === '1' && setting('announcement_text')): ?>
<div class="announce"><i class="fa-solid fa-truck-fast" aria-hidden="true"></i> <?= e(setting('announcement_text')) ?></div>
<?php endif; ?>
<?= View::component('header') ?>
<div class="shell">
  <?= View::component('sidebar', ['nav' => $meta['nav']]) ?>
  <div class="content">
    <main id="app-main" class="main" data-page="<?= e($meta['page']) ?>" tabindex="-1">
<?= $content ?>
    </main>
    <?= View::component('footer') ?>
  </div>
</div>
<?= View::component('bottom-nav', ['nav' => $meta['nav']]) ?>
<?= View::component('whatsapp-float') ?>
<div class="toast-stack" id="toasts" role="status" aria-live="polite"></div>
<div class="modal-root" id="modal-root"></div>
<div class="install" id="install-banner" hidden>
  <div class="install-icon"><i class="fa-solid fa-mobile-screen-button" aria-hidden="true"></i></div>
  <div class="install-text"><strong>অ্যাপ ইনস্টল করুন</strong><span>দ্রুত অর্ডার করতে হোম স্ক্রিনে যোগ করুন</span></div>
  <button type="button" class="btn btn-primary btn-sm" data-action="pwa-install">ইনস্টল</button>
  <button type="button" class="icon-btn" data-action="pwa-dismiss" aria-label="বন্ধ করুন"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
</div>
<script type="application/json" id="app-config"><?= json_attr($appConfig) ?></script>
<script type="application/json" id="page-data"><?= json_attr($pageData) ?></script>
<script src="<?= e(asset('js/core.js')) ?>" defer nonce="<?= e($nonce) ?>"></script>
<script src="<?= e(asset('js/router.js')) ?>" defer nonce="<?= e($nonce) ?>"></script>
<script src="<?= e(asset('js/store.js')) ?>" defer nonce="<?= e($nonce) ?>"></script>
<?php foreach ($meta['script_urls'] as $src): ?>
<script src="<?= e($src) ?>" defer nonce="<?= e($nonce) ?>" data-page-script></script>
<?php endforeach; ?>
</body>
</html>
