<?php
/**
 * Minimal standalone layout for fatal errors and maintenance (no DB-heavy components).
 * @var string $content
 */
?><!doctype html>
<html lang="bn">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title><?= e(setting('store_name', 'Shop')) ?></title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" crossorigin="anonymous" referrerpolicy="no-referrer">
<link rel="stylesheet" href="<?= e(asset('css/base.css')) ?>">
<?= View::component('theme-vars') ?>
</head>
<body class="minimal">
<main class="main"><?= $content ?></main>
</body>
</html>
