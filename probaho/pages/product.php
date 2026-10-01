<?php
/** Single product / release post. */
$p = db()->row("SELECT * FROM products WHERE slug = ? AND status = 'published'", [$params['slug']]);
if (!$p) {
    http_response_code(404);
    require __DIR__ . '/404.php';
    return;
}
if (empty($_SESSION['viewed_' . $p['id']])) {
    $_SESSION['viewed_' . $p['id']] = 1;
    db()->q('UPDATE products SET views = views + 1 WHERE id = ?', [$p['id']]);
}
View::$meta['title'] = $p['title_bn'];
View::$meta['description'] = mb_substr((string) ($p['summary'] ?: $p['description']), 0, 200);
View::$meta['image'] = $p['cover_image'] ? upload_url($p['cover_image']) : '';
View::$meta['back'] = true;
View::$meta['schema'] = ['@context' => 'https://schema.org', '@type' => 'Article', 'headline' => $p['title_bn'], 'alternativeHeadline' => $p['title_en'], 'datePublished' => date('c', strtotime((string) ($p['published_at'] ?: $p['created_at']))), 'image' => $p['cover_image'] ? abs_url(upload_url($p['cover_image'])) : null, 'publisher' => ['@type' => 'Organization', 'name' => setting('site_name')]];
$gallery = array_filter((array) json_decode((string) $p['gallery'], true));
$btnUrl = (string) $p['button_url'];
?>
<?php if (!$user): ?><div class="container public-page"><div class="narrow"><?php endif; ?>
<article class="card" style="padding:0;overflow:hidden">
  <div class="product-cover"><?= $p['cover_image'] ? '<img src="' . e(upload_url($p['cover_image'])) . '" alt="' . e($p['title_bn']) . '">' : icon('package') ?></div>
  <div style="padding:18px">
    <div class="product-meta"><?php if ($p['category']): ?><span class="badge badge-brand"><?= e($p['category']) ?></span><?php endif; ?><span><?= icon('calendar') ?> <?= e(bn_date($p['release_date'], false)) ?></span><span><?= icon('eye') ?> <?= bn_digits((string) $p['views']) ?></span></div>
    <h1 style="font-size:23px;margin:10px 0 2px"><?= e($p['title_bn']) ?></h1>
    <?php if ($p['title_en']): ?><p class="muted" style="font-family:var(--font-num)"><?= e($p['title_en']) ?></p><?php endif; ?>
    <div class="prose"><?= nl2p($p['description']) ?></div>
    <?php if ($gallery): ?>
      <div class="gallery" style="margin:14px 0"><?php foreach ($gallery as $g): ?><a href="<?= e(upload_url($g)) ?>" target="_blank" rel="noopener"><img src="<?= e(upload_url($g)) ?>" alt="" loading="lazy" decoding="async"></a><?php endforeach; ?></div>
    <?php endif; ?>
    <?php if ($p['button_text'] && $btnUrl): ?>
      <a href="<?= e(url($btnUrl)) ?>" class="btn btn-primary btn-block btn-lg" <?= preg_match('~^https?://~', $btnUrl) ? 'target="_blank" rel="noopener"' : 'data-link' ?>><?= e($p['button_text']) ?> <?= icon('arrow-right') ?></a>
    <?php endif; ?>
  </div>
</article>
<a href="<?= e(url('/products')) ?>" class="btn btn-ghost btn-block" style="margin-top:12px" data-link>← সব প্রোডাক্ট</a>
<?php if (!$user): ?></div></div><?php endif; ?>
