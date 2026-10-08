<?php
/**
 * Friendly error page (404/500/…). Never shows technical details.
 * @var int $status @var string $message
 */
$is404 = (int)$status === 404;
?>
<div class="error-page">
  <span class="error-code"><?= e(bn_digits((string)$status)) ?></span>
  <h1 class="page-title"><?= $is404 ? 'পেজটি পাওয়া যায়নি' : 'দুঃখিত!' ?></h1>
  <p class="muted"><?= e($message) ?></p>
  <div class="error-actions">
    <a href="<?= e(url('/')) ?>" class="btn btn-primary"><i class="fa-solid fa-house" aria-hidden="true"></i> হোমে ফিরে যান</a>
    <a href="<?= e(url('/products')) ?>" class="btn btn-outline">পণ্য দেখুন</a>
  </div>
</div>
