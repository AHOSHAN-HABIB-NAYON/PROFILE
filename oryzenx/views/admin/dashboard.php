<?php /** @var array $s @var array $days @var array $pendingList @var array $latestUsers @var array $topPages */
$delta = $s['prev_users'] > 0 ? (int)round(($s['new_users'] - $s['prev_users']) / $s['prev_users'] * 100) : ($s['new_users'] > 0 ? 100 : 0);
$cards = [
    ['admin.total_users', num($s['users']), 'fa-solid fa-users', '#2563eb', '/admin/users', $delta ? ($delta > 0 ? '+' : '') . num($delta) . '%' : ''],
    ['admin.new_users', num($s['new_users']), 'fa-solid fa-user-plus', '#16a34a', '/admin/users', t('admin.last7')],
    ['admin.page_views', num($s['views']), 'fa-solid fa-eye', '#0ea5e9', '/admin/analytics', t('admin.today') . ' ' . num($s['views_today'])],
    ['admin.unique_visitors', num($s['uniques']), 'fa-solid fa-user-check', '#7c3aed', '/admin/analytics', t('admin.today') . ' ' . num($s['uniques_today'])],
    ['admin.revenue', money($s['revenue_usd']) . ($s['revenue_bdt'] > 0 ? ' · ' . money($s['revenue_bdt'], 'BDT') : ''), 'fa-solid fa-sack-dollar', '#ca8a04', '/admin/payments?status=approved', ''],
    ['admin.payments', num($s['payments']), 'fa-solid fa-wallet', '#db2777', '/admin/payments', ''],
    ['admin.pending_payments', num($s['pending']), 'fa-solid fa-hourglass-half', '#d97706', '/admin/payments?status=pending', ''],
    ['admin.approved_payments', num($s['approved']), 'fa-solid fa-circle-check', '#16a34a', '/admin/payments?status=approved', ''],
    ['admin.posts', num($s['posts']), 'fa-solid fa-newspaper', '#0891b2', '/admin/posts', ''],
    ['admin.services', num($s['services']), 'fa-solid fa-layer-group', '#4f46e5', '/admin/services', ''],
    ['admin.categories', num($s['categories']), 'fa-solid fa-folder-tree', '#475569', '/admin/categories', ''],
    ['admin.support', num($s['support']), 'fa-solid fa-inbox', '#e11d48', '/admin/messages', $s['support_new'] ? num($s['support_new']) . ' ' . t('status.new') : ''],
    ['admin.ai_requests', num($s['ai']), 'fa-solid fa-robot', '#10a37f', '/admin/ai-logs', t('admin.today') . ' ' . num($s['ai_today'])],
];
?>
<div class="admin-head">
    <div><h1><?= e(t('admin.dashboard')) ?></h1><p class="muted small mb-0"><?= e(t('admin.welcome', ['name' => auth()['name']])) ?></p></div>
    <div class="row-gap"><a class="btn btn-sm btn-primary" href="<?= e(url('/admin/posts/new')) ?>"><i class="fa-solid fa-plus"></i> <?= e(t('admin.new_post')) ?></a>
        <a class="btn btn-sm btn-outline" href="<?= e(url('/admin/notifications')) ?>"><i class="fa-solid fa-paper-plane"></i> <?= e(t('admin.notify')) ?></a></div>
</div>
<div class="stat-grid">
    <?php foreach ($cards as [$label, $value, $icon, $color, $href, $sub]): ?>
        <a class="stat card-link" href="<?= e(url($href)) ?>">
            <span class="label"><span class="ic-box ic-box-sm" style="--c:<?= $color ?>"><i class="<?= $icon ?>"></i></span><?= e(t($label)) ?></span>
            <span class="value"><?= $value ?></span>
            <?php if ($sub): ?><span class="delta<?= str_starts_with($sub, '-') ? ' down' : '' ?>" style="color:var(--text-muted)"><?= e($sub) ?></span><?php endif; ?>
        </a>
    <?php endforeach; ?>
</div>

<div class="admin-grid mt-2">
    <section class="card chart-card">
        <div class="card-head"><h2 class="card-title"><?= e(t('admin.traffic14')) ?></h2><a class="small" href="<?= e(url('/admin/analytics')) ?>"><?= e(t('common.view_all')) ?></a></div>
        <div class="chart" data-component="chart" data-type="area" data-series='<?= e(json_encode(['labels' => array_column($days, 'label'), 'sets' => [['name' => t('admin.page_views'), 'data' => array_column($days, 'views')], ['name' => t('admin.unique_visitors'), 'data' => array_column($days, 'uniques')]]])) ?>'></div>
    </section>
    <section class="card">
        <div class="card-head"><h2 class="card-title"><?= e(t('admin.pending_payments')) ?></h2><a class="small" href="<?= e(url('/admin/payments?status=pending')) ?>"><?= e(t('common.view_all')) ?></a></div>
        <?php if (!$pendingList): ?><div class="empty-sm"><i class="fa-regular fa-circle-check"></i><?= e(t('admin.no_pending')) ?></div><?php endif; ?>
        <div class="list">
            <?php foreach ($pendingList as $p): ?>
                <a class="list-item" href="<?= e(url('/admin/payments/' . $p['id'])) ?>"><span class="ic-box ic-box-sm" style="--c:var(--warning)"><i class="fa-solid fa-hourglass-half"></i></span>
                    <span class="grow" style="min-width:0"><span class="title truncate" style="display:block"><?= e($p['name']) ?> · <?= e($p['service_title']) ?></span><span class="sub"><?= e($p['method_code']) ?> · <?= e(time_ago($p['created_at'])) ?></span></span>
                    <span class="meta bold"><?= money($p['amount'], $p['currency']) ?></span></a>
            <?php endforeach; ?>
        </div>
    </section>
    <section class="card">
        <div class="card-head"><h2 class="card-title"><?= e(t('admin.latest_users')) ?></h2><a class="small" href="<?= e(url('/admin/users')) ?>"><?= e(t('common.view_all')) ?></a></div>
        <div class="list">
            <?php foreach ($latestUsers as $u): ?>
                <a class="list-item" href="<?= e(url('/admin/users/' . $u['id'])) ?>"><?= avatar_html($u, 'avatar-sm') ?><span class="grow" style="min-width:0"><span class="title truncate" style="display:block"><?= e($u['name']) ?></span><span class="sub truncate" style="display:block"><?= e($u['email']) ?></span></span><span class="meta"><?= e(time_ago($u['created_at'])) ?></span></a>
            <?php endforeach; ?>
        </div>
    </section>
    <section class="card">
        <div class="card-head"><h2 class="card-title"><?= e(t('admin.top_pages')) ?></h2></div>
        <?php if (!$topPages): ?><div class="empty-sm"><?= e(t('common.empty')) ?></div><?php endif; ?>
        <?php $max = max([1, ...array_column($topPages, 'c')]); foreach ($topPages as $tp): ?>
            <div class="bar-row"><span class="truncate"><?= e($tp['path']) ?></span><span class="bar"><i style="width:<?= round($tp['c'] / $max * 100) ?>%"></i></span><b><?= num($tp['c']) ?></b></div>
        <?php endforeach; ?>
    </section>
</div>
