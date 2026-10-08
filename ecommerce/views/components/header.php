<?php
/**
 * Persistent storefront header (never re-rendered during navigation).
 */
$logo = setting('logo');
?>
<header class="header" id="header">
  <div class="header-inner">
    <button type="button" class="icon-btn header-menu" data-action="drawer-open" aria-label="মেনু খুলুন" aria-controls="sidebar" aria-expanded="false">
      <i class="fa-solid fa-bars-staggered" aria-hidden="true"></i>
    </button>
    <a href="<?= e(url('/')) ?>" class="brand" aria-label="<?= e(setting('store_name')) ?> হোম">
      <?php if ($logo): ?>
        <img src="<?= e(upload_url($logo)) ?>" alt="<?= e(setting('store_name')) ?>" class="brand-logo" height="36" width="120" decoding="async">
      <?php else: ?>
        <span class="brand-mark"><i class="fa-solid fa-bag-shopping" aria-hidden="true"></i></span>
        <span class="brand-name"><?= e(setting('store_name')) ?></span>
      <?php endif; ?>
    </a>

    <form class="search" action="<?= e(url('/search')) ?>" method="get" role="search" data-search>
      <label for="search-input" class="sr-only">পণ্য খুঁজুন</label>
      <i class="fa-solid fa-magnifying-glass search-icon" aria-hidden="true"></i>
      <input id="search-input" type="search" name="q" placeholder="পণ্য খুঁজুন…" autocomplete="off" enterkeyhint="search" maxlength="80"
             aria-autocomplete="list" aria-controls="search-results" aria-expanded="false">
      <button type="button" class="icon-btn search-close" data-action="search-close" aria-label="সার্চ বন্ধ করুন"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
      <div class="search-results" id="search-results" role="listbox" hidden></div>
    </form>

    <div class="header-actions">
      <button type="button" class="icon-btn header-search-btn" data-action="search-open" aria-label="সার্চ"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i></button>
      <?php if (setting('dark_mode_enabled') === '1'): ?>
      <button type="button" class="icon-btn hide-mobile" data-action="theme-toggle" aria-label="ডার্ক মোড পরিবর্তন"><i class="fa-solid fa-moon" aria-hidden="true"></i></button>
      <?php endif; ?>
      <a href="<?= e(url('/orders')) ?>" class="icon-btn hide-mobile" aria-label="আমার অর্ডার"><i class="fa-solid fa-receipt" aria-hidden="true"></i></a>
      <a href="<?= e(url('/cart')) ?>" class="icon-btn cart-btn" aria-label="কার্ট" data-cart-icon>
        <i class="fa-solid fa-cart-shopping" aria-hidden="true"></i>
        <span class="badge-count" data-cart-count hidden>0</span>
      </a>
    </div>
  </div>
</header>
