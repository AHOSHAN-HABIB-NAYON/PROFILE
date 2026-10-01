<?php
$title = t('nav.services');
$services = rows('SELECT * FROM services WHERE active = 1 ORDER BY sort, id');
page_hero(t('services.eyebrow'), t('services.sub'));
?>
<section class="section pt-0">
    <div class="container">
        <label class="search reveal">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="search" placeholder="<?= e(t('services.search')) ?>" data-search-input aria-label="<?= e(t('services.search')) ?>">
        </label>
        <?php services_grid($services, true); ?>
    </div>
</section>
<?php why_section(); ?>
<?php cta_band(); ?>
