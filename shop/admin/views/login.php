<!doctype html>
<html lang="bn" data-theme="light">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>অ্যাডমিন লগইন</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="<?= asset('vendor/font-awesome/css/font-awesome.min.css') ?>">
<link rel="stylesheet" href="<?= asset('css/app.css') ?>">
<link rel="stylesheet" href="<?= asset('css/admin.css') ?>">
</head>
<body class="auth-body">
<main class="auth-card card">
  <div class="auth-head"><span class="brand-mark"><i class="fa fa-lock"></i></span><h1>অ্যাডমিন লগইন</h1><p class="muted small"><?= e(setting('site_name')) ?></p></div>
  <form id="login-form" novalidate>
    <?= Csrf::field() ?>
    <div class="field"><label for="u">ইউজারনেম</label><input id="u" name="username" autocomplete="username" required autofocus></div>
    <div class="field"><label for="p">পাসওয়ার্ড</label><input id="p" name="password" type="password" autocomplete="current-password" required></div>
    <p class="field-error" data-login-error<?= $error ? '' : ' hidden' ?>><?= e($error) ?></p>
    <button class="btn btn-primary btn-block" type="submit"><i class="fa fa-sign-in"></i> লগইন</button>
  </form>
</main>
<script src="<?= asset('js/login.js') ?>" defer></script>
</body>
</html>
