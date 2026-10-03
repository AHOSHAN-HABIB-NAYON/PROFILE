<?php /** @var array $d @var array $p @var string $q */ $e = $d['entity']; ?>
<div class="admin-head">
    <div><h1><i class="<?= e($d['icon']) ?> text-primary"></i> <?= e(t($d['title'])) ?></h1><p class="muted small mb-0"><?= e(t('admin.total', ['n' => num($p['total'])])) ?></p></div>
    <a class="btn btn-sm btn-primary" href="<?= e(url("/admin/$e/new")) ?>"><i class="fa-solid fa-plus"></i> <?= e(t('admin.add_new')) ?></a>
</div>
<form class="filter-bar" method="get" action="<?= e(url("/admin/$e")) ?>">
    <div class="input-icon grow"><i class="fa-solid fa-magnifying-glass"></i><input class="input" type="search" name="q" value="<?= e($q) ?>" placeholder="<?= e(t('admin.search_ph')) ?>"></div>
    <?php foreach ($d['filters'] ?? [] as $col => $choices): ?>
        <select class="select" name="<?= e($col) ?>" data-component="auto-submit" aria-label="<?= e($col) ?>">
            <option value=""><?= e(t('common.all')) ?></option>
            <?php foreach ($choices as $v => $lbl): ?><option value="<?= e($v) ?>" <?= input($col) === $v ? 'selected' : '' ?>><?= e(t($lbl)) ?></option><?php endforeach; ?>
        </select>
    <?php endforeach; ?>
    <button class="btn btn-outline" type="submit"><?= e(t('search.go')) ?></button>
</form>
<?php if (!$p['rows']): ?>
    <div class="card empty"><i class="<?= e($d['icon']) ?>"></i><?= e(t('common.empty')) ?></div>
<?php else: ?>
<div class="table-wrap">
    <table class="table">
        <thead><tr><?php foreach ($d['list'] as $col => $c): ?><th><?= e(t($c['label'])) ?></th><?php endforeach; ?><th class="right"><?= e(t('admin.actions')) ?></th></tr></thead>
        <tbody>
        <?php foreach ($p['rows'] as $r): ?>
            <tr>
                <?php foreach ($d['list'] as $col => $c): ?>
                    <td><?= isset($c['render']) ? $c['render']($r) : e(is_numeric($r[$col] ?? '') ? num($r[$col]) : ($r[$col] ?? '—')) ?></td>
                <?php endforeach; ?>
                <td class="right nowrap">
                    <?php if (isset($d['view'])): ?><a class="icon-btn icon-btn-sm" href="<?= e($d['view']($r)) ?>" target="_blank" rel="noopener" data-no-spa aria-label="<?= e(t('common.view')) ?>"><i class="fa-solid fa-arrow-up-right-from-square"></i></a><?php endif; ?>
                    <a class="icon-btn icon-btn-sm" href="<?= e(url("/admin/$e/{$r['id']}")) ?>" aria-label="<?= e(t('admin.edit')) ?>"><i class="fa-solid fa-pen"></i></a>
                    <form class="inline-form" method="post" action="<?= e(url("/admin/$e/{$r['id']}/delete")) ?>" data-ajax data-refresh data-confirm="<?= e(t('admin.confirm_delete')) ?>"><?= csrf_field() ?>
                        <button class="icon-btn icon-btn-sm text-danger" type="submit" aria-label="<?= e(t('admin.delete')) ?>"><i class="fa-solid fa-trash"></i></button></form>
                </td>
            </tr>
        <?php endforeach; ?>
        </tbody>
    </table>
</div>
<?= paginate_links($p, "/admin/$e" . ($q !== '' ? '?q=' . rawurlencode($q) : '')) ?>
<?php endif; ?>
