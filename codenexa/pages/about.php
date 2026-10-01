<?php
$title = t('nav.about');
$team = rows('SELECT * FROM team ORDER BY sort, id');
$site = setting('site_name', 'CodeNexa');
$video = setting('hero_video');
page_hero(t('about.eyebrow'), t('about.title'));
?>
<section class="section pt-0">
    <div class="container about-wrap">
        <div class="office reveal" aria-hidden="true">
            <div class="office-art">
                <span class="desk d1"></span><span class="desk d2"></span><span class="desk d3"></span>
                <?php if ($video !== ''): ?>
                    <button type="button" class="play-big" data-video="<?= e($video) ?>" aria-label="<?= e(t('hero.video')) ?>"><i class="fa-solid fa-play"></i></button>
                <?php else: ?>
                    <span class="play-big"><?= logo_svg(44) ?></span>
                <?php endif; ?>
            </div>
        </div>
        <div>
            <h2 class="reveal"><?= e(t('about.who')) ?></h2>
            <p class="muted reveal"><?= e(t('about.who_text', ['site' => $site])) ?></p>
            <div class="mv">
                <div class="card reveal"><i class="fa-solid fa-bullseye"></i><strong><?= e(t('about.mission')) ?></strong><p class="muted small"><?= e(t('about.mission_text')) ?></p></div>
                <div class="card reveal" style="--d:80ms"><i class="fa-solid fa-eye"></i><strong><?= e(t('about.vision')) ?></strong><p class="muted small"><?= e(t('about.vision_text')) ?></p></div>
            </div>
        </div>
    </div>
</section>
<section class="section pt-0">
    <div class="container"><?php stats_strip(); ?></div>
</section>
<?php if ($team): ?>
<section class="section alt">
    <div class="container">
        <?php section_head(t('about.eyebrow'), t('team.title'), t('team.text')); ?>
        <?php team_grid($team); ?>
    </div>
</section>
<?php endif; ?>
<?php why_section(); ?>
<?php cta_band(); ?>
