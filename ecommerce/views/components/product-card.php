<?php
/**
 * Product card.
 * @var array $p hydrated card row (Product::hydrateCards)
 * @var bool  $eager first visible row may load eagerly (LCP)
 */
$eager = $eager ?? false;
$url = Product::url($p);
$img = $p['image_path'] ?? '';
$ext = $p['image_ext'] ?? 'webp';
?>
<article class="pcard">
  <a href="<?= e($url) ?>" class="pcard-media" data-prefetch aria-label="<?= e($p['name']) ?>">
    <img src="<?= e(image_url($img ?: null, 'md', $ext)) ?>"
         <?php if ($img): ?>srcset="<?= e(image_url($img, 'sm', $ext)) ?> 320w, <?= e(image_url($img, 'md', $ext)) ?> 600w" sizes="(max-width: 600px) 46vw, (max-width: 1100px) 30vw, 240px"<?php endif; ?>
         alt="<?= e($p['name']) ?>" width="600" height="600" decoding="async" <?= $eager ? 'fetchpriority="high"' : 'loading="lazy"' ?>>
    <span class="pcard-badges">
      <?php if ($p['discount_percent'] > 0): ?><span class="pbadge pbadge-sale">-<?= num($p['discount_percent']) ?>%</span><?php endif; ?>
      <?php if ((int)$p['is_free_delivery'] === 1): ?><span class="pbadge pbadge-free"><i class="fa-solid fa-truck" aria-hidden="true"></i> ফ্রি</span><?php endif; ?>
      <?php if ((int)$p['is_combo'] === 1): ?><span class="pbadge pbadge-combo">কম্বো</span><?php endif; ?>
    </span>
    <?php if (!$p['in_stock']): ?><span class="pcard-out">স্টক শেষ</span><?php endif; ?>
  </a>
  <div class="pcard-body">
    <h3 class="pcard-title"><a href="<?= e($url) ?>" data-prefetch><?= e($p['name']) ?></a></h3>
    <div class="price-row">
      <span class="price"><?= money($p['price']) ?></span>
      <?php if ($p['discount_percent'] > 0): ?><del class="old-price"><?= money($p['old_price']) ?></del><?php endif; ?>
    </div>
    <?php if (!$p['in_stock']): ?>
      <button type="button" class="btn btn-block btn-muted btn-sm" disabled>স্টক শেষ</button>
    <?php elseif ($p['needs_options']): ?>
      <a href="<?= e($url) ?>" class="btn btn-block btn-primary btn-sm"><i class="fa-solid fa-bag-shopping" aria-hidden="true"></i> অর্ডার করুন</a>
    <?php else: ?>
      <button type="button" class="btn btn-block btn-primary btn-sm" data-action="add-to-cart" data-id="<?= (int)$p['id'] ?>" data-name="<?= e($p['name']) ?>">
        <i class="fa-solid fa-cart-plus" aria-hidden="true"></i> কার্টে যোগ করুন
      </button>
    <?php endif; ?>
  </div>
</article>
