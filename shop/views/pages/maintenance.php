<!doctype html>
<html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title><?= e(setting('site_name')) ?> — রক্ষণাবেক্ষণ চলছে</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;600&display=swap">
<link rel="stylesheet" href="<?= asset('vendor/font-awesome/css/font-awesome.min.css') ?>">
<link rel="stylesheet" href="<?= asset('css/app.css') ?>">
</head><body class="maint-body">
<main class="maint">
  <span class="maint-icon"><i class="fa fa-cogs"></i></span>
  <h1><?= e(setting('site_name')) ?></h1>
  <p><?= nl2br(e(setting('maintenance_message'))) ?></p>
  <?php $wa = preg_replace('/\D/', '', (string) setting('whatsapp_number')); if ($wa): ?>
  <a class="btn btn-wa btn-sm" href="https://wa.me/<?= e($wa) ?>" rel="noopener"><i class="fa fa-whatsapp"></i> WhatsApp-এ যোগাযোগ</a>
  <?php endif; ?>
</main>
</body></html>
