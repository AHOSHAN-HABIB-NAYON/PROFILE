<?php
/**
 * Full HTML document for first loads / direct URL access.
 * Variables: $content, $shell, $page, $active, $meta, $fullTitle (from View::render)
 */
$siteName = (string) setting('site_name', 'Probaho');
$user = Auth::user();
$themePref = $user['theme'] ?? null;
if ($shell === 'admin') {
    $themePref = null;
}
$themeDefault = (string) setting('theme_default', 'light');
$allowedThemes = array_keys(array_filter(['light' => setting_on('theme_light'), 'dark' => setting_on('theme_dark'), 'system' => setting_on('theme_system')]));
if (!$allowedThemes) {
    $allowedThemes = ['light'];
}
$themeColor = (string) setting('theme_color', '#5b4bff');
$accent = (string) setting('accent_color', $themeColor);
$ogImage = abs_url(upload_url(setting('og_image'), url('assets/images/og-image.png')));
$canonical = $meta['canonical'] ?: abs_url(strtok($_SERVER['REQUEST_URI'] ?? '/', '?') ?: '/');
$favicon = upload_url(setting('favicon'), url('assets/icons/favicon.svg'));
$appIcon = upload_url(setting('pwa_icon'), url('assets/icons/icon-192.png'));
$pwa = setting_on('pwa_enabled');

$appConfig = [
    'base' => base_path(),
    'csrf' => csrf_token(),
    'shell' => $shell,
    'auth' => (bool) $user,
    'siteName' => $siteName,
    'theme' => ['default' => $themeDefault, 'allowed' => $allowedThemes, 'user' => $themePref],
    'pwa' => ['enabled' => $pwa, 'auto' => setting_on('pwa_auto_prompt'), 'delay' => max(3, (int) setting('pwa_install_delay', '25'))],
    'push' => ['enabled' => WebPush::enabled(), 'key' => WebPush::publicKey()],
    'passkey' => WebAuthn::enabled(),
    'ai' => AI::enabled() && $shell !== 'admin' ? ['name' => setting('ai_name'), 'welcome' => setting('ai_welcome'), 'quick' => Settings::lines('ai_quick_questions')] : null,
    'captcha' => ['provider' => Captcha::provider()],
];
?><!doctype html>
<html lang="bn" data-theme-pref="<?= e($themePref ?: $themeDefault) ?>" data-shell="<?= e($shell) ?>">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title><?= e($fullTitle) ?></title>
<meta name="description" content="<?= e(mb_substr((string) $meta['description'], 0, 300)) ?>">
<?php if ($meta['noindex'] || $shell === 'admin' || $shell === 'app'): ?><meta name="robots" content="noindex, nofollow"><?php endif; ?>
<link rel="canonical" href="<?= e($canonical) ?>">
<meta name="theme-color" content="<?= e($themeColor) ?>" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b0d17" media="(prefers-color-scheme: dark)">
<meta name="color-scheme" content="light dark">
<meta property="og:type" content="website">
<meta property="og:site_name" content="<?= e($siteName) ?>">
<meta property="og:title" content="<?= e($fullTitle) ?>">
<meta property="og:description" content="<?= e(mb_substr((string) $meta['description'], 0, 300)) ?>">
<meta property="og:image" content="<?= e($meta['image'] ? abs_url($meta['image']) : $ogImage) ?>">
<meta property="og:url" content="<?= e($canonical) ?>">
<meta property="og:locale" content="bn_BD">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="<?= e($favicon) ?>" type="<?= str_ends_with($favicon, '.svg') ? 'image/svg+xml' : 'image/png' ?>">
<link rel="icon" href="<?= e(url('assets/icons/favicon-32.png')) ?>" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="<?= e(upload_url(setting('pwa_icon'), url('assets/icons/apple-touch-icon.png'))) ?>">
<?php if ($pwa): ?><link rel="manifest" href="<?= e(url('manifest.json')) ?>">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="<?= e(setting('pwa_short_name', $siteName)) ?>"><?php endif; ?>
<meta name="base-path" content="<?= e(base_path()) ?>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800&display=swap">
<link rel="stylesheet" href="<?= e(asset('css/app.css')) ?>">
<?php if ($shell === 'admin'): ?><link rel="stylesheet" href="<?= e(asset('css/admin.css')) ?>"><?php endif; ?>
<style>:root{--brand:<?= e($themeColor) ?>;--accent:<?= e($accent) ?>}</style>
<script>
/* Apply theme before first paint (no flash, no reload on change). */
(function(){var d=document.documentElement,p=null;try{p=localStorage.getItem('pb-theme')}catch(e){}
p=p||d.getAttribute('data-theme-pref')||'light';var t=p==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p;
d.setAttribute('data-theme',t==='dark'?'dark':'light');})();
</script>
<?php if (is_array($meta['schema'])): ?><script type="application/ld+json"><?= json_encode($meta['schema'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG) ?></script><?php endif; ?>
<?php if ($shell !== 'admin' && setting('analytics_head') !== ''): ?><?= setting('analytics_head') ?><?php endif; ?>
</head>
<body class="shell-<?= e($shell) ?>">
<?= Icons::sprite() ?>
<div class="topbar-progress" id="progress"></div>
<div id="shell"><?= View::shell($shell, $content, $active, $meta) ?></div>
<?php if ($shell !== 'admin'): ?>
<?php require ROOT . '/includes/widgets.php'; ?>
<?php endif; ?>
<div class="toast-stack" id="toasts" aria-live="polite"></div>
<div class="modal-root" id="modal-root"></div>
<script id="app-config" type="application/json"><?= json_encode($appConfig, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP) ?></script>
<script src="<?= e(asset('js/app.js')) ?>" defer></script>
<?php if ($shell === 'admin'): ?><script src="<?= e(asset('js/admin.js')) ?>" defer></script><?php endif; ?>
</body>
</html>
