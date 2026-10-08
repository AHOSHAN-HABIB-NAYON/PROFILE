<?php
/**
 * Desktop sidebar / mobile slide-in drawer.
 * @var string $nav active nav key
 */
$links = [
    ['home', '/', 'fa-solid fa-house', 'হোম'],
    ['categories', '/categories', 'fa-solid fa-table-cells-large', 'ক্যাটাগরি'],
    ['cart', '/cart', 'fa-solid fa-cart-shopping', 'কার্ট'],
    ['orders', '/orders', 'fa-solid fa-receipt', 'আমার অর্ডার'],
    ['profile', '/profile', 'fa-solid fa-user', 'প্রোফাইল'],
];
$offers = [
    ['/products?type=flash', 'fa-solid fa-bolt', 'ফ্ল্যাশ সেল'],
    ['/products?type=combo', 'fa-solid fa-layer-group', 'কম্বো অফার'],
    ['/products?type=free', 'fa-solid fa-truck', 'ফ্রি ডেলিভারি'],
];
$cats = Category::topLevel();
?>
<div class="drawer-backdrop" data-action="drawer-close" hidden></div>
<aside class="sidebar" id="sidebar" aria-label="সাইট নেভিগেশন">
  <div class="sidebar-head">
    <span class="sidebar-title"><?= e(setting('store_name')) ?></span>
    <button type="button" class="icon-btn" data-action="drawer-close" aria-label="মেনু বন্ধ করুন"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
  </div>
  <nav class="side-nav">
    <?php foreach ($links as [$key, $href, $ic, $label]): ?>
      <a href="<?= e(url($href)) ?>" class="side-link<?= $nav === $key ? ' is-active' : '' ?>" data-nav="<?= e($key) ?>"<?= $nav === $key ? ' aria-current="page"' : '' ?>>
        <i class="<?= e($ic) ?>" aria-hidden="true"></i><span><?= e($label) ?></span>
      </a>
    <?php endforeach; ?>
  </nav>
  <div class="side-section">
    <p class="side-label">অফার</p>
    <?php foreach ($offers as [$href, $ic, $label]): ?>
      <a href="<?= e(url($href)) ?>" class="side-link"><i class="<?= e($ic) ?>" aria-hidden="true"></i><span><?= e($label) ?></span></a>
    <?php endforeach; ?>
  </div>
  <?php if ($cats): ?>
  <div class="side-section">
    <p class="side-label">ক্যাটাগরি</p>
    <?php foreach (array_slice($cats, 0, 14) as $c): ?>
      <a href="<?= e(url('/category/' . $c['slug'])) ?>" class="side-link side-cat">
        <span class="side-cat-icon"><?= Category::iconHtml($c) ?></span><span><?= e($c['name']) ?></span>
      </a>
    <?php endforeach; ?>
  </div>
  <?php endif; ?>
  <?php if (setting('dark_mode_enabled') === '1'): ?>
  <div class="side-section">
    <button type="button" class="side-link side-btn" data-action="theme-toggle"><i class="fa-solid fa-circle-half-stroke" aria-hidden="true"></i><span>ডার্ক / লাইট মোড</span></button>
  </div>
  <?php endif; ?>
</aside>
