<?php
$title = t('nav.portfolio');
$projects = rows('SELECT * FROM projects WHERE active = 1 ORDER BY sort, id');
page_hero(t('portfolio.title'), t('portfolio.sub'));
?>
<section class="section pt-0">
    <div class="container">
        <?php portfolio_grid($projects); ?>
    </div>
</section>
<?php cta_band(); ?>
