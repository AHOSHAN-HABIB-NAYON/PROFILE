<?php
/** Services catalogue with instant search, category filters and sorting. */
defined('APP') || exit;

$cats = rows('SELECT * FROM service_categories WHERE status = 1 ORDER BY sort, id');
$services = rows('SELECT s.*, c.slug AS cat_slug, c.name_en AS cat_en, c.name_bn AS cat_bn,
                  (SELECT MIN(p.price_usd * (1 - p.discount_percent / 100)) FROM products p WHERE p.service_id = s.id AND p.status = 1) AS min_product
                  FROM services s LEFT JOIN service_categories c ON c.id = s.category_id WHERE s.status = 1 ORDER BY s.sort, s.id');
meta([
    'title' => t('services.title'),
    'description' => t('services.meta_description', ['site' => setting('site_name')]),
    'track_type' => 'services',
    'schema' => [breadcrumb_schema([t('nav.home') => '/', t('services.title') => '/services'])],
]);
?>
<style data-css="services">
.svc-toolbar{display:grid;gap:10px;grid-template-columns:1fr auto;margin-bottom:12px}
.svc-list{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));margin-top:14px}
.svc-item{display:flex;gap:14px;align-items:flex-start}
.svc-item h3{font-size:.98rem;margin:0 0 4px}
.svc-item p{font-size:.84rem;color:var(--muted);margin:0}
.svc-item .meta{display:flex;align-items:center;gap:8px;margin-top:10px;flex-wrap:wrap}
.svc-item .price{font-weight:700;color:var(--primary);font-size:.9rem}
</style>
<div class="page" data-page="services" data-init="services">
  <header class="page-head">
    <h1><?= e(t('services.title')) ?></h1>
    <p><?= e(t('services.subtitle')) ?></p>
  </header>
  <div class="svc-toolbar">
    <div class="input-icon"><i class="fa-solid fa-magnifying-glass"></i><input class="input" type="search" data-filter-q placeholder="<?= e(t('services.search')) ?>" aria-label="<?= e(t('services.search')) ?>"></div>
    <select class="select" data-filter-sort aria-label="<?= e(t('services.sort')) ?>" style="width:auto">
      <option value="default"><?= e(t('services.sort_default')) ?></option>
      <option value="popular"><?= e(t('services.sort_popular')) ?></option>
      <option value="newest"><?= e(t('services.sort_newest')) ?></option>
      <option value="price"><?= e(t('services.sort_price')) ?></option>
    </select>
  </div>
  <div class="chips" role="toolbar" aria-label="<?= e(t('nav.categories')) ?>">
    <button class="chip" data-cat-chip="all" aria-pressed="true"><i class="fa-solid fa-border-all"></i><?= e(t('common.all')) ?></button>
    <button class="chip" data-cat-chip="featured" aria-pressed="false"><i class="fa-solid fa-star"></i><?= e(t('services.featured')) ?></button>
    <?php foreach ($cats as $c): ?>
      <button class="chip" data-cat-chip="<?= e($c['slug']) ?>" aria-pressed="false"><i class="<?= e(fa($c['icon'], 'fa-solid fa-folder')) ?>"></i><?= e(loc($c, 'name')) ?></button>
    <?php endforeach ?>
  </div>

  <div class="svc-list">
    <?php foreach ($services as $i => $s):
        $price = $s['min_product'] !== null ? (float)$s['min_product'] : ($s['price_from'] !== null ? (float)$s['price_from'] : null);
        $search = mb_strtolower($s['title_en'] . ' ' . $s['title_bn'] . ' ' . $s['short_en'] . ' ' . $s['short_bn'] . ' ' . $s['cat_en'] . ' ' . $s['cat_bn']); ?>
      <a class="card card-link svc-item" href="<?= e(url('/services/' . $s['slug'])) ?>" data-service
         data-cat="<?= e($s['cat_slug']) ?>" data-featured="<?= (int)$s['is_featured'] ?>" data-search="<?= e($search) ?>"
         data-price="<?= $price ?? 999999 ?>" data-views="<?= (int)$s['views'] ?>" data-created="<?= strtotime($s['created_at']) ?>" data-sort="<?= $i ?>">
        <span class="icon-box"><?php if ($s['icon_image']): ?><img src="<?= e(media_url($s['icon_image'])) ?>" alt="" loading="lazy" width="26" height="26"><?php else: ?><i class="<?= e(fa($s['icon'], 'fa-solid fa-code')) ?>"></i><?php endif ?></span>
        <div class="grow">
          <h3><?= e(loc($s, 'title')) ?></h3>
          <p class="clamp-2"><?= e(loc($s, 'short')) ?></p>
          <div class="meta">
            <span class="price"><?= $price !== null ? e(t('services.from', ['price' => money($price)])) : e(t('services.custom_quote')) ?></span>
            <?php if ($s['is_featured']): ?><span class="badge"><i class="fa-solid fa-star"></i><?= e(t('services.featured')) ?></span><?php endif ?>
            <?php if ($s['cat_en']): ?><span class="badge muted"><?= e(loc(['name_en' => $s['cat_en'], 'name_bn' => $s['cat_bn']], 'name')) ?></span><?php endif ?>
          </div>
        </div>
      </a>
    <?php endforeach ?>
  </div>
  <div class="card empty" data-filter-empty hidden><div class="icon-box"><i class="fa-solid fa-magnifying-glass"></i></div><?= e(t('services.none_found')) ?></div>
</div>
