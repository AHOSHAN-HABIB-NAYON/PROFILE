<?php /** @var array $p @var string $q @var string $status */ ?>
<div class="admin-head"><div><h1><i class="fa-solid fa-users text-primary"></i> <?= e(t('admin.users')) ?></h1><p class="muted small mb-0"><?= e(t('admin.total', ['n' => num($p['total'])])) ?></p></div></div>
<form class="filter-bar" method="get" action="<?= e(url('/admin/users')) ?>">
    <div class="input-icon grow"><i class="fa-solid fa-magnifying-glass"></i><input class="input" type="search" name="q" value="<?= e($q) ?>" placeholder="<?= e(t('admin.user_search_ph')) ?>"></div>
    <select class="select" name="status" data-component="auto-submit" aria-label="<?= e(t('admin.status')) ?>">
        <?php foreach (['' => 'common.all', 'active' => 'status.active', 'banned' => 'status.banned', 'suspended' => 'status.suspended', 'deleted' => 'admin.deleted_users', 'admin' => 'admin.admins', 'unverified' => 'admin.unverified'] as $v => $l): ?>
            <option value="<?= $v ?>" <?= $status === $v ? 'selected' : '' ?>><?= e(t($l)) ?></option>
        <?php endforeach; ?>
    </select>
    <button class="btn btn-outline" type="submit"><?= e(t('search.go')) ?></button>
</form>
<div class="table-wrap">
    <table class="table">
        <thead><tr><th><?= e(t('admin.user')) ?></th><th><?= e(t('admin.status')) ?></th><th><?= e(t('admin.payments')) ?></th><th><?= e(t('admin.joined')) ?></th><th><?= e(t('admin.last_login')) ?></th><th></th></tr></thead>
        <tbody>
        <?php foreach ($p['rows'] as $u): ?>
            <tr>
                <td><a class="row" href="<?= e(url('/admin/users/' . $u['id'])) ?>" style="color:inherit"><?= avatar_html($u, 'avatar-sm') ?><span><strong><?= e($u['name']) ?></strong> <?= $u['role'] === 'admin' ? '<span class="badge badge-primary">Admin</span>' : '' ?><br><small class="muted"><?= e($u['email']) ?></small></span></a></td>
                <td><?= $u['deleted_at'] ? '<span class="badge badge-danger">' . e(t('admin.deleted')) . '</span>' : status_badge($u['status']) ?> <?= $u['email_verified_at'] ? '<i class="fa-solid fa-circle-check text-success" title="verified"></i>' : '' ?></td>
                <td><?= num($u['pay_count']) ?></td>
                <td class="nowrap"><?= e(fmt_date($u['created_at'])) ?></td>
                <td class="nowrap"><?= e($u['last_login_at'] ? time_ago($u['last_login_at']) : '—') ?></td>
                <td class="right"><a class="btn btn-xs btn-outline" href="<?= e(url('/admin/users/' . $u['id'])) ?>"><?= e(t('common.view')) ?></a></td>
            </tr>
        <?php endforeach; ?>
        <?php if (!$p['rows']): ?><tr><td colspan="6" class="center muted"><?= e(t('common.empty')) ?></td></tr><?php endif; ?>
        </tbody>
    </table>
</div>
<?= paginate_links($p, '/admin/users?' . http_build_query(array_filter(['q' => $q, 'status' => $status]))) ?>
