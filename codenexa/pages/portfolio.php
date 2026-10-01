<?php
$title = t('nav.portfolio');
$projects = rows('SELECT * FROM projects WHERE active = 1 ORDER BY sort, id');
page_hero(t('portfolio.eyebrow'), t('portfolio.title'), t('portfolio.sub'), [[t('nav.portfolio')]]);
?>
<section class="section band-dark portfolio-sec pt-sm">
    <div class="container">
        <?php portfolio_grid($projects); ?>
    </div>
</section>
<?php tech_marquee(); ?>
<?php cta_band(); ?>
