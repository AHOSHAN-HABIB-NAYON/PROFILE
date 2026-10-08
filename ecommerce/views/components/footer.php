<?php
/**
 * Persistent footer.
 */
$social = array_filter([
    ['fa-brands fa-facebook-f', setting('facebook_url'), 'Facebook'],
    ['fa-brands fa-facebook-messenger', setting('messenger_url'), 'Messenger'],
    ['fa-brands fa-instagram', setting('instagram_url'), 'Instagram'],
    ['fa-brands fa-youtube', setting('youtube_url'), 'YouTube'],
    ['fa-brands fa-tiktok', setting('tiktok_url'), 'TikTok'],
], static fn($s) => !empty($s[1]));
?>
<footer class="footer">
  <div class="footer-grid">
    <div class="footer-brand">
      <p class="footer-name"><?= e(setting('store_name')) ?></p>
      <p class="footer-tag"><?= e(setting('store_tagline')) ?></p>
      <?php if ($social): ?>
      <div class="footer-social">
        <?php foreach ($social as [$ic, $href, $label]): ?>
          <a href="<?= e($href) ?>" target="_blank" rel="noopener" class="icon-btn" aria-label="<?= e($label) ?>"><i class="<?= e($ic) ?>" aria-hidden="true"></i></a>
        <?php endforeach; ?>
      </div>
      <?php endif; ?>
    </div>
    <div>
      <p class="footer-title">তথ্য</p>
      <a href="<?= e(url('/page/about')) ?>">আমাদের সম্পর্কে</a>
      <a href="<?= e(url('/page/privacy')) ?>">গোপনীয়তা নীতি</a>
      <a href="<?= e(url('/page/terms')) ?>">শর্তাবলী</a>
      <a href="<?= e(url('/page/return-policy')) ?>">রিটার্ন নীতি</a>
    </div>
    <div>
      <p class="footer-title">যোগাযোগ</p>
      <?php if (setting('contact_phone')): ?><a href="tel:<?= e(preg_replace('/[^\d+]/', '', (string)setting('contact_phone'))) ?>"><i class="fa-solid fa-phone" aria-hidden="true"></i> <?= e(setting('contact_phone')) ?></a><?php endif; ?>
      <?php if (setting('contact_email')): ?><a href="mailto:<?= e(setting('contact_email')) ?>"><i class="fa-solid fa-envelope" aria-hidden="true"></i> <?= e(setting('contact_email')) ?></a><?php endif; ?>
      <?php if (setting('contact_address')): ?><span><i class="fa-solid fa-location-dot" aria-hidden="true"></i> <?= e(setting('contact_address')) ?></span><?php endif; ?>
    </div>
    <div>
      <p class="footer-title">পেমেন্ট</p>
      <span class="cod-chip"><i class="fa-solid fa-money-bill-wave" aria-hidden="true"></i> ক্যাশ অন ডেলিভারি</span>
      <span class="muted small">ঢাকার ভিতরে <?= money(setting('delivery_inside')) ?> • ঢাকার বাইরে <?= money(setting('delivery_outside')) ?></span>
    </div>
  </div>
  <p class="footer-copy">© <?= bn_digits(date('Y')) ?> <?= e(setting('store_name')) ?>। সর্বস্বত্ব সংরক্ষিত।</p>
</footer>
