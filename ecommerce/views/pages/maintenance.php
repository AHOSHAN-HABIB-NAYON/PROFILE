<?php
/**
 * @var string $message
 */
?>
<div class="error-page">
  <span class="empty-icon"><i class="fa-solid fa-screwdriver-wrench" aria-hidden="true"></i></span>
  <h1 class="page-title">সাইট আপডেট হচ্ছে</h1>
  <p class="muted"><?= e($message) ?></p>
  <?php if (setting('whatsapp_number')): ?>
    <a class="btn btn-wa" href="<?= e(whatsapp_link((string)setting('whatsapp_number'))) ?>" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> হোয়াটসঅ্যাপে যোগাযোগ</a>
  <?php endif; ?>
</div>
