<?php /** @var array $s @var array $features @var array $related @var array $methods */
$discount = ($s['old_price'] && $s['old_price'] > $s['price']) ? (int)round(100 - $s['price'] / $s['old_price'] * 100) : 0;
$bdt = $s['currency'] === 'USD' && (float)setting('usd_to_bdt') > 0 ? (float)$s['price'] * (float)setting('usd_to_bdt') : 0;
?>
<a class="back-link" href="<?= e(url('/services')) ?>"><i class="fa-solid fa-arrow-left"></i> <?= e(t('services.title')) ?></a>
<div class="svc-detail">
    <div class="stack">
        <section class="card">
            <div class="row">
                <?= svc_logo($s, 'lg') ?>
                <div class="grow">
                    <?php if ($s['cat_name']): ?><a class="xs muted" href="<?= e(url('/services?cat=' . $s['cat_slug'])) ?>"><?= e(tr($s, 'cat_name')) ?></a><?php endif; ?>
                    <h1 class="svc-h1"><?= e(tr($s, 'title')) ?></h1>
                </div>
            </div>
            <p class="muted small mt-1"><?= e(tr($s, 'short_desc')) ?></p>
            <div class="price-row">
                <span class="price-big"><?= money($s['price'], $s['currency'], (bool)$s['price_plus']) ?></span>
                <?php if ($discount): ?><s class="muted small"><?= money($s['old_price'], $s['currency']) ?></s><span class="badge badge-danger">-<?= num($discount) ?>%</span><?php endif; ?>
                <?php if ($s['is_featured']): ?><span class="badge badge-warning"><i class="fa-solid fa-star"></i> <?= e(t('services.featured')) ?></span><?php endif; ?>
                <?php if ($s['is_vip']): ?><span class="badge badge-vip">VIP</span><?php endif; ?>
            </div>
            <?php if ($bdt): ?><p class="xs muted mb-0">≈ <?= money(round($bdt), 'BDT') ?> <?= e(t('services.approx')) ?></p><?php endif; ?>
        </section>

        <?php if ($features): ?>
        <section class="card">
            <h2 class="card-title mb-1"><?= e(t('services.includes')) ?></h2>
            <ul class="feature-list">
                <?php foreach ($features as $f): ?><li><i class="fa-solid fa-circle-check"></i><?= e(tr($f, 'feature')) ?></li><?php endforeach; ?>
            </ul>
        </section>
        <?php endif; ?>

        <?php if (trim(strip_tags((string)$s['description'])) !== ''): ?>
        <section class="card">
            <h2 class="card-title mb-1"><?= e(t('services.details')) ?></h2>
            <div class="prose"><?= emoji_fx((string)$s['description']) ?></div>
        </section>
        <?php endif; ?>
    </div>

    <aside class="stack svc-aside">
        <section class="card buy-card">
            <div class="kv">
                <dt><i class="fa-regular fa-clock"></i> <?= e(t('services.delivery')) ?></dt><dd><?= e(num($s['delivery_days'] ?: '—')) ?> <?= e(t('services.days')) ?></dd>
                <dt><i class="fa-solid fa-headset"></i> <?= e(t('services.support')) ?></dt><dd><?= e(num($s['support_days'] ?: '—')) ?> <?= e(t('services.days')) ?></dd>
            </div>
            <a class="btn btn-primary btn-block mt-2" href="<?= e(url('/payment/' . $s['slug'])) ?>"><i class="fa-solid fa-bag-shopping"></i> <?= e(t('services.buy')) ?></a>
            <div class="row-gap mt-1">
                <a class="btn btn-sm btn-outline grow" href="<?= e(url('/contact?subject=' . rawurlencode(tr($s, 'title')))) ?>"><i class="fa-regular fa-comment"></i> <?= e(t('services.ask')) ?></a>
                <button class="btn btn-sm btn-outline" type="button" data-action="share" data-share-url="<?= e(abs_url(url('/services/' . $s['slug']))) ?>" data-share-title="<?= e(tr($s, 'title')) ?>" aria-label="<?= e(t('news.share')) ?>"><i class="fa-solid fa-share-nodes"></i></button>
            </div>
            <?php if ($methods): ?>
                <div class="pay-mini mt-1"><?php foreach ($methods as $m): ?><img src="<?= e(Content::media($m['logo'])) ?>" alt="<?= e($m['name']) ?>" title="<?= e($m['name']) ?>" width="22" height="22" loading="lazy"><?php endforeach; ?></div>
            <?php endif; ?>
        </section>
        <?php if ($related): ?>
        <section class="card">
            <h2 class="card-title mb-1"><?= e(t('services.related')) ?></h2>
            <div class="list">
                <?php foreach ($related as $r): ?>
                    <a class="list-item" href="<?= e(url('/services/' . $r['slug'])) ?>">
                        <?= svc_logo($r, 'sm') ?>
                        <span class="title truncate grow"><?= e(tr($r, 'title')) ?></span>
                        <span class="meta text-primary bold"><?= money($r['price'], $r['currency'], (bool)$r['price_plus']) ?></span>
                    </a>
                <?php endforeach; ?>
            </div>
        </section>
        <?php endif; ?>
    </aside>
</div>
