<?php
/**
 * Mobile bottom navigation (hidden on desktop).
 * @var string $nav
 */
$items = [
    ['home', '/', 'fa-solid fa-house', 'হোম'],
    ['categories', '/categories', 'fa-solid fa-table-cells-large', 'ক্যাটাগরি'],
    ['cart', '/cart', 'fa-solid fa-cart-shopping', 'কার্ট'],
    ['orders', '/orders', 'fa-solid fa-receipt', 'অর্ডার'],
    ['profile', '/profile', 'fa-solid fa-user', 'প্রোফাইল'],
];
?>
<nav class="bottom-nav" aria-label="প্রধান নেভিগেশন">
  <div class="bottom-nav-inner">
    <span class="bn-indicator" aria-hidden="true"></span>
    <?php foreach ($items as [$key, $href, $ic, $label]): ?>
      <a href="<?= e(url($href)) ?>" class="bn-item<?= $nav === $key ? ' is-active' : '' ?>" data-nav="<?= e($key) ?>"<?= $nav === $key ? ' aria-current="page"' : '' ?>>
        <span class="bn-icon">
          <i class="<?= e($ic) ?>" aria-hidden="true"></i>
          <?php if ($key === 'cart'): ?><span class="badge-count" data-cart-count hidden>0</span><?php endif; ?>
        </span>
        <span class="bn-label"><?= e($label) ?></span>
      </a>
    <?php endforeach; ?>
  </div>
</nav>
