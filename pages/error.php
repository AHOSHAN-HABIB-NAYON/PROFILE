<?php
/** Friendly error page (404/403/429/500/…). Never shows technical details. */
defined('APP') || exit;
$code = (int)($params['code'] ?? 500);
$icons = [403 => 'fa-lock', 404 => 'fa-compass', 419 => 'fa-hourglass-end', 429 => 'fa-gauge-high', 500 => 'fa-triangle-exclamation', 503 => 'fa-screwdriver-wrench'];
?>
<style data-css="error">
.err{display:grid;place-items:center;text-align:center;min-height:56vh}
.err .num{font-size:clamp(3.5rem,3rem + 4vw,6rem);font-weight:800;line-height:1;background:linear-gradient(135deg,var(--primary),var(--secondary));-webkit-background-clip:text;background-clip:text;color:transparent;margin:10px 0}
.err .icon-box{margin:0 auto;animation:rtBounce 2s ease-in-out infinite}
</style>
<div class="page err" data-page="error">
  <div style="max-width:420px">
    <span class="icon-box lg"><i class="fa-solid <?= $icons[$code] ?? 'fa-circle-exclamation' ?>"></i></span>
    <div class="num"><?= $code ?></div>
    <h1 style="font-size:1.3rem"><?= e(t('error.' . $code . '_title')) ?></h1>
    <p class="muted"><?= e(t('error.' . $code . '_text')) ?></p>
    <div class="row wrap" style="justify-content:center">
      <a class="btn" href="<?= e(url('/')) ?>"><i class="fa-solid fa-house"></i><?= e(t('nav.home')) ?></a>
      <a class="btn btn-ghost" href="<?= e(url('/contact')) ?>"><?= e(t('contact.title')) ?></a>
    </div>
  </div>
</div>
