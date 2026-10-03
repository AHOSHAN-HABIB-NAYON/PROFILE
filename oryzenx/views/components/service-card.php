<?php /** @var array $s */ ?>
<a class="svc-card card card-link" href="<?= e(url('/services/' . $s['slug'])) ?>"
   data-filter-item data-cat="<?= e($s['cat_slug'] ?? '') ?>" data-text="<?= e(mb_strtolower($s['title'] . ' ' . $s['title_bn'] . ' ' . $s['short_desc'] . ' ' . $s['slug'])) ?>">
    <div class="svc-top">
        <span class="ic-box" style="--c:<?= e($s['icon_color'] ?: 'var(--primary)') ?>"><?= icon_html($s['icon'], $s['icon_image']) ?></span>
        <?php if ($s['is_vip']): ?><span class="badge badge-vip">VIP</span><?php elseif ($s['is_featured']): ?><span class="badge badge-warning"><i class="fa-solid fa-star"></i> <?= e(t('services.featured')) ?></span><?php endif; ?>
    </div>
    <strong class="svc-title clamp-2"><?= e(tr($s, 'title')) ?></strong>
    <span class="svc-desc muted clamp-2"><?= e(tr($s, 'short_desc')) ?></span>
    <span class="svc-foot">
        <span class="svc-price"><?= money($s['price'], $s['currency'], (bool)$s['price_plus']) ?>
            <?php if ($s['old_price'] && $s['old_price'] > $s['price']): ?><s class="muted"><?= money($s['old_price'], $s['currency']) ?></s><?php endif; ?></span>
        <i class="fa-solid fa-arrow-right"></i>
    </span>
</a>
