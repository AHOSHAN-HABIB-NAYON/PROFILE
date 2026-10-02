<?php /** Home page sections are switched on/off from Admin → Settings → Homepage. */ ?>
<div class="page container" data-page="home">
<button type="button" class="search-pill" data-open-search><i class="fa fa-search"></i><span>কী খুঁজছেন? পণ্যের নাম লিখুন…</span></button>

<?php if ($banners): ?>
  <section class="hero" aria-label="অফার ব্যানার">
    <div class="slider" data-slider>
      <div class="slides">
        <?php foreach ($banners as $i => $b): $hasText = $b['title'] || $b['subtitle'] || $b['cta_text']; $tag = $b['link'] ? 'a' : 'div'; ?>
        <<?= $tag ?> class="slide<?= $hasText ? ' hero-card' : '' ?>"<?= $b['link'] ? ' href="' . e($b['link']) . '"' : '' ?> aria-roledescription="slide">
          <?php if ($hasText): ?>
            <div class="hero-text">
              <?php if ($b['title']): ?><strong class="hero-title"><?= e($b['title']) ?></strong><?php endif; ?>
              <?php if ($b['subtitle']): ?><span class="hero-sub"><?= e($b['subtitle']) ?></span><?php endif; ?>
              <?php if ($b['cta_text']): ?><span class="btn btn-dark-green btn-xs"><?= e($b['cta_text']) ?></span><?php endif; ?>
            </div>
            <div class="hero-img"><?= picture($b['image'], $b['title'] ?: setting('site_name'), (int) $b['width'], (int) $b['height'], 'slide-img', $i > 0, 'md') ?></div>
          <?php else: ?>
            <?= picture($b['image'], setting('site_name'), (int) $b['width'], (int) $b['height'], 'slide-img full', $i > 0, 'md') ?>
          <?php endif; ?>
        </<?= $tag ?>>
        <?php endforeach; ?>
      </div>
      <?php if (count($banners) > 1): ?>
      <div class="dots" role="tablist"><?php foreach ($banners as $i => $b): ?><button type="button" aria-label="ব্যানার <?= bn_num($i + 1) ?>"<?= $i === 0 ? ' class="active"' : '' ?>></button><?php endforeach; ?></div>
      <?php endif; ?>
    </div>
  </section>
<?php endif; ?>

<?php if ($categories): ?>
  <section class="section">
    <?php View::partial('components/section-head', ['title' => 'ক্যাটাগরি', 'link' => '/categories']); ?>
    <div class="cat-scroll">
      <?php foreach ($categories as $c) { View::partial('components/category-tile', ['c' => $c]); } ?>
    </div>
  </section>
<?php endif; ?>

<?php if ($coupon): ?>
  <section class="promo-coupon">
    <span class="promo-ic"><i class="fa fa-gift"></i></span>
    <div class="grow">
      <span class="promo-kicker">বিশেষ অফার</span>
      <strong class="promo-amount"><?= $coupon['type'] === 'percent' ? bn_num((float) $coupon['value']) . '% ছাড়' : money($coupon['value']) . ' ছাড়' ?></strong>
      <span class="promo-note"><?= (float) $coupon['min_order'] > 0 ? money($coupon['min_order']) . '+ অর্ডারে' : 'যেকোনো অর্ডারে' ?><?= $coupon['expires_at'] ? ' · ' . date('d/m', strtotime($coupon['expires_at'])) . ' পর্যন্ত' : '' ?></span>
    </div>
    <div class="promo-code-box">
      <code><?= e($coupon['code']) ?></code>
      <button type="button" class="btn btn-light btn-copy" data-copy="<?= e($coupon['code']) ?>"><i class="fa fa-clone"></i> কপি করুন</button>
    </div>
  </section>
<?php endif; ?>

<?php if ($flash): ?>
  <section class="section flash-section">
    <div class="flash-head">
      <h2 class="section-title"><i class="fa fa-bolt"></i> ফ্ল্যাশ সেল</h2>
      <?php if ($flash_end): ?><span class="countdown" data-countdown="<?= (int) $flash_end ?>" aria-label="অফার শেষ হতে বাকি"></span><?php endif; ?>
      <a href="/products?filter=flash" class="see-all">সব দেখুন <i class="fa fa-angle-right"></i></a>
    </div>
    <?php View::partial('components/product-grid', ['items' => $flash, 'flash' => true, 'lazyFrom' => 2]); ?>
  </section>
<?php endif; ?>

<?php if ($featured): ?>
  <section class="section">
    <?php View::partial('components/section-head', ['title' => 'ফিচার্ড পণ্য', 'icon' => 'star', 'link' => '/products?filter=featured']); ?>
    <?php View::partial('components/product-grid', ['items' => $featured, 'lazyFrom' => 2]); ?>
  </section>
<?php endif; ?>

<?php if ($free): ?>
  <section class="section">
    <a href="/products?filter=free" class="free-strip">
      <span class="free-ic"><i class="fa fa-truck"></i></span>
      <span class="grow"><strong>ফ্রি ডেলিভারি</strong><span>এই পণ্যগুলোতে সারা দেশে কোনো ডেলিভারি চার্জ নেই</span></span>
      <i class="fa fa-angle-right"></i>
    </a>
    <?php View::partial('components/product-grid', ['items' => $free]); ?>
  </section>
<?php endif; ?>

<?php if ($combos): ?>
  <section class="section" id="combo">
    <?php View::partial('components/section-head', ['title' => 'কম্বো অফার', 'icon' => 'gift']); ?>
    <div class="combo-list<?= count($combos) === 1 ? ' is-single' : '' ?>"><?php foreach ($combos as $c) { View::partial('components/combo-card', ['c' => $c]); } ?></div>
  </section>
<?php endif; ?>

<?php if ($latest): ?>
  <section class="section">
    <?php View::partial('components/section-head', ['title' => 'নতুন পণ্য', 'icon' => 'th-large', 'link' => '/products']); ?>
    <?php View::partial('components/product-grid', ['items' => $latest]); ?>
  </section>
<?php endif; ?>

<?php if ($recommended): ?>
  <section class="section">
    <?php View::partial('components/section-head', ['title' => 'আপনার জন্য প্রস্তাবিত', 'icon' => 'thumbs-o-up', 'link' => '/products?sort=popular']); ?>
    <?php View::partial('components/product-grid', ['items' => $recommended]); ?>
  </section>
<?php endif; ?>

<?php if (!$latest && !$featured && !$flash && !$categories): ?>
  <?php View::partial('components/empty', ['icon' => 'shopping-bag', 'title' => 'শীঘ্রই নতুন পণ্য আসছে', 'text' => 'আমাদের সাথেই থাকুন।']); ?>
<?php endif; ?>

<?php if (Settings::on('home_info')): ?>
  <section class="info-grid">
    <div class="info-card"><i class="fa fa-money"></i><div><strong>ক্যাশ অন ডেলিভারি</strong><span><?= e(setting('cod_info')) ?></span></div></div>
    <div class="info-card"><i class="fa fa-truck"></i><div><strong>দ্রুত ডেলিভারি</strong><span><?= e(setting('delivery_info')) ?></span></div></div>
    <div class="info-card"><i class="fa fa-headphones"></i><div><strong>সাপোর্ট</strong><span><?= e(setting('business_hours')) ?> · <a href="/contact">যোগাযোগ</a></span></div></div>
  </section>
<?php endif; ?>
</div>
