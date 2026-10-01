<?php
$s = $slug !== '' ? row('SELECT * FROM services WHERE slug = ? AND active = 1', [$slug]) : null;
if (!$s) {
    include __DIR__ . '/404.php';
    return;
}
$title = $s['title'];
$others = rows('SELECT * FROM services WHERE active = 1 AND id <> ? ORDER BY sort, id LIMIT 4', [$s['id']]);
?>
<section class="page-hero service-hero" style="--c:<?= e($s['color']) ?>">
    <div class="container service-head">
        <div>
            <a href="<?= e(url('services')) ?>" class="back-link" data-link><i class="fa-solid fa-arrow-left"></i> <?= e(t('service.back')) ?></a>
            <div class="row gap center-y reveal">
                <span class="icon-tile lg"><i class="<?= e($s['icon']) ?>"></i></span>
                <div>
                    <h1><?= e($s['title']) ?></h1>
                    <p class="muted"><?= e($s['summary']) ?></p>
                </div>
            </div>
        </div>
        <div class="service-art reveal" aria-hidden="true"><?= iso_art() ?></div>
    </div>
</section>
<section class="section pt-0">
    <div class="container service-body">
        <div class="card prose reveal">
            <?php foreach (lines((string) $s['body']) as $p): ?><p><?= e($p) ?></p><?php endforeach; ?>
            <h3><?= e(t('service.features')) ?></h3>
            <ul class="checks big">
                <?php foreach (lines((string) $s['features']) as $f): ?>
                    <li><i class="fa-solid fa-circle-check"></i> <?= e($f) ?></li>
                <?php endforeach; ?>
            </ul>
            <a href="<?= e(url('contact')) ?>" class="btn btn-primary btn-block" data-link><?= e(t('nav.quote')) ?> <i class="fa-solid fa-arrow-right"></i></a>
        </div>
        <aside>
            <?php services_grid($others); ?>
        </aside>
    </div>
</section>
