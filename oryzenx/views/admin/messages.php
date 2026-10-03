<?php /** @var array $p @var string $status */ ?>
<div class="admin-head"><div><h1><i class="fa-solid fa-inbox text-primary"></i> <?= e(t('admin.messages')) ?></h1><p class="muted small mb-0"><?= e(t('admin.total', ['n' => num($p['total'])])) ?></p></div></div>
<nav class="chips">
    <?php foreach (['' => 'common.all', 'new' => 'status.new', 'read' => 'status.read', 'replied' => 'status.replied', 'closed' => 'status.closed'] as $v => $l): ?>
        <a class="chip<?= $status === $v ? ' active' : '' ?>" href="<?= e(url('/admin/messages' . ($v ? '?status=' . $v : ''))) ?>"><?= e(t($l)) ?></a>
    <?php endforeach; ?>
</nav>
<div class="card card-flush"><div class="list">
    <?php foreach ($p['rows'] as $m): ?>
        <a class="list-item msg-row<?= $m['status'] === 'new' ? ' unread' : '' ?>" href="<?= e(url('/admin/messages/' . $m['id'])) ?>">
            <?= avatar_html(['name' => $m['name'], 'email' => $m['email']], 'avatar-sm') ?>
            <span class="grow" style="min-width:0"><span class="title truncate" style="display:block"><?= e($m['subject']) ?></span><span class="sub truncate" style="display:block"><?= e($m['name']) ?> · <?= e(str_limit($m['message'], 80)) ?></span></span>
            <span class="meta"><?= status_badge($m['status']) ?><br><?= e(time_ago($m['created_at'])) ?></span>
        </a>
    <?php endforeach; ?>
    <?php if (!$p['rows']): ?><div class="empty"><i class="fa-regular fa-envelope-open"></i><?= e(t('common.empty')) ?></div><?php endif; ?>
</div></div>
<?= paginate_links($p, '/admin/messages' . ($status ? '?status=' . $status : '')) ?>
