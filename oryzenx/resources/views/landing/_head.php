<?php use OryzenX\Core\View; /** @var callable $e */ ?>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light">
<script src="<?= $e(View::asset('js/theme-boot.js')) ?>"></script>
<meta name="theme-color" content="#F5F7FB" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0A1120" media="(prefers-color-scheme: dark)">
<link rel="icon" href="<?= $e(View::asset('images/favicon.svg')) ?>" type="image/svg+xml">
<link rel="apple-touch-icon" href="<?= $e(View::asset('images/icon-192.png')) ?>">
<link rel="manifest" href="<?= $e(View::url('manifest.webmanifest')) ?>">
<link rel="preload" href="<?= $e(View::url('assets/fonts/inter-latin-var.woff2')) ?>" as="font" type="font/woff2" crossorigin>
<?php if ($locale === 'bn'): ?><link rel="preload" href="<?= $e(View::url('assets/fonts/noto-sans-bengali-400.woff2')) ?>" as="font" type="font/woff2" crossorigin><?php endif; ?>
<link rel="stylesheet" href="<?= $e(View::asset('css/tokens.css')) ?>">
<link rel="stylesheet" href="<?= $e(View::asset('css/landing.css')) ?>">
<style>:root{--primary:<?= $e(preg_match('/^#[0-9A-Fa-f]{6}$/', $brand) ? $brand : '#1A56DB') ?>}:root[data-theme="dark"]{--primary:#5B8DEF}</style>
