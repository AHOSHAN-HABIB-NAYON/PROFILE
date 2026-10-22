<?php use OryzenX\Core\View; /** @var callable $e */ $other = $locale === 'bn' ? 'en' : 'bn'; ?>
<footer class="site-footer">
  <div class="container footer-grid">
    <div class="footer-brand">
      <?php include __DIR__ . '/../partials/logo.php'; ?>
      <p class="muted"><?= $e($t['footer_tagline']) ?></p>
      <p class="subtle small"><?= $e($t['footer_risk_short']) ?></p>
    </div>
    <nav aria-label="<?= $e($t['footer_legal']) ?>">
      <h2 class="footer-h"><?= $e($t['footer_legal']) ?></h2>
      <ul>
        <li><a href="<?= $e(View::url('privacy')) ?>"><?= $e($t['footer_privacy']) ?></a></li>
        <li><a href="<?= $e(View::url('terms')) ?>"><?= $e($t['footer_terms']) ?></a></li>
        <li><a href="<?= $e(View::url('risk')) ?>"><?= $e($t['footer_risk']) ?></a></li>
        <li><a href="<?= $e(View::url('') . '#support') ?>"><?= $e($t['footer_contact']) ?></a></li>
      </ul>
    </nav>
    <div>
      <h2 class="footer-h"><?= $e($t['lang_switch']) ?></h2>
      <ul class="footer-lang">
        <li><a href="?lang=en" hreflang="en" lang="en"<?= $locale === 'en' ? ' aria-current="true"' : '' ?>>English</a></li>
        <li><a href="?lang=bn" hreflang="bn" lang="bn"<?= $locale === 'bn' ? ' aria-current="true"' : '' ?>>বাংলা</a></li>
      </ul>
    </div>
  </div>
  <div class="container footer-bottom">
    <p class="subtle small"><?= $e(str_replace(':year', $locale === 'bn' ? strtr(gmdate('Y'), ['0' => '০', '1' => '১', '2' => '২', '3' => '৩', '4' => '৪', '5' => '৫', '6' => '৬', '7' => '৭', '8' => '৮', '9' => '৯']) : gmdate('Y'), $t['footer_copyright'])) ?></p>
  </div>
</footer>
