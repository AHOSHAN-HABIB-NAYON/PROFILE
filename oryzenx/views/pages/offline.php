<!doctype html>
<html lang="<?= e(lang()) ?>">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= e(t('offline.title')) ?> · <?= e(setting('site_name')) ?></title>
<meta name="theme-color" content="<?= e(setting('pwa_theme_color')) ?>">
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:Inter,"Hind Siliguri",system-ui,sans-serif;background:#f4f6fb;color:#0f172a;padding:20px;box-sizing:border-box}
@media (prefers-color-scheme:dark){body{background:#0b1220;color:#e7ecf5}.c{background:#121b2d!important;border-color:#233149!important}}
.c{max-width:360px;text-align:center;background:#fff;border:1px solid #e5e9f2;border-radius:16px;padding:28px 22px}
.i{width:56px;height:56px;margin:0 auto 12px;border-radius:16px;display:grid;place-items:center;background:<?= e(setting('color_primary')) ?>;color:#fff;font-size:26px}
h1{font-size:19px;margin:0 0 6px}p{font-size:14px;opacity:.75;margin:0 0 16px}
button{height:38px;padding:0 18px;border-radius:10px;border:0;background:<?= e(setting('color_primary')) ?>;color:#fff;font-weight:600;font-size:14px;cursor:pointer}
</style>
</head>
<body>
<div class="c"><div class="i">⚡</div><h1><?= e(t('offline.title')) ?></h1><p><?= e(t('offline.text')) ?></p><button onclick="location.reload()"><?= e(t('offline.retry')) ?></button></div>
</body>
</html>
