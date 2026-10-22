<?php use OryzenX\Core\View; /** @var callable $e */
$titles = [400 => 'Request problem', 401 => 'Please sign in', 403 => 'Access denied', 404 => 'Page not found', 405 => 'Not allowed', 419 => 'Session expired', 429 => 'Too many requests', 500 => 'Something went wrong'];
?><!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<meta name="color-scheme" content="light"><script src="<?= $e(View::asset('js/theme-boot.js')) ?>"></script>
<title><?= $e($titles[$status] ?? 'Error') ?> — OryzenX</title><link rel="stylesheet" href="<?= $e(View::asset('css/tokens.css')) ?>"><link rel="stylesheet" href="<?= $e(View::asset('css/app.css')) ?>"></head>
<body><main class="center-page"><div class="center-card">
<div class="center-logo"><?php include __DIR__ . '/../partials/logo.php'; ?></div>
<p class="subtle num"><?= (int) $status ?></p>
<h1><?= $e($titles[$status] ?? 'Error') ?></h1><p class="muted"><?= $e($message) ?></p>
<a class="btn btn-primary btn-block" href="<?= $e(View::url('')) ?>">Go to the home page</a>
</div></main></body></html>
