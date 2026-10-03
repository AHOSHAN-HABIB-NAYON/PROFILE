<?php
/** @var array $slides @var array $categories @var array $featured @var array $grid @var array $posts @var array $team @var array $faqs @var array $methods */
$wa = preg_replace('/\D/', '', setting('contact_whatsapp'));
?>
<section class="hero">
    <div class="hero-text">
        <span class="hero-kicker"><i class="fa-solid fa-bolt"></i> <?= e(sl('site_tagline')) ?></span>
        <h1><?= e(sl('hero_title')) ?></h1>
        <p><?= e(sl('hero_subtitle')) ?></p>
        <div class="row-gap">
            <a class="btn btn-sm btn-white" href="<?= e(url('/services')) ?>"><i class="fa-solid fa-layer-group"></i> <?= e(t('home.explore')) ?></a>
            <a class="btn btn-sm btn-glass" href="<?= e(url('/contact')) ?>"><i class="fa-solid fa-headset"></i> <?= e(t('home.contact')) ?></a>
        </div>
    </div>
    <div class="hero-art" aria-hidden="true">
        <div class="hero-screen"><i class="fa-solid fa-code"></i><span></span><span></span><span class="short"></span></div>
        <span class="hero-float f1"><i class="fa-brands fa-react"></i></span>
        <span class="hero-float f2"><i class="fa-brands fa-node-js"></i></span>
        <span class="hero-float f3"><i class="fa-solid fa-shield-halved"></i></span>
    </div>
</section>

<section class="stats-row">
    <div><strong><?= e(num(setting('stat_projects'))) ?></strong><span><?= e(t('home.stat_projects')) ?></span></div>
    <div><strong><?= e(num(setting('stat_satisfaction'))) ?></strong><span><?= e(t('home.stat_clients')) ?></span></div>
    <div><strong><?= e(num(setting('stat_support'))) ?></strong><span><?= e(t('home.stat_support')) ?></span></div>
</section>

<?php if ($slides): ?>
<section class="section slider" data-component="slider" aria-roledescription="carousel" aria-label="<?= e(t('home.platforms')) ?>">
    <div class="slider-track">
        <?php foreach ($slides as $sl): ?>
            <a class="slide card" href="<?= e(url($sl['link'] ?: '/services')) ?>">
                <span class="ic-box ic-box-lg"><?= $sl['image'] ? '<img src="' . e(upload_url($sl['image'])) . '" alt="" loading="lazy">' : icon_html($sl['icon']) ?></span>
                <span class="grow"><strong><?= e(tr($sl, 'title')) ?></strong><small class="muted clamp-2"><?= e(tr($sl, 'subtitle')) ?></small></span>
                <span class="btn btn-xs btn-soft"><?= e($sl['button_text'] ?: t('common.view')) ?> <i class="fa-solid fa-arrow-right"></i></span>
            </a>
        <?php endforeach; ?>
    </div>
    <?php if (count($slides) > 1): ?>
        <div class="slider-dots"><?php foreach ($slides as $i => $_): ?><button class="slider-dot<?= $i === 0 ? ' active' : '' ?>" type="button" aria-label="<?= $i + 1 ?>"></button><?php endforeach; ?></div>
    <?php endif; ?>
</section>
<?php endif; ?>

<section class="section">
    <div class="section-head"><h2 class="section-title"><?= e(t('home.our_services')) ?></h2><a class="small" href="<?= e(url('/services')) ?>"><?= e(t('common.view_all')) ?></a></div>
    <div class="tile-grid">
        <?php foreach ($grid as $s): ?>
            <a class="tile card-link" href="<?= e(url('/services/' . $s['slug'])) ?>">
                <?= svc_logo($s, 'md') ?>
                <span class="tile-label"><?= e(tr($s, 'title')) ?></span>
            </a>
        <?php endforeach; ?>
    </div>
</section>

<?php if ($posts): ?>
<section class="section card">
    <div class="section-head"><h2 class="section-title"><i class="fa-solid fa-bolt text-warning"></i> <?= e(t('home.latest_posts')) ?></h2><a class="small" href="<?= e(url('/news')) ?>"><?= e(t('common.view_all')) ?></a></div>
    <div class="list">
        <?php foreach ($posts as $p): ?>
            <a class="list-item post-line" href="<?= e(url('/news/' . $p['id'])) ?>">
                <span class="post-emoji"><?= e($p['icon'] ?: '📰') ?></span>
                <span class="title truncate grow"><?= e($p['title']) ?></span>
                <span class="meta"><?= e(time_ago($p['published_at'])) ?></span>
            </a>
        <?php endforeach; ?>
    </div>
</section>
<?php endif; ?>

<?php if ($featured): ?>
<section class="section">
    <div class="section-head"><h2 class="section-title"><?= e(t('home.featured')) ?></h2><a class="small" href="<?= e(url('/services')) ?>"><?= e(t('common.view_all')) ?></a></div>
    <div class="h-scroll">
        <?php foreach ($featured as $s) require VIEWS . '/components/service-card.php'; ?>
    </div>
</section>
<?php endif; ?>

<section class="section">
    <div class="section-head"><h2 class="section-title"><?= e(t('home.why')) ?></h2></div>
    <div class="grid grid-2 md-grid-4">
        <?php foreach ([
            ['fa-solid fa-gauge-high', '#16a34a', 'home.why_fast', 'home.why_fast_d'],
            ['fa-solid fa-shield-halved', '#2563eb', 'home.why_secure', 'home.why_secure_d'],
            ['fa-solid fa-mobile-screen', '#7c3aed', 'home.why_mobile', 'home.why_mobile_d'],
            ['fa-solid fa-headset', '#ea580c', 'home.why_support', 'home.why_support_d'],
        ] as [$ic, $c, $tk, $dk]): ?>
            <div class="card why">
                <span class="ic-box ic-box-sm" style="--c:<?= $c ?>"><i class="<?= $ic ?>"></i></span>
                <strong><?= e(t($tk)) ?></strong><p class="muted xs mb-0"><?= e(t($dk)) ?></p>
            </div>
        <?php endforeach; ?>
    </div>
</section>

<section class="section tech-section">
    <div class="section-head"><h2 class="section-title"><?= e(t('home.tech')) ?></h2><span class="xs muted"><?= e(t('home.tech_sub')) ?></span></div>
    <?php $techs = [
        ['fa-brands fa-node-js', 'Node.js', '#3c873a'], ['fa-brands fa-react', 'React', '#149eca'], ['fa-brands fa-php', 'PHP', '#777bb4'], ['fa-brands fa-js', 'JavaScript', '#e8b400'],
        ['fa-brands fa-html5', 'HTML5', '#e34f26'], ['fa-brands fa-css3-alt', 'CSS3', '#1572b6'], ['fa-brands fa-laravel', 'Laravel', '#ff2d20'], ['fa-brands fa-vuejs', 'Vue.js', '#41b883'],
        ['fa-solid fa-database', 'MySQL', '#00758f'], ['fa-brands fa-python', 'Python', '#3776ab'], ['fa-brands fa-docker', 'Docker', '#2496ed'], ['fa-brands fa-git-alt', 'Git', '#f05032'],
        ['fa-brands fa-github', 'GitHub', '#24292f'], ['fa-brands fa-aws', 'AWS', '#ff9900'], ['fa-brands fa-cloudflare', 'Cloudflare', '#f38020'], ['fa-brands fa-wordpress', 'WordPress', '#21759b'],
        ['fa-brands fa-figma', 'Figma', '#a259ff'], ['fa-brands fa-bootstrap', 'Bootstrap', '#7952b3'], ['fa-brands fa-npm', 'npm', '#cb3837'], ['fa-solid fa-robot', 'OpenAI', '#10a37f'],
    ];
    $rows = [array_slice($techs, 0, 10), array_slice($techs, 10)]; ?>
    <div class="tech-marquee" aria-label="<?= e(t('home.tech')) ?>">
        <?php foreach ($rows as $ri => $row): ?>
            <div class="tech-track<?= $ri ? ' reverse' : '' ?>">
                <?php foreach ([0, 1] as $copy): foreach ($row as [$ic, $n, $c]): ?>
                    <span class="tech-chip" style="--c:<?= $c ?>" <?= $copy ? 'aria-hidden="true"' : '' ?>><span class="tech-ic"><i class="<?= $ic ?>"></i></span><?= e($n) ?></span>
                <?php endforeach; endforeach; ?>
            </div>
        <?php endforeach; ?>
    </div>
</section>

<section class="section">
    <div class="section-head"><h2 class="section-title"><?= e(t('home.how')) ?></h2></div>
    <ol class="steps">
        <?php foreach ([['fa-solid fa-hand-pointer', 'home.step1', 'home.step1_d'], ['fa-solid fa-wallet', 'home.step2', 'home.step2_d'], ['fa-solid fa-receipt', 'home.step3', 'home.step3_d'], ['fa-solid fa-rocket', 'home.step4', 'home.step4_d']] as $i => [$ic, $tk, $dk]): ?>
            <li class="step"><span class="step-no"><?= num($i + 1) ?></span><div><strong><i class="<?= $ic ?> text-primary"></i> <?= e(t($tk)) ?></strong><p class="muted xs mb-0"><?= e(t($dk)) ?></p></div></li>
        <?php endforeach; ?>
    </ol>
</section>

<?php if ($methods): ?>
<section class="section card">
    <div class="section-head"><h2 class="section-title"><?= e(t('home.payments')) ?></h2><a class="small" href="<?= e(url('/payment')) ?>"><?= e(t('nav.payment')) ?></a></div>
    <div class="pay-logos">
        <?php foreach ($methods as $m): ?>
            <span class="pay-logo"><img src="<?= e(Content::media($m['logo'])) ?>" alt="" width="26" height="26" loading="lazy"><?= e($m['name']) ?></span>
        <?php endforeach; ?>
    </div>
</section>
<?php endif; ?>

<?php if ($team): ?>
<section class="section">
    <div class="section-head"><h2 class="section-title"><?= e(t('team.title')) ?></h2><a class="small" href="<?= e(url('/team')) ?>"><?= e(t('common.view_all')) ?></a></div>
    <div class="grid grid-2 md-grid-4">
        <?php foreach ($team as $m): ?>
            <a class="card card-link team-mini" href="<?= e(url('/team/' . $m['id'])) ?>">
                <?= $m['photo'] ? '<img class="avatar" src="' . e(upload_url($m['photo'])) . '" alt="" loading="lazy">' : avatar_html(['name' => $m['name'], 'email' => $m['name']]) ?>
                <span class="grow truncate"><strong class="truncate"><?= e($m['name']) ?></strong><small class="muted truncate"><?= e(tr($m, 'role')) ?></small></span>
                <?php if ($m['is_vip']): ?><span class="badge badge-vip<?= $m['badge_animated'] ? ' animated' : '' ?>"><?= e($m['badge_text'] ?: 'VIP') ?></span><?php endif; ?>
            </a>
        <?php endforeach; ?>
    </div>
</section>
<?php endif; ?>

<?php if ($faqs): ?>
<section class="section">
    <div class="section-head"><h2 class="section-title"><?= e(t('nav.faq')) ?></h2><a class="small" href="<?= e(url('/faq')) ?>"><?= e(t('common.view_all')) ?></a></div>
    <?php foreach ($faqs as $f): ?>
        <details class="acc"><summary><?= e(tr($f, 'question')) ?></summary><div class="acc-body"><?= nl2br(e(tr($f, 'answer'))) ?></div></details>
    <?php endforeach; ?>
</section>
<?php endif; ?>

<section class="section cta">
    <div><h2><?= e(t('home.cta')) ?></h2><p><?= e(t('home.cta_d')) ?></p></div>
    <div class="row-gap">
        <a class="btn btn-sm btn-white" href="<?= e(url('/contact')) ?>"><i class="fa-solid fa-paper-plane"></i> <?= e(t('home.contact')) ?></a>
        <?php if ($wa): ?><a class="btn btn-sm btn-glass" href="https://wa.me/<?= e($wa) ?>" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a><?php endif; ?>
    </div>
</section>
