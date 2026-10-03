<?php /** @var array $projects @var array $cats */ ?>
<section class="projects-hero card">
    <span class="projects-hero-ic"><i class="fa-solid fa-briefcase"></i></span>
    <div>
        <h1><?= e(t('projects.title')) ?></h1>
        <p class="muted small mb-0"><?= e(t('projects.sub')) ?></p>
    </div>
    <span class="projects-total"><strong><?= num(count($projects)) ?>+</strong><small><?= e(t('projects.done')) ?></small></span>
</section>
<?php if ($cats): ?>
    <div class="chips" data-component="project-filter">
        <button type="button" class="chip active" data-cat=""><?= e(t('common.all')) ?></button>
        <?php foreach ($cats as $c): ?><button type="button" class="chip" data-cat="<?= e($c) ?>"><?= e($c) ?></button><?php endforeach; ?>
    </div>
<?php endif; ?>
<?php if ($projects): ?>
    <div class="project-grid">
        <?php foreach ($projects as $p) require VIEWS . '/components/project-card.php'; ?>
    </div>
<?php else: ?>
    <div class="empty card"><i class="fa-solid fa-briefcase"></i><p><?= e(t('projects.empty')) ?></p></div>
<?php endif; ?>
<section class="section cta mt-3">
    <div><h2><?= e(t('projects.cta_title')) ?></h2><p class="mb-0"><?= e(t('projects.cta_text')) ?></p></div>
    <a class="btn btn-sm btn-white" href="<?= e(url('/contact')) ?>"><i class="fa-solid fa-paper-plane"></i> <?= e(t('home.promo_cta')) ?></a>
</section>
