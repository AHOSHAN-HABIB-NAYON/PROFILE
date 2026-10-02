<?php
/** Service details + its products (each with Buy Now). */
defined('APP') || exit;
require_once ROOT . '/core/upload.php';

$s = row('SELECT s.*, c.name_en AS cat_en, c.name_bn AS cat_bn, c.slug AS cat_slug FROM services s LEFT JOIN service_categories c ON c.id = s.category_id WHERE s.slug = ? AND s.status = 1', [$params['slug']]);
if (!$s) abort(404);
$products = rows('SELECT * FROM products WHERE service_id = ? AND status = 1 ORDER BY is_featured DESC, sort, id', [$s['id']]);
$features = lines(loc($s, 'features'));
$related = rows('SELECT slug, title_en, title_bn, icon, icon_image FROM services WHERE status = 1 AND category_id <=> ? AND id <> ? ORDER BY is_featured DESC, sort LIMIT 6', [$s['category_id'], $s['id']]);
$title = loc($s, 'title');
$u = user();

$offers = array_map(fn($p) => ['@type' => 'Offer', 'name' => $p['name_en'], 'price' => product_price($p, 'USD'), 'priceCurrency' => 'USD', 'url' => abs_url('/services/' . $s['slug'])], $products);
meta([
    'title' => $title,
    'description' => loc($s, 'short') ?: mb_substr(strip_tags(loc($s, 'description')), 0, 160),
    'image' => $s['image'] ?: null,
    'track_type' => 'service',
    'track_ref' => $s['id'],
    'schema' => [
        ['@context' => 'https://schema.org', '@type' => 'Service', 'name' => $title, 'description' => loc($s, 'short'), 'provider' => ['@type' => 'Organization', 'name' => setting('site_name')],
            'areaServed' => 'Worldwide'] + ($offers ? ['offers' => $offers] : []),
        breadcrumb_schema([t('nav.home') => '/', t('services.title') => '/services', $title => '/services/' . $s['slug']]),
    ],
]);
?>
<style data-css="service-details">
.sd-head{display:flex;gap:16px;align-items:flex-start}
.sd-head h1{margin:2px 0 6px}
.sd-cover{border-radius:var(--radius);overflow:hidden;margin:16px 0;aspect-ratio:16/7;background:var(--soft)}.sd-cover img{width:100%;height:100%;object-fit:cover}
.feat-list{list-style:none;padding:0;margin:0;display:grid;gap:8px;grid-template-columns:repeat(auto-fill,minmax(200px,1fr))}
.feat-list li{display:flex;gap:10px;align-items:flex-start;font-size:.9rem}
.feat-list li i{color:var(--success);margin-top:5px;font-size:.8rem}
.products{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(290px,1fr))}
.product{display:flex;flex-direction:column;gap:12px;position:relative}
.product.featured{border-color:color-mix(in srgb,var(--primary) 45%,var(--border));box-shadow:0 10px 30px -18px var(--primary)}
.product .ribbon{position:absolute;top:14px;right:14px}
.product h3{margin:0;font-size:1.05rem;padding-right:70px}
.price-box{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.price-box .now{font-size:1.6rem;font-weight:800;color:var(--primary);letter-spacing:-.02em}
.price-box .alt{font-size:.85rem;color:var(--muted)}
.price-box s{color:var(--muted);font-size:.9rem}
.p-meta{display:flex;gap:8px;flex-wrap:wrap}
.p-meta span{display:inline-flex;align-items:center;gap:6px;font-size:.78rem;background:var(--soft);padding:4px 10px;border-radius:999px}
.product details summary{cursor:pointer;font-size:.86rem;font-weight:600;color:var(--primary);list-style:none}
.product details summary::-webkit-details-marker{display:none}
.product .actions{display:flex;gap:8px;margin-top:auto}
.product .actions .btn{flex:1}
</style>
<div class="page" data-page="service">
  <nav class="crumbs" aria-label="breadcrumb"><a href="<?= e(url('/')) ?>"><?= e(t('nav.home')) ?></a><i class="fa-solid fa-chevron-right tiny"></i>
    <a href="<?= e(url('/services')) ?>"><?= e(t('services.title')) ?></a><?php if ($s['cat_slug']): ?><i class="fa-solid fa-chevron-right tiny"></i>
    <a href="<?= e(url('/services?category=' . $s['cat_slug'])) ?>"><?= e(loc(['name_en' => $s['cat_en'], 'name_bn' => $s['cat_bn']], 'name')) ?></a><?php endif ?></nav>

  <header class="sd-head">
    <span class="icon-box lg"><?php if ($s['icon_image']): ?><img src="<?= e(media_url($s['icon_image'])) ?>" alt="" width="32" height="32"><?php else: ?><i class="<?= e(fa($s['icon'], 'fa-solid fa-code')) ?>"></i><?php endif ?></span>
    <div class="grow">
      <h1><?= e($title) ?></h1>
      <p class="muted mb-0"><?= e(loc($s, 'short')) ?></p>
    </div>
    <button class="icon-btn" data-action="share" data-title="<?= e($title) ?>" data-url="<?= e(abs_url('/services/' . $s['slug'])) ?>" aria-label="<?= e(t('common.share')) ?>"><i class="fa-solid fa-share-nodes"></i></button>
  </header>

  <?php if ($s['image']): ?><div class="sd-cover"><?= img_tag($s['image'], $title, ['sizes' => '(max-width: 900px) 100vw, 900px']) ?></div><?php endif ?>

  <?php if ($desc = loc($s, 'description')): ?><section class="card card-pad-lg section mt-2"><div class="rt"><?= sanitize_html($desc) ?></div></section><?php endif ?>

  <?php if ($features): ?>
  <section class="section card card-pad-lg mt-2" aria-labelledby="h-incl">
    <h2 id="h-incl" class="mb-1" style="font-size:1rem"><?= e(t('services.included')) ?></h2>
    <ul class="feat-list"><?php foreach ($features as $f): ?><li><i class="fa-solid fa-circle-check"></i><?= e($f) ?></li><?php endforeach ?></ul>
  </section>
  <?php endif ?>

  <section class="section" aria-labelledby="h-products">
    <div class="section-head mt-2"><h2 id="h-products"><?= e(t('services.packages')) ?></h2></div>
    <?php if (!$products): ?>
      <div class="card empty"><div class="icon-box"><i class="fa-solid fa-comments"></i></div><p><?= e(t('services.no_products')) ?></p>
        <a class="btn" href="<?= e(url('/contact?subject=' . rawurlencode($title))) ?>"><?= e(t('services.request_quote')) ?></a></div>
    <?php endif ?>
    <div class="products">
      <?php foreach ($products as $p):
          $usd = product_price($p, 'USD');
          $bdt = product_price($p, 'BDT');
          $pf = lines(loc($p, 'features'));
          $disc = (float)$p['discount_percent']; ?>
        <article class="card card-pad-lg product <?= $p['is_featured'] ? 'featured' : '' ?>">
          <?php if ($p['is_featured']): ?><span class="badge ribbon"><i class="fa-solid fa-crown"></i><?= e(t('services.popular')) ?></span>
          <?php elseif ($disc > 0): ?><span class="badge danger ribbon">-<?= e(num($disc)) ?>%</span><?php endif ?>
          <div class="row"><span class="icon-box sm"><i class="<?= e(fa($p['icon'] ?: $s['icon'], 'fa-solid fa-box')) ?>"></i></span><h3><?= e(loc($p, 'name')) ?></h3></div>
          <div class="price-box">
            <span class="now"><?= e(money($usd)) ?></span>
            <?php if ($disc > 0): ?><s><?= e(money($p['price_usd'])) ?></s><?php endif ?>
            <span class="alt">≈ <?= e(money($bdt, 'BDT')) ?></span>
          </div>
          <?php if ($short = loc($p, 'short')): ?><p class="muted small mb-0"><?= e($short) ?></p><?php endif ?>
          <div class="p-meta">
            <?php if ($p['delivery_days']): ?><span><i class="fa-regular fa-clock"></i><?= e(t('services.delivery_days', ['n' => num((int)$p['delivery_days'])])) ?></span><?php endif ?>
            <?php if ($p['support_months']): ?><span><i class="fa-solid fa-headset"></i><?= e(t('services.support_months', ['n' => num((int)$p['support_months'])])) ?></span><?php endif ?>
          </div>
          <?php if ($pf): ?><ul class="feat-list" style="grid-template-columns:1fr"><?php foreach ($pf as $f): ?><li><i class="fa-solid fa-check"></i><?= e($f) ?></li><?php endforeach ?></ul><?php endif ?>
          <?php if ($pd = loc($p, 'description')): ?><details><summary><?= e(t('services.details')) ?> <i class="fa-solid fa-chevron-down tiny"></i></summary><div class="rt small mt-1"><?= sanitize_html($pd) ?></div></details><?php endif ?>
          <div class="actions">
            <?php if ($p['demo_url']): ?><a class="btn btn-ghost" href="<?= e($p['demo_url']) ?>" target="_blank" rel="noopener nofollow"><i class="fa-solid fa-eye"></i><?= e(t('services.demo')) ?></a><?php endif ?>
            <?php if (!$s['orderable']): ?>
              <a class="btn" href="<?= e(url('/contact?subject=' . rawurlencode(loc($p, 'name')))) ?>"><?= e(t('services.request_quote')) ?></a>
            <?php elseif ($u): ?>
              <button class="btn" data-action="buy" data-product="<?= e($p['slug']) ?>"><i class="fa-solid fa-bag-shopping"></i><?= e(t('services.buy_now')) ?></button>
            <?php else: ?>
              <a class="btn" href="<?= e(url('/login?next=' . rawurlencode('/services/' . $s['slug']))) ?>"><i class="fa-solid fa-bag-shopping"></i><?= e(t('services.buy_now')) ?></a>
            <?php endif ?>
          </div>
        </article>
      <?php endforeach ?>
    </div>
  </section>

  <?php if ($related): ?>
  <section class="section" aria-labelledby="h-rel">
    <div class="section-head"><h2 id="h-rel"><?= e(t('services.related')) ?></h2></div>
    <div class="chips" style="flex-wrap:wrap">
      <?php foreach ($related as $r): ?><a class="chip" href="<?= e(url('/services/' . $r['slug'])) ?>"><i class="<?= e(fa($r['icon'], 'fa-solid fa-code')) ?>"></i><?= e(loc($r, 'title')) ?></a><?php endforeach ?>
    </div>
  </section>
  <?php endif ?>
</div>
