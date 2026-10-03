<?php /** @var array $p @var string $status @var string $q @var array $counts @var array $methods */ ?>
<div class="admin-head"><div><h1><i class="fa-solid fa-wallet text-primary"></i> <?= e(t('admin.payments')) ?></h1><p class="muted small mb-0"><?= e(t('admin.total', ['n' => num($p['total'])])) ?></p></div></div>
<nav class="chips">
    <?php foreach (['' => 'common.all', 'pending' => 'status.pending', 'approved' => 'status.approved', 'rejected' => 'status.rejected', 'refunded' => 'status.refunded'] as $v => $l): ?>
        <a class="chip<?= $status === $v ? ' active' : '' ?>" href="<?= e(url('/admin/payments' . ($v ? '?status=' . $v : ''))) ?>"><?= e(t($l)) ?><?php if ($v && !empty($counts[$v])): ?> <span class="badge"><?= num($counts[$v]) ?></span><?php endif; ?></a>
    <?php endforeach; ?>
</nav>
<form class="filter-bar" method="get" action="<?= e(url('/admin/payments')) ?>">
    <?php if ($status): ?><input type="hidden" name="status" value="<?= e($status) ?>"><?php endif; ?>
    <div class="input-icon grow"><i class="fa-solid fa-magnifying-glass"></i><input class="input" type="search" name="q" value="<?= e($q) ?>" placeholder="<?= e(t('admin.payment_search_ph')) ?>"></div>
    <button class="btn btn-outline" type="submit"><?= e(t('search.go')) ?></button>
</form>
<div class="table-wrap">
    <table class="table">
        <thead><tr><th>#</th><th><?= e(t('admin.user')) ?></th><th><?= e(t('profile.service')) ?></th><th><?= e(t('profile.amount')) ?></th><th><?= e(t('profile.method')) ?></th><th><?= e(t('profile.txn')) ?></th><th><?= e(t('admin.status')) ?></th><th><?= e(t('profile.date')) ?></th></tr></thead>
        <tbody>
        <?php foreach ($p['rows'] as $r): $m = $methods[$r['method_code']] ?? null; ?>
            <tr class="row-link" data-href="<?= e(url('/admin/payments/' . $r['id'])) ?>">
                <td><a href="<?= e(url('/admin/payments/' . $r['id'])) ?>"><?= (int)$r['id'] ?></a></td>
                <td><strong><?= e($r['name']) ?></strong><br><small class="muted"><?= e($r['email']) ?></small></td>
                <td><?= e(str_limit($r['service_title'], 40)) ?><br><small class="muted mono"><?= e($r['order_no']) ?></small></td>
                <td class="nowrap bold"><?= money($r['amount'], $r['currency']) ?></td>
                <td class="nowrap"><?php if ($m): ?><img src="<?= e(Content::media($m['logo'])) ?>" width="18" height="18" alt="" style="display:inline;vertical-align:middle"> <?= e($m['name']) ?><?php else: ?><?= e($r['method_code']) ?><?php endif; ?></td>
                <td class="mono xs"><?= e(str_limit($r['transaction_id'], 22)) ?></td>
                <td><?= status_badge($r['status']) ?></td>
                <td class="nowrap"><?= e(fmt_date($r['created_at'], true)) ?></td>
            </tr>
        <?php endforeach; ?>
        <?php if (!$p['rows']): ?><tr><td colspan="8" class="center muted"><?= e(t('common.empty')) ?></td></tr><?php endif; ?>
        </tbody>
    </table>
</div>
<?= paginate_links($p, '/admin/payments?' . http_build_query(array_filter(['q' => $q, 'status' => $status]))) ?>
