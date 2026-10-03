<?php /** @var array $p */ ?>
<div class="admin-head">
    <div><h1><i class="fa-solid fa-robot text-primary"></i> <?= e(t('admin.ai_logs')) ?></h1><p class="muted small mb-0"><?= e(Assistant::aiReady() ? t('admin.ai_live') : t('admin.ai_local')) ?></p></div>
    <a class="btn btn-sm btn-outline" href="<?= e(url('/admin/settings/ai')) ?>"><i class="fa-solid fa-gear"></i> <?= e(t('set.ai')) ?></a>
</div>
<div class="card card-flush"><div class="list">
    <?php foreach ($p['rows'] as $m): ?>
        <div class="list-item ai-log <?= $m['role'] ?>">
            <span class="ic-box ic-box-sm" style="--c:<?= $m['role'] === 'user' ? 'var(--primary)' : 'var(--accent)' ?>"><i class="fa-solid <?= $m['role'] === 'user' ? 'fa-user' : 'fa-robot' ?>"></i></span>
            <span class="grow" style="min-width:0"><span class="xs muted"><?= e($m['role'] === 'user' ? ($m['name'] ?? t('admin.guest')) : 'AI · ' . ($m['source'] ?? '')) ?> · #<?= (int)$m['conversation_id'] ?></span><span class="small" style="display:block;white-space:pre-wrap"><?= e(str_limit($m['content'], 400)) ?></span></span>
            <span class="meta"><?= e(time_ago($m['created_at'])) ?></span>
        </div>
    <?php endforeach; ?>
    <?php if (!$p['rows']): ?><div class="empty"><i class="fa-regular fa-comments"></i><?= e(t('common.empty')) ?></div><?php endif; ?>
</div></div>
<?= paginate_links($p, '/admin/ai-logs') ?>
