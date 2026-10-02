<?php /** Home page sections are switched on/off from Admin → Settings → Homepage. */ ?>
<div class="page container" data-page="home">
<?php if ($banners): ?>
  <section class="hero" aria-label="অফার ব্যানার">
    <div class="slider" data-slider>
      <div class="slides">
        <?php foreach ($banners as $i => $b): ?>
        <div class="slide" aria-roledescription="slide">
          <?php $img = picture($b['image'], $b['title'] ?: setting('site_name'), (int) $b['width'], (int) $b['height'], 'slide-img', $i > 0, 'md'); ?>
          <?php if ($b['link']): ?><a href="<?= e($b['link']) ?>"><?= $img ?></a><?php else: ?><?= $img ?><?php endif; ?>
          <?php if ($b['title'] || $b['cta_text']): ?>
          <div class="slide-cap">
            <?php if ($b['title']): ?><strong><?= e($b['title']) ?></strong><?php endif; ?>
            <?php if ($b['subtitle']): ?><span><?= e($b['subtitle']) ?></span><?php endif; ?>
            <?php if ($b['cta_text'] && $b['link']): ?><a href="<?= e($b['link']) ?>" class="btn btn-light btn-xs"><?= e($b['cta_text']) ?></a><?php endif; ?>
          </div>
          <?php endif; ?>
        </div>
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
      <?php foreach ($categories as $c): ?>
      <a href="/category/<?= e(rawurlencode($c['slug'])) ?>" class="cat-chip">
        <span class="cat-icon"><?php if ($c['icon_type'] === 'image' && $c['image']): ?><img src="/<?= e($c['image']) ?>" alt="" width="28" height="28" loading="lazy"><?php else: ?><i class="fa fa-<?= e($c['icon'] ?: 'tag') ?>"></i><?php endif; ?></span>
        <span class="cat-name"><?= e($c['name']) ?></span>
      </a>
      <?php endforeach; ?>
    </div>
  </section>
<?php endif; ?>

<?php if ($coupon): ?>
  <section class="coupon-banner">
    <div><span class="small">বিশেষ অফার</span>
      <strong><?= $coupon['type'] === 'percent' ? bn_num((float) $coupon['value']) . '% ছাড়' : money($coupon['value']) . ' ছাড়' ?></strong>
      <span class="small"><?= (float) $coupon['min_order'] > 0 ? 'সর্বনিম্ন ' . money($coupon['min_order']) . ' অর্ডারে' : 'যেকোনো অর্ডারে' ?><?= $coupon['expires_at'] ? ' · মেয়াদ ' . date('d/m/Y', strtotime($coupon['expires_at'])) : '' ?></span>
    </div>
    <button type="button" class="coupon-code" data-copy="<?= e($coupon['code']) ?>" aria-label="কুপন কোড কপি করুন"><?= e($coupon['code']) ?> <i class="fa fa-clone"></i></button>
  </section>
<?php endif; ?>

<?php if ($flash): ?>
  <section class="section flash-section">
    <?php View::partial('components/section-head', ['title' => 'ফ্ল্যাশ সেল', 'icon' => 'bolt', 'link' => '/products?filter=flash',
        'extra' => $flash_end ? '<span class="countdown" data-countdown="' . (int) $flash_end . '" aria-label="অফার শেষ হতে বাকি"></span>' : '']); ?>
    <div class="hscroll"><?php foreach ($flash as $p) { View::partial('components/product-card', ['p' => $p]); } ?></div>
  </section>
<?php endif; ?>

<?php if ($featured): ?>
  <section class="section">
    <?php View::partial('components/section-head', ['title' => 'ফিচার্ড পণ্য', 'icon' => 'star', 'link' => '/products?filter=featured']); ?>
    <?php View::partial('components/product-grid', ['items' => $featured]); ?>
  </section>
<?php endif; ?>

<?php if ($combos): ?>
  <section class="section" id="combo">
    <?php View::partial('components/section-head', ['title' => 'কম্বো অফার', 'icon' => 'gift']); ?>
    <div class="hscroll combo-scroll"><?php foreach ($combos as $c) { View::partial('components/combo-card', ['c' => $c]); } ?></div>
  </section>
<?php endif; ?>

<?php if ($free): ?>
  <section class="section">
    <?php View::partial('components/section-head', ['title' => 'ফ্রি ডেলিভারি', 'icon' => 'truck', 'link' => '/products?filter=free']); ?>
    <div class="hscroll"><?php foreach ($free as $p) { View::partial('components/product-card', ['p' => $p]); } ?></div>
  </section>
<?php endif; ?>

<?php if ($latest): ?>
  <section class="section">
    <?php View::partial('components/section-head', ['title' => 'নতুন পণ্য', 'link' => '/products']); ?>
    <?php View::partial('components/product-grid', ['items' => $latest, 'lazyFrom' => $featured ? 0 : 4]); ?>
  </section>
<?php endif; ?>

<?php if ($recommended): ?>
  <section class="section">
    <?php View::partial('components/section-head', ['title' => 'আপনার জন্য প্রস্তাবিত', 'icon' => 'thumbs-o-up', 'link' => '/products?sort=popular']); ?>
    <div class="hscroll"><?php foreach ($recommended as $p) { View::partial('components/product-card', ['p' => $p]); } ?></div>
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
