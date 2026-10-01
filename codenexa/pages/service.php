<?php
$s = $slug !== '' ? row('SELECT * FROM services WHERE slug = ? AND active = 1', [$slug]) : null;
if (!$s) {
    include __DIR__ . '/404.php';
    return;
}
$title = $s['title'];
$others = rows('SELECT * FROM services WHERE active = 1 AND id <> ? ORDER BY sort, id LIMIT 4', [$s['id']]);
?>
<section class="band-dark top-band page-hero service-hero" style="--c:<?= e($s['color']) ?>">
    <div class="band-bg" aria-hidden="true"><span class="blob b1"></span><span class="blob b2"></span><span class="grid-lines"></span></div>
    <div class="container service-head">
        <div>
            <nav class="crumbs reveal" aria-label="Breadcrumb">
                <a href="<?= e(url()) ?>" data-link><i class="fa-solid fa-house"></i> <?= e(t('nav.home')) ?></a>
                <i class="fa-solid fa-chevron-right sep"></i><a href="<?= e(url('services')) ?>" data-link><?= e(t('nav.services')) ?></a>
                <i class="fa-solid fa-chevron-right sep"></i><span><?= e($s['title']) ?></span>
            </nav>
            <span class="icon-tile xl reveal r-zoom"><i class="<?= e($s['icon']) ?>"></i></span>
            <h1 class="reveal" style="--d:80ms"><?= e($s['title']) ?></h1>
            <p class="lead reveal" style="--d:140ms"><?= e($s['summary']) ?></p>
            <a href="<?= e(url('contact')) ?>" class="btn btn-primary reveal" style="--d:200ms" data-link><?= e(t('nav.quote')) ?> <i class="fa-solid fa-arrow-right"></i></a>
        </div>
        <div class="service-art reveal r-zoom" data-parallax><?= hero_art() ?></div>
    </div>
</section>
<section class="section sheet">
    <div class="container service-body">
        <div class="card prose reveal">
            <div class="prose-head">
                <span class="icon-tile" style="--c:<?= e($s['color']) ?>"><i class="<?= e($s['icon']) ?>"></i></span>
                <div><h2><?= e($s['title']) ?></h2><p class="muted"><?= e($s['summary']) ?></p></div>
            </div>
            <?php foreach (lines((string) $s['body']) as $p): ?><p><?= e($p) ?></p><?php endforeach; ?>
            <h3><?= e(t('service.features')) ?></h3>
            <ul class="feature-list">
                <?php foreach (lines((string) $s['features']) as $i => $f): ?>
                    <li class="reveal r-left" style="--d:<?= $i * 70 ?>ms"><i class="fa-solid fa-circle-check"></i> <?= e($f) ?></li>
                <?php endforeach; ?>
            </ul>
            <a href="<?= e(url('contact')) ?>" class="btn btn-primary btn-block" data-link><?= e(t('nav.quote')) ?> <i class="fa-solid fa-arrow-right"></i></a>
        </div>
        <aside>
            <h3 class="aside-title"><?= e(t('services.eyebrow')) ?></h3>
            <?php services_grid($others, false); ?>
        </aside>
    </div>
</section>
<?php cta_band(); ?>
