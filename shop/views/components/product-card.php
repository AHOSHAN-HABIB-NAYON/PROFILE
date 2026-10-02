<?php
/** @var array $p  Optional: $flash (bool) shows a limited-stock bar, $lazy (bool). */
$url = '/product/' . rawurlencode($p['slug']);
$availableSizes = array_column(array_filter($p['sizes'], static fn ($s) => $s['available']), 'size');
?>
<article class="pcard" data-product-id="<?= (int) $p['id'] ?>">
  <a href="<?= e($url) ?>" class="pcard-media" data-track-click="<?= (int) $p['id'] ?>" aria-label="<?= e($p['name']) ?>">
    <?= picture($p['image'], $p['name'], 400, 400, 'pcard-img', ($lazy ?? true)) ?>
    <?php if ($p['discount_pct']): ?><span class="badge-off">-<?= bn_num($p['discount_pct']) ?>%</span><?php endif; ?>
    <?php if ($p['flash_active'] && empty($flash)): ?><span class="badge-flash"><i class="fa fa-bolt"></i></span><?php endif; ?>
    <?php if ($p['free_delivery']): ?><span class="badge-free"><i class="fa fa-truck"></i> ফ্রি ডেলিভারি</span><?php endif; ?>
    <?php if ($p['stock_status'] === 'out'): ?><span class="pcard-out">স্টক আউট</span><?php endif; ?>
  </a>
  <div class="pcard-body">
    <a href="<?= e($url) ?>" class="pcard-name" data-track-click="<?= (int) $p['id'] ?>"><?= e($p['name']) ?></a>
    <div class="price-row">
      <span class="price"><?= money($p['effective_price']) ?></span>
      <?php if ($p['compare_price']): ?><del class="old-price"><?= money($p['compare_price']) ?></del><?php endif; ?>
    </div>
    <?php if (!empty($flash) && $p['stock'] > 0): $pct = max(8, min(100, (int) round($p['sold'] / max(1, $p['sold'] + $p['stock']) * 100))); ?>
      <div class="stock-bar" title="বিক্রি হয়েছে <?= bn_num($pct) ?>%"><span style="width:<?= $pct ?>%"></span></div>
      <span class="stock-left">মাত্র <?= bn_num($p['stock']) ?>টি বাকি</span>
    <?php else: ?>
    <div class="pcard-meta">
      <?php if ($p['stock_status'] === 'in'): ?><span class="stock in"><i class="dot"></i>স্টকে আছে</span>
      <?php elseif ($p['stock_status'] === 'low'): ?><span class="stock low"><i class="dot"></i>সীমিত স্টক</span>
      <?php else: ?><span class="stock out"><i class="dot"></i>স্টকে নেই</span><?php endif; ?>
    </div>
    <?php endif; ?>
    <?php if ($availableSizes): ?><div class="sizes-mini" title="সাইজ"><?= e(implode(' · ', array_slice($availableSizes, 0, 5))) ?></div><?php endif; ?>
    <div class="pcard-actions">
    <?php if ($p['stock_status'] === 'out'): ?>
      <button class="btn btn-muted btn-card grow" disabled>স্টকে নেই</button>
    <?php elseif ($p['sizes']): ?>
      <a href="<?= e($url) ?>" class="btn btn-primary btn-card grow">অর্ডার করুন</a>
      <a href="<?= e($url) ?>" class="btn btn-outline btn-card-icon" aria-label="সাইজ নির্বাচন করে কার্টে যোগ করুন"><i class="fa fa-cart-plus"></i></a>
    <?php else: ?>
      <button type="button" class="btn btn-primary btn-card grow" data-add-cart="<?= (int) $p['id'] ?>" data-buy-now>অর্ডার করুন</button>
      <button type="button" class="btn btn-outline btn-card-icon" data-add-cart="<?= (int) $p['id'] ?>" aria-label="কার্টে যোগ করুন"><i class="fa fa-cart-plus"></i></button>
    <?php endif; ?>
    </div>
  </div>
</article>
