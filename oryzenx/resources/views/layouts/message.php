<?php use OryzenX\Core\View; /** @var callable $e */ ?><!doctype html>
<html lang="<?= $e($locale ?? 'en') ?>"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light"><script src="<?= $e(View::asset('js/theme-boot.js')) ?>"></script>
<title><?= $e($title) ?> — OryzenX</title><link rel="stylesheet" href="<?= $e(View::asset('css/tokens.css')) ?>"><link rel="stylesheet" href="<?= $e(View::asset('css/app.css')) ?>"></head>
<body><main class="center-page"><div class="center-card">
<div class="center-logo"><?php include __DIR__ . '/../partials/logo.php'; ?></div>
<div class="status-icon <?= !empty($ok) ? 'ok' : 'err' ?>" aria-hidden="true"><?= !empty($ok) ? '✓' : '!' ?></div>
<h1><?= $e($title) ?></h1><p class="muted"><?= $e($message) ?></p>
<?php if (!empty($cta)): ?><a class="btn btn-primary btn-block" href="<?= $e($cta) ?>"><?= $e($ctaLabel) ?></a><?php endif; ?>
</div></main></body></html>
