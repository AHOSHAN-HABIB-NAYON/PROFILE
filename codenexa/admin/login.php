<?php /** @var string $error */ $f = flash(); ?>
<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Admin Login — <?= e(setting('site_name', 'CodeNexa')) ?></title>
<script>try{if(localStorage.getItem('theme')==='dark')document.documentElement.setAttribute('data-theme','dark');var a=localStorage.getItem('accent');if(a)document.documentElement.setAttribute('data-accent',a)}catch(e){}</script>
<link rel="icon" type="image/svg+xml" href="<?= e(asset('img/favicon.svg')) ?>">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
<link rel="stylesheet" href="<?= e(base_path() . 'admin/admin.css?v=' . filemtime(__DIR__ . '/admin.css')) ?>">
</head>
<body class="login-body">
<form method="post" action="<?= e(admin_url('login')) ?>" class="login-card">
    <div class="login-brand">
        <svg viewBox="0 0 48 48" width="46" height="46"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--a1)"/><stop offset="1" stop-color="var(--a2)"/></linearGradient></defs><path d="M24 3 42 13.5v21L24 45 6 34.5v-21Z" fill="none" stroke="url(#g)" stroke-width="4" stroke-linejoin="round"/><path d="m19 18-6 6 6 6M29 18l6 6-6 6M26 15l-4 18" fill="none" stroke="url(#g)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <h1><?= e(setting('site_name', 'CodeNexa')) ?></h1>
        <p class="muted">Sign in to the admin panel</p>
    </div>
    <?php if ($error): ?><div class="alert err"><?= e($error) ?></div><?php endif; ?>
    <?php if ($f): ?><div class="alert <?= e($f[1]) ?>"><?= e($f[0]) ?></div><?php endif; ?>
    <input type="hidden" name="_csrf" value="<?= e(csrf_token()) ?>">
    <label>Email<input type="email" name="email" required autofocus autocomplete="username"></label>
    <label>Password<input type="password" name="password" required autocomplete="current-password"></label>
    <button class="btn btn-primary btn-block" type="submit"><i class="fa-solid fa-right-to-bracket"></i> Sign In</button>
    <a href="<?= e(base_path()) ?>" class="back muted"><i class="fa-solid fa-arrow-left"></i> Back to website</a>
</form>
</body>
</html>
