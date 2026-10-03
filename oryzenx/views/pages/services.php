<?php /** @var array $categories @var array $services @var string $cat */ ?>
<div data-component="filter">
    <div class="page-head">
        <h1><?= e(t('services.title')) ?></h1>
        <p><?= e(t('services.sub', ['n' => num(count($services))])) ?></p>
    </div>
    <div class="input-icon mb-1">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input class="input" type="search" data-filter-q placeholder="<?= e(t('services.search')) ?>" aria-label="<?= e(t('services.search')) ?>">
    </div>
    <div class="chips" role="toolbar" aria-label="<?= e(t('search.categories')) ?>">
        <button type="button" class="chip<?= $cat === '' ? ' active' : '' ?>" data-filter-cat="" aria-pressed="<?= $cat === '' ? 'true' : 'false' ?>"><?= e(t('common.all')) ?></button>
        <?php foreach ($categories as $c): ?>
            <button type="button" class="chip<?= $cat === $c['slug'] ? ' active' : '' ?>" data-filter-cat="<?= e($c['slug']) ?>" aria-pressed="<?= $cat === $c['slug'] ? 'true' : 'false' ?>"><?= icon_html($c['icon']) ?> <?= e(tr($c, 'name')) ?></button>
        <?php endforeach; ?>
    </div>
    <div class="svc-grid">
        <?php foreach ($services as $s) require VIEWS . '/components/service-card.php'; ?>
    </div>
    <div class="empty" data-filter-empty hidden><i class="fa-solid fa-box-open"></i><?= e(t('services.none')) ?></div>
    <div class="card mt-2 between custom-cta">
        <div><strong><?= e(t('services.custom')) ?></strong><p class="muted small mb-0"><?= e(t('services.custom_d')) ?></p></div>
        <a class="btn btn-sm btn-primary" href="<?= e(url('/contact?subject=' . rawurlencode(t('services.custom')))) ?>"><?= e(t('home.contact')) ?></a>
    </div>
</div>
