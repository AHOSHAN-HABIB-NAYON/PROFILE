<?php
/** Offline fallback (pre-cached by the service worker as a guest page). */
defined('APP') || exit;
meta(['title' => t('offline.title'), 'robots' => 'noindex']);
?>
<div class="page" style="display:grid;place-items:center;min-height:80vh;text-align:center">
  <div style="max-width:380px">
    <span class="icon-box lg" style="margin:0 auto 14px"><i class="fa-solid fa-wifi"></i></span>
    <h1 style="font-size:1.3rem"><?= e(t('offline.title')) ?></h1>
    <p class="muted"><?= e(t('offline.text')) ?></p>
    <a class="btn" href="<?= e(url('/')) ?>" data-no-spa><i class="fa-solid fa-rotate-right"></i><?= e(t('offline.retry')) ?></a>
  </div>
</div>
