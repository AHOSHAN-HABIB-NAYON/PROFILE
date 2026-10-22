<?php use OryzenX\Core\View; /** @var callable $e */
$boot = ['kind' => $kind, 'locale' => $locale, 'base' => rtrim(View::url(''), '/'), 'strings' => $strings, 'googleClientId' => $googleClientId, 'demo' => $demo, 'site' => $site, 'timezone' => $timezone];
?><!doctype html>
<html lang="<?= $e($locale) ?>">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light">
<meta name="robots" content="noindex, nofollow">
<script src="<?= $e(View::asset('js/theme-boot.js')) ?>"></script>
<meta name="theme-color" content="#F5F7FB">
<title><?= $e($site) ?><?= $kind === 'admin' ? ' Admin' : '' ?></title>
<link rel="icon" href="<?= $e(View::asset('images/favicon.svg')) ?>" type="image/svg+xml">
<link rel="manifest" href="<?= $e(View::url('manifest.webmanifest')) ?>">
<link rel="preload" href="<?= $e(View::url('assets/fonts/inter-latin-var.woff2')) ?>" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="<?= $e(View::asset('css/tokens.css')) ?>">
<link rel="stylesheet" href="<?= $e(View::asset('css/app.css')) ?>">
<style>:root{--primary:<?= $e(preg_match('/^#[0-9A-Fa-f]{6}$/', $brand) ? $brand : '#1A56DB') ?>}:root[data-theme="dark"]{--primary:#5B8DEF}</style>
</head>
<body class="app-<?= $e($kind) ?>">
<noscript><p style="padding:24px">OryzenX needs JavaScript enabled to run in the browser.</p></noscript>
<div id="app" aria-live="off"><div class="boot-screen" role="status"><?php include __DIR__ . '/../partials/logo.php'; ?><span class="spinner" aria-hidden="true"></span><span class="sr-only">Loading…</span></div></div>
<div id="toasts" class="toasts" role="status" aria-live="polite"></div>
<script id="boot-data" type="application/json"><?= json_encode($boot, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?></script>
<script src="<?= $e(View::asset('js/icons.js')) ?>" defer></script>
<script src="<?= $e(View::asset('vendor/lightweight-charts-4.2.3.min.js')) ?>" defer></script>
<?php if ($googleClientId): ?><script src="https://accounts.google.com/gsi/client" async defer></script><?php endif; ?>
<script src="<?= $e(View::asset('js/core.js')) ?>" defer></script>
<script src="<?= $e(View::asset('js/' . ($kind === 'admin' ? 'admin' : 'user') . '.js')) ?>" defer></script>
</body>
</html>
