<?php use OryzenX\Core\View; /** @var callable $e */ ?><!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Installer locked</title><link rel="stylesheet" href="<?= $e(View::asset('css/tokens.css')) ?>"><link rel="stylesheet" href="<?= $e(View::asset('css/app.css')) ?>"></head>
<body><main class="center-page"><div class="center-card"><h1>Installer locked</h1>
<p class="muted">OryzenX is already installed. To reinstall, an operator with server access must follow the recovery procedure in docs/INSTALL.md (remove storage/installed.lock and set 'installed' =&gt; false in config/config.php).</p>
<a class="btn btn-primary btn-block" href="<?= $e(View::url('')) ?>">Go to the home page</a></div></main></body></html>
