<?php
$title = t('nav.about');
$team = rows('SELECT * FROM team ORDER BY sort, id');
$site = setting('site_name', 'CodeNexa');
$video = setting('hero_video');
page_hero(t('about.eyebrow'), t('about.title'), t('about.mission_text'), [[t('nav.about')]]);
?>
<section class="section sheet">
    <div class="container about-wrap">
        <div class="office reveal r-left"><?= workspace_art(true, $video) ?></div>
        <div>
            <span class="eyebrow reveal"><?= e(t('about.eyebrow')) ?></span>
            <h2 class="reveal"><?= e(t('about.who')) ?></h2>
            <p class="muted reveal"><?= e(t('about.who_text', ['site' => $site])) ?></p>
            <div class="mv">
                <div class="card reveal" data-tilt><span class="icon-round"><i class="fa-solid fa-bullseye"></i></span><strong><?= e(t('about.mission')) ?></strong><p class="muted small"><?= e(t('about.mission_text')) ?></p></div>
                <div class="card reveal" style="--d:90ms" data-tilt><span class="icon-round"><i class="fa-solid fa-eye"></i></span><strong><?= e(t('about.vision')) ?></strong><p class="muted small"><?= e(t('about.vision_text')) ?></p></div>
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
        <?php section_head(t('about.eyebrow'), t('team.title'), t('team.text'), '', '', true); ?>
        <?php team_grid($team); ?>
    </div>
</section>
<?php endif; ?>
<?php why_section(); ?>
<?php cta_band(); ?>
