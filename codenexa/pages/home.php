<?php
$title = '';
$services = rows('SELECT * FROM services WHERE active = 1 ORDER BY sort, id LIMIT 8');
$projects = rows('SELECT * FROM projects WHERE active = 1 ORDER BY sort, id LIMIT 6');
$plans    = rows('SELECT * FROM pricing ORDER BY sort, id');
$site     = setting('site_name', 'CodeNexa');
$video    = setting('hero_video');
$features = [
    ['fa-brands fa-php', 'feat.php', '#818cf8'],
    ['fa-brands fa-node-js', 'feat.node', '#34d399'],
    ['fa-solid fa-mobile-screen-button', 'feat.app', '#22d3ee'],
    ['fa-solid fa-pen-ruler', 'feat.ui', '#e879f9'],
    ['fa-solid fa-headset', 'feat.support', '#60a5fa'],
];
?>
<section class="hero band-dark top-band">
    <div class="band-bg" aria-hidden="true">
        <span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span><span class="grid-lines"></span>
        <svg class="star-field" viewBox="0 0 1200 700" preserveAspectRatio="none"><?= stars(60, 1200, 700, 9) ?></svg>
    </div>
    <div class="container hero-wrap">
        <div class="hero-copy">
            <span class="eyebrow pill-eyebrow reveal"><span class="live-dot"></span><?= e(t('hero.eyebrow')) ?></span>
            <h1 class="reveal" style="--d:80ms"><?= e(t('hero.t1')) ?> <span class="grad-text shine"><?= e(t('hero.t2')) ?></span></h1>
            <p class="lead reveal" style="--d:160ms"><?= e(t('hero.text')) ?></p>
            <div class="hero-cta reveal" style="--d:240ms">
                <a href="<?= e(url('contact')) ?>" class="btn btn-primary btn-lg" data-link><?= e(t('hero.cta')) ?> <i class="fa-solid fa-arrow-right"></i></a>
                <?php if ($video !== ''): ?>
                    <button type="button" class="btn-play" data-video="<?= e($video) ?>"><span><i class="fa-solid fa-play"></i></span><?= e(t('hero.video')) ?></button>
                <?php else: ?>
                    <a href="<?= e(url('portfolio')) ?>" class="btn-play" data-link><span><i class="fa-solid fa-play"></i></span><?= e(t('portfolio.title')) ?></a>
                <?php endif; ?>
            </div>
            <div class="trust reveal" style="--d:320ms">
                <span class="faces"><i style="--c:#6366f1">R</i><i style="--c:#ec4899">S</i><i style="--c:#10b981">T</i><i style="--c:#f97316">N</i></span>
                <span><span class="stars-row"><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i></span><small><?= e(t('hero.trust')) ?></small></span>
            </div>
        </div>
        <div class="hero-art reveal r-zoom" style="--d:150ms" data-parallax>
            <?= hero_art() ?>
        </div>
    </div>
    <div class="container">
        <div class="feature-strip">
            <?php foreach ($features as $i => $f): ?>
                <div class="feat reveal" style="--d:<?= 300 + $i * 70 ?>ms;--c:<?= $f[2] ?>">
                    <span class="icon-tile glow"><i class="<?= $f[0] ?>"></i></span>
                    <div><strong><?= e(t($f[1])) ?></strong><small><?= e(t($f[1] . '_t')) ?></small></div>
                </div>
            <?php endforeach; ?>
        </div>
    </div>
</section>

<section class="section stats-sec">
    <div class="container"><?php stats_strip(true); ?></div>
</section>

<section class="section pt-0">
    <div class="container about-wrap">
        <div>
            <span class="eyebrow reveal"><?= e(t('about.eyebrow')) ?></span>
            <h2 class="reveal" style="--d:60ms"><?= e(t('about.title')) ?></h2>
            <p class="muted reveal" style="--d:120ms"><?= e(t('about.text', ['site' => $site])) ?></p>
            <ul class="checks two reveal" style="--d:180ms">
                <li><i class="fa-solid fa-circle-check"></i> <?= e(t('why.team')) ?></li>
                <li><i class="fa-solid fa-circle-check"></i> <?= e(t('why.time')) ?></li>
                <li><i class="fa-solid fa-circle-check"></i> <?= e(t('why.price')) ?></li>
                <li><i class="fa-solid fa-circle-check"></i> <?= e(t('why.support')) ?></li>
            </ul>
            <a href="<?= e(url('about')) ?>" class="btn btn-primary reveal" style="--d:240ms" data-link><?= e(t('about.more')) ?> <i class="fa-solid fa-arrow-right"></i></a>
        </div>
        <div class="about-visual reveal r-right">
            <div class="frame-img"><?= workspace_art() ?></div>
            <div class="float-stat s1 card"><strong><span data-count="<?= (int) setting('stat_years', '5') ?>">0</span>+</strong><small class="muted"><?= e(t('stat.years')) ?></small></div>
            <div class="float-stat s2 card"><strong><span data-count="<?= (int) setting('stat_projects', '80') ?>">0</span>+</strong><small class="muted"><?= e(t('stat.projects')) ?></small></div>
            <div class="float-stat s3 card"><span class="icon-round sm"><i class="fa-solid fa-face-smile"></i></span><div><strong><span data-count="<?= (int) setting('stat_satisfaction', '100') ?>">0</span>%</strong><small class="muted"><?= e(t('stat.satisfaction')) ?></small></div></div>
        </div>
    </div>
</section>

<section class="section alt">
    <div class="container">
        <?php section_head(t('services.eyebrow'), t('services.title'), '', t('services.all'), url('services')); ?>
        <?php services_grid($services); ?>
    </div>
</section>

<?php why_section(); ?>

<?php pricing_section($plans); ?>

<section class="section band-dark portfolio-sec">
    <div class="band-bg" aria-hidden="true"><span class="blob b2"></span><span class="grid-lines"></span></div>
    <div class="container">
        <?php section_head(t('portfolio.eyebrow'), t('portfolio.title'), '', t('portfolio.viewall'), url('portfolio')); ?>
        <?php portfolio_grid($projects); ?>
    </div>
</section>

<?php tech_marquee(); ?>

<?php app_band(); ?>

<?php contact_section(); ?>
