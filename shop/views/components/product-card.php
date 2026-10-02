<?php /** @var array $p */ $url = '/product/' . rawurlencode($p['slug']); ?>
<article class="pcard" data-product-id="<?= (int) $p['id'] ?>">
  <a href="<?= e($url) ?>" class="pcard-media" data-track-click="<?= (int) $p['id'] ?>">
    <?= picture($p['image'], $p['name'], 400, 400, 'pcard-img', ($lazy ?? true)) ?>
    <?php if ($p['free_delivery']): ?><span class="tag tag-free"><i class="fa fa-truck"></i> ফ্রি ডেলিভারি</span>
    <?php elseif ($p['flash_active']): ?><span class="tag tag-flash"><i class="fa fa-bolt"></i> ফ্ল্যাশ</span><?php endif; ?>
    <?php if ($p['stock_status'] === 'out'): ?><span class="pcard-out">স্টক আউট</span><?php endif; ?>
  </a>
  <div class="pcard-body">
    <a href="<?= e($url) ?>" class="pcard-name" data-track-click="<?= (int) $p['id'] ?>"><?= e($p['name']) ?></a>
    <div class="price-row">
      <span class="price"><?= money($p['effective_price']) ?></span>
      <?php if ($p['compare_price']): ?><del class="old-price"><?= money($p['compare_price']) ?></del><?php endif; ?>
    </div>
    <div class="pcard-meta">
      <?php if ($p['discount_pct']): ?><span class="off-pill"><?= bn_num($p['discount_pct']) ?>% ছাড়</span><?php endif; ?>
      <?php if ($p['stock_status'] === 'low'): ?><span class="stock low">সীমিত স্টক</span><?php endif; ?>
      <?php if ($p['sizes']): ?><span class="sizes-mini" title="সাইজ"><?= e(implode(' · ', array_slice(array_column(array_filter($p['sizes'], static fn ($s) => $s['available']), 'size'), 0, 4))) ?></span><?php endif; ?>
    </div>
    <div class="pcard-actions">
    <?php if ($p['stock_status'] === 'out'): ?>
      <button class="btn btn-muted btn-xs grow" disabled>স্টকে নেই</button>
    <?php elseif ($p['sizes']): ?>
      <a href="<?= e($url) ?>" class="btn btn-primary btn-xs grow">অর্ডার করুন</a>
      <a href="<?= e($url) ?>" class="btn btn-outline btn-xs btn-icon" aria-label="সাইজ নির্বাচন করে কার্টে যোগ করুন"><i class="fa fa-cart-plus"></i></a>
    <?php else: ?>
      <button type="button" class="btn btn-primary btn-xs grow" data-add-cart="<?= (int) $p['id'] ?>" data-buy-now>অর্ডার করুন</button>
      <button type="button" class="btn btn-outline btn-xs btn-icon" data-add-cart="<?= (int) $p['id'] ?>" aria-label="কার্টে যোগ করুন"><i class="fa fa-cart-plus"></i></button>
    <?php endif; ?>
    </div>
  </div>
</article>
