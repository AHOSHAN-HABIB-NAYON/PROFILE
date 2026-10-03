<?php /** @var string $q @var array $groups */ ?>
<div class="page-head"><h1><?= e(t('search.title')) ?></h1></div>
<form method="get" action="<?= e(url('/search')) ?>" class="input-group mb-2" role="search">
    <div class="input-icon grow"><i class="fa-solid fa-magnifying-glass"></i><input class="input" type="search" name="q" value="<?= e($q) ?>" placeholder="<?= e(t('search.placeholder')) ?>" aria-label="<?= e(t('search.title')) ?>" minlength="2" required></div>
    <button class="btn btn-primary" type="submit"><?= e(t('search.go')) ?></button>
</form>
<?php if ($q !== '' && !$groups): ?><div class="empty"><i class="fa-solid fa-magnifying-glass"></i><?= e(t('js.no_results')) ?></div><?php endif; ?>
<?php foreach ($groups as $g): ?>
    <section class="card section">
        <h2 class="card-title mb-1"><?= e($g['label']) ?> <span class="badge"><?= num(count($g['items'])) ?></span></h2>
        <div class="list">
            <?php foreach ($g['items'] as $it): ?>
                <a class="list-item" href="<?= e($it['url']) ?>"><span class="ic-box ic-box-sm"><i class="<?= e($it['icon']) ?>"></i></span>
                    <span class="grow" style="min-width:0"><span class="title truncate" style="display:block"><?= e($it['title']) ?></span><?php if ($it['sub']): ?><span class="sub truncate" style="display:block"><?= e($it['sub']) ?></span><?php endif; ?></span></a>
            <?php endforeach; ?>
        </div>
    </section>
<?php endforeach; ?>
