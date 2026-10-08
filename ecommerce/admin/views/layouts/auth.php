<?php
/**
 * Minimal shell for login / setup / 2FA screens.
 * @var string $content
 */
$nonce = View::nonce();
?><!doctype html>
<html lang="bn" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="csrf-token" content="<?= e(Csrf::adminToken()) ?>">
<title>Admin — <?= e(setting('store_name')) ?></title>
<link rel="icon" href="<?= e(setting('favicon') ? upload_url(setting('favicon')) : asset('icons/favicon.png')) ?>">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" crossorigin="anonymous" referrerpolicy="no-referrer">
<link rel="stylesheet" href="<?= e(asset('css/base.css')) ?>">
<link rel="stylesheet" href="<?= e(asset('css/modal.css')) ?>">
<link rel="stylesheet" href="<?= e(admin_asset('css/admin.css')) ?>">
<?= View::component('theme-vars') ?>
<script nonce="<?= e($nonce) ?>">(function(){try{var t=localStorage.getItem('ns-admin-theme');if(t)document.documentElement.setAttribute('data-theme',JSON.parse(t));}catch(e){}})();</script>
</head>
<body class="auth-body">
<main class="auth-wrap">
  <div class="auth-card">
    <div class="auth-brand">
      <span class="brand-mark"><i class="fa-solid fa-bag-shopping" aria-hidden="true"></i></span>
      <div><strong><?= e(setting('store_name')) ?></strong><span class="muted small d-block">Admin Panel</span></div>
    </div>
    <?= $content ?>
  </div>
  <p class="auth-foot muted small"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Secured with encrypted sessions, CSRF protection &amp; login throttling</p>
</main>
<div class="toast-stack" id="toasts" role="status" aria-live="polite"></div>
<div class="modal-root" id="modal-root"></div>
<script type="application/json" id="app-config"><?= json_attr(['base' => base_path(), 'scope' => 'auth', 'currency' => '৳', 'bnDigits' => false]) ?></script>
<script src="<?= e(asset('js/core.js')) ?>" defer nonce="<?= e($nonce) ?>"></script>
<script src="<?= e(admin_asset('js/admin.js')) ?>" defer nonce="<?= e($nonce) ?>"></script>
</body>
</html>
