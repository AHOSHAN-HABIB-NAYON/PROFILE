<?php
/** Visitor shell: sticky header + content + footer. */
$siteName = (string) setting('site_name', 'Probaho');
$nav = ['/' => 'হোম', '/services' => 'সার্ভিস', '/products' => 'প্রোডাক্ট', '/support' => 'সাপোর্ট', '/faq' => 'FAQ'];
$tg = setting('support.telegram_enabled') == 1 ? (string) setting('support.telegram_url') : '';
$wa = setting('support.whatsapp_enabled') == 1 ? (string) setting('support.whatsapp_url') : '';
?>
<header class="site-header">
  <div class="container header-row">
    <a href="<?= e(url('/')) ?>" class="brand" data-link aria-label="<?= e($siteName) ?>">
      <img src="<?= e(brand_logo()) ?>" alt="" width="34" height="34" class="brand-logo">
      <span class="brand-name"><?= e($siteName) ?></span>
    </a>
    <nav class="header-nav" aria-label="প্রধান মেনু">
      <?php foreach ($nav as $href => $label): ?>
        <a href="<?= e(url($href)) ?>" data-link data-nav="<?= e(trim($href, '/') ?: 'home') ?>"><?= e($label) ?></a>
      <?php endforeach; ?>
    </nav>
    <div class="header-actions">
      <button type="button" class="icon-btn" data-action="theme-cycle" aria-label="থিম পরিবর্তন"><?= icon('sun', 'theme-ic-light') ?><?= icon('moon', 'theme-ic-dark') ?></button>
      <a href="<?= e(url('/login')) ?>" class="btn btn-ghost btn-sm hide-sm" data-link>লগইন</a>
      <?php if (setting_on('auth_registration')): ?><a href="<?= e(url('/register')) ?>" class="btn btn-primary btn-sm hide-sm" data-link>অ্যাকাউন্ট খুলুন</a><?php endif; ?>
      <button type="button" class="icon-btn show-sm" data-action="menu" aria-label="মেনু"><?= icon('menu') ?></button>
    </div>
  </div>
</header>
<div class="mobile-menu" id="mobile-menu" hidden>
  <div class="mobile-menu-panel">
    <?php foreach ($nav as $href => $label): ?>
      <a href="<?= e(url($href)) ?>" data-link><?= e($label) ?><?= icon('chevron-right') ?></a>
    <?php endforeach; ?>
    <div class="mobile-menu-cta">
      <a href="<?= e(url('/login')) ?>" class="btn btn-ghost btn-block" data-link>লগইন করুন</a>
      <?php if (setting_on('auth_registration')): ?><a href="<?= e(url('/register')) ?>" class="btn btn-primary btn-block" data-link>অ্যাকাউন্ট তৈরি করুন</a><?php endif; ?>
    </div>
  </div>
</div>
<main class="site-main"><?= $content ?></main>
<footer class="site-footer">
  <div class="container footer-grid">
    <div class="footer-brand">
      <a href="<?= e(url('/')) ?>" class="brand" data-link><img src="<?= e(brand_logo()) ?>" alt="" width="32" height="32" class="brand-logo"><span class="brand-name"><?= e($siteName) ?></span></a>
      <p><?= e(setting('footer_text')) ?></p>
      <div class="footer-social">
        <?php if ($tg): ?><a href="<?= e($tg) ?>" target="_blank" rel="noopener" class="social tg" aria-label="Telegram"><?= icon('telegram') ?></a><?php endif; ?>
        <?php if ($wa): ?><a href="<?= e($wa) ?>" target="_blank" rel="noopener" class="social wa" aria-label="WhatsApp"><?= icon('whatsapp') ?></a><?php endif; ?>
        <?php if (setting('contact_email') !== ''): ?><a href="mailto:<?= e(setting('contact_email')) ?>" class="social" aria-label="Email"><?= icon('mail') ?></a><?php endif; ?>
      </div>
    </div>
    <div>
      <h4>সার্ভিস</h4>
      <?php foreach (db()->all('SELECT slug, title FROM services WHERE is_active = 1 ORDER BY sort_order LIMIT 5') as $s): ?>
        <a href="<?= e(url('/services/' . $s['slug'])) ?>" data-link><?= e($s['title']) ?></a>
      <?php endforeach; ?>
    </div>
    <div>
      <h4>প্রতিষ্ঠান</h4>
      <a href="<?= e(url('/about')) ?>" data-link>আমাদের সম্পর্কে</a>
      <a href="<?= e(url('/products')) ?>" data-link>প্রোডাক্ট ও আপডেট</a>
      <a href="<?= e(url('/faq')) ?>" data-link>FAQ</a>
      <a href="<?= e(url('/contact')) ?>" data-link>যোগাযোগ</a>
    </div>
    <div>
      <h4>সহায়তা</h4>
      <a href="<?= e(url('/support')) ?>" data-link>সাপোর্ট</a>
      <a href="<?= e(url('/report')) ?>" data-link>রিপোর্ট করুন</a>
      <a href="<?= e(url('/privacy')) ?>" data-link>গোপনীয়তা নীতি</a>
      <a href="<?= e(url('/terms')) ?>" data-link>শর্তাবলী</a>
    </div>
  </div>
  <div class="container footer-bottom">
    <span>© <?= bn_digits(date('Y')) ?> <?= e($siteName) ?>. সর্বস্বত্ব সংরক্ষিত।</span>
    <span class="muted">Binance Pay শুধুমাত্র একটি পেমেন্ট মেথড হিসেবে ব্যবহৃত।</span>
  </div>
</footer>
