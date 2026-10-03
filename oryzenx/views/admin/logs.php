<?php /** @var array $files @var ?string $current @var array $lines @var array $activity */ ?>
<div class="admin-head">
    <div><h1><i class="fa-solid fa-file-lines text-primary"></i> <?= e(t('admin.logs')) ?></h1><p class="muted small mb-0"><?= e(t('admin.logs_d')) ?></p></div>
    <?php if ($files): ?><form method="post" action="<?= e(url('/admin/logs/clear')) ?>" data-ajax data-confirm="<?= e(t('admin.confirm_clear_logs')) ?>"><?= csrf_field() ?><button class="btn btn-sm btn-outline text-danger" type="submit"><i class="fa-solid fa-trash"></i> <?= e(t('admin.clear_logs')) ?></button></form><?php endif; ?>
</div>
<div class="admin-grid">
    <section class="card">
        <div class="card-head"><h2 class="card-title"><?= e(t('admin.error_logs')) ?></h2>
            <?php if ($files): ?><form method="get" action="<?= e(url('/admin/logs')) ?>"><select class="select" name="file" data-component="auto-submit" aria-label="file"><?php foreach ($files as $f): ?><option <?= $f === $current ? 'selected' : '' ?>><?= e($f) ?></option><?php endforeach; ?></select></form><?php endif; ?></div>
        <?php if (!$lines): ?><div class="empty-sm"><i class="fa-regular fa-face-smile"></i><?= e(t('admin.no_logs')) ?></div><?php else: ?>
            <pre class="log-view"><?php foreach ($lines as $l): ?><?= e($l) ?>
<?php endforeach; ?></pre>
        <?php endif; ?>
    </section>
    <section class="card">
        <h2 class="card-title mb-1"><?= e(t('admin.activity')) ?></h2>
        <div class="list"><?php foreach ($activity as $a): ?>
            <div class="list-item"><span class="grow" style="min-width:0"><span class="title mono xs" style="display:block"><?= e($a['action']) ?></span><span class="sub truncate" style="display:block"><?= e($a['name'] ?? '—') ?> · <?= e($a['details']) ?> · <?= e($a['ip']) ?></span></span><span class="meta"><?= e(time_ago($a['created_at'])) ?></span></div>
        <?php endforeach; ?></div>
    </section>
</div>
