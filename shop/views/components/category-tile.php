<?php /** @var array $c  Uses the uploaded icon, else a product photo from the category, else a Font Awesome icon. */ ?>
<a href="/category/<?= e(rawurlencode($c['slug'])) ?>" class="<?= e($class ?? 'cat-chip') ?>">
  <span class="cat-thumb<?= $c['icon_type'] === 'image' && $c['image'] ? ' is-icon' : '' ?>">
    <?php if ($c['icon_type'] === 'image' && $c['image']): ?><img src="/<?= e($c['image']) ?>" alt="" width="40" height="40" loading="lazy">
    <?php elseif (!empty($c['cover'])): ?><img src="<?= e(img_url($c['cover'], 'sm')) ?>" alt="" width="120" height="120" loading="lazy">
    <?php else: ?><i class="fa fa-<?= e($c['icon'] ?: 'tag') ?>"></i><?php endif; ?>
  </span>
  <span class="cat-name"><?= e($c['name']) ?></span>
  <?php if (($class ?? '') === 'cat-tile'): ?><span class="tiny muted"><?= bn_num($c['product_count']) ?>টি পণ্য</span><?php endif; ?>
</a>
