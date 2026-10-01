<?php
$title = '';
$services = rows('SELECT * FROM services WHERE active = 1 ORDER BY sort, id LIMIT 8');
$projects = rows('SELECT * FROM projects WHERE active = 1 ORDER BY sort, id LIMIT 6');
$plans    = rows('SELECT * FROM pricing ORDER BY sort, id');
$site     = setting('site_name', 'CodeNexa');
$video    = setting('hero_video');
$features = [
    ['fa-brands fa-php', 'feat.php'],
    ['fa-brands fa-node-js', 'feat.node'],
    ['fa-solid fa-mobile-screen', 'feat.app'],
    ['fa-solid fa-pen-ruler', 'feat.ui'],
    ['fa-solid fa-headset', 'feat.support'],
];
?>
<section class="hero">
    <div class="hero-bg" aria-hidden="true"><span class="blob b1"></span><span class="blob b2"></span><span class="grid-lines"></span></div>
    <div class="container hero-wrap">
        <div class="hero-copy">
            <span class="eyebrow reveal"><?= e(t('hero.eyebrow')) ?></span>
            <h1 class="reveal" style="--d:60ms"><?= e(t('hero.t1')) ?> <span class="grad-text"><?= e(t('hero.t2')) ?></span></h1>
            <p class="lead muted reveal" style="--d:120ms"><?= e(t('hero.text')) ?></p>
            <div class="hero-cta reveal" style="--d:180ms">
                <a href="<?= e(url('contact')) ?>" class="btn btn-primary" data-link><?= e(t('hero.cta')) ?> <i class="fa-solid fa-arrow-right"></i></a>
                <?php if ($video !== ''): ?>
                    <button type="button" class="btn-play" data-video="<?= e($video) ?>"><span><i class="fa-solid fa-play"></i></span><?= e(t('hero.video')) ?></button>
                <?php else: ?>
                    <a href="<?= e(url('portfolio')) ?>" class="btn-play" data-link><span><i class="fa-solid fa-play"></i></span><?= e(t('portfolio.title')) ?></a>
                <?php endif; ?>
            </div>
        </div>
        <div class="hero-art reveal" style="--d:120ms" aria-hidden="true">
            <?= iso_art() ?>
        </div>
    </div>
    <div class="container">
        <div class="feature-strip card reveal">
            <?php foreach ($features as $f): ?>
                <div class="feat">
                    <span class="icon-tile sm"><i class="<?= $f[0] ?>"></i></span>
                    <div><strong><?= e(t($f[1])) ?></strong><small class="muted"><?= e(t($f[1] . '_t')) ?></small></div>
                </div>
            <?php endforeach; ?>
        </div>
    </div>
</section>

<section class="section">
    <div class="container about-wrap">
        <div>
            <span class="eyebrow reveal"><?= e(t('about.eyebrow')) ?></span>
            <h2 class="reveal"><?= e(t('about.title')) ?></h2>
            <p class="muted reveal"><?= e(t('about.text', ['site' => $site])) ?></p>
            <a href="<?= e(url('about')) ?>" class="btn btn-primary btn-sm reveal" data-link><?= e(t('about.more')) ?> <i class="fa-solid fa-arrow-right"></i></a>
        </div>
        <div class="about-visual reveal">
            <div class="screen" aria-hidden="true">
                <div class="code-lines"><i style="--w:60%"></i><i style="--w:85%"></i><i style="--w:40%"></i><i style="--w:75%"></i><i style="--w:55%"></i><i style="--w:90%"></i><i style="--w:35%"></i></div>
            </div>
            <div class="float-stat s1 card"><strong><span data-count="<?= (int) setting('stat_years', '5') ?>">0</span>+</strong><small class="muted"><?= e(t('stat.years')) ?></small></div>
            <div class="float-stat s2 card"><strong><span data-count="<?= (int) setting('stat_projects', '80') ?>">0</span>+</strong><small class="muted"><?= e(t('stat.projects')) ?></small></div>
            <div class="float-stat s3 card"><strong><span data-count="<?= (int) setting('stat_satisfaction', '100') ?>">0</span>%</strong><small class="muted"><?= e(t('stat.satisfaction')) ?></small></div>
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

<section class="section">
    <div class="container">
        <?php section_head(t('portfolio.eyebrow'), t('portfolio.title'), '', t('portfolio.viewall'), url('portfolio')); ?>
        <?php portfolio_grid($projects); ?>
    </div>
</section>

<?php pricing_section($plans); ?>

<section class="section">
    <div class="container app-wrap card">
        <div class="phones reveal" aria-hidden="true">
            <div class="phone-frame back"><div class="phone-ui"><b></b><span class="chart"></span><i></i><i></i></div></div>
            <div class="phone-frame front"><div class="phone-ui"><b>$12,450</b><span class="bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span><i></i><i></i></div></div>
        </div>
        <div>
            <h2 class="reveal"><?= e(t('app.title')) ?></h2>
            <p class="muted reveal"><?= e(t('app.text')) ?></p>
            <ul class="checks big">
                <?php for ($i = 1; $i <= 4; $i++): ?>
                    <li class="reveal" style="--d:<?= $i * 60 ?>ms"><i class="fa-solid fa-circle-check"></i> <?= e(t('app.f' . $i)) ?></li>
                <?php endfor; ?>
            </ul>
            <div class="row gap reveal">
                <a href="<?= e(url('service', ['slug' => 'mobile-app-development'])) ?>" class="btn btn-primary btn-sm" data-link><?= e(t('hero.cta')) ?> <i class="fa-solid fa-arrow-right"></i></a>
                <span class="platform"><i class="fa-brands fa-android"></i> Android</span>
                <span class="platform"><i class="fa-brands fa-apple"></i> iOS</span>
            </div>
        </div>
    </div>
</section>

<?php contact_section(); ?>
