<?php /** @var array $p @var string $type @var string $status @var array $methods */ ?>
<div class="admin-head"><div><h1><i class="fa-solid fa-wallet text-primary"></i> <?= e(t('wallet.admin_title')) ?></h1><p class="muted small mb-0"><?= e(t('admin.total', ['n' => num($p['total'])])) ?></p></div></div>
<nav class="chips">
    <?php foreach (['' => 'common.all', 'deposit' => 'wallet.type_deposit', 'withdraw' => 'wallet.type_withdraw'] as $v => $l): ?>
        <a class="chip<?= $type === $v ? ' active' : '' ?>" href="<?= e(url('/admin/wallet' . ($v ? '?type=' . $v : ''))) ?>"><?= e(t($l)) ?></a>
    <?php endforeach; ?>
    <?php foreach (['pending', 'approved', 'rejected'] as $st): ?>
        <a class="chip<?= $status === $st ? ' active' : '' ?>" href="<?= e(url('/admin/wallet?status=' . $st . ($type ? '&type=' . $type : ''))) ?>"><?= e(t('status.' . $st)) ?></a>
    <?php endforeach; ?>
</nav>
<?php if (!$p['rows']): ?><div class="card empty"><i class="fa-solid fa-wallet"></i><?= e(t('common.empty')) ?></div><?php endif; ?>
<div class="admin-grid">
<?php foreach ($p['rows'] as $w): $m = $methods[$w['method_code']] ?? null; ?>
    <section class="card">
        <div class="between mb-1">
            <strong><?= e(t('wallet.type_' . $w['type'])) ?> #<?= (int)$w['id'] ?></strong>
            <?= status_badge($w['status']) ?>
        </div>
        <dl class="kv">
            <dt><?= e(t('admin.user')) ?></dt><dd><a href="<?= e(url('/admin/users/' . $w['user_id'])) ?>"><?= e($w['name']) ?></a><br><small class="muted"><?= e($w['email']) ?> · <?= e(t('admin.balance')) ?> <?= money($w['balance']) ?></small></dd>
            <dt><?= e(t('profile.amount')) ?></dt><dd class="bold <?= $w['type'] === 'deposit' ? 'text-success' : 'text-danger' ?>"><?= money($w['amount']) ?><?php if ((float)setting('usd_to_bdt') > 0): ?> <small class="muted">≈ <?= money(round($w['amount'] * (float)setting('usd_to_bdt')), 'BDT') ?></small><?php endif; ?></dd>
            <dt><?= e(t('profile.method')) ?></dt><dd><?= e($m['name'] ?? $w['method_code']) ?></dd>
            <?php if ($w['account']): ?><dt><?= e(t('wallet.account')) ?></dt><dd class="mono"><?= e($w['account']) ?> <button class="icon-btn icon-btn-sm" type="button" data-action="copy" data-copy="<?= e($w['account']) ?>"><i class="fa-regular fa-copy"></i></button></dd><?php endif; ?>
            <?php if ($w['transaction_id']): ?><dt><?= e(t('profile.txn')) ?></dt><dd class="mono"><?= e($w['transaction_id']) ?></dd><?php endif; ?>
            <dt><?= e(t('profile.date')) ?></dt><dd><?= e(fmt_date($w['created_at'], true)) ?></dd>
        </dl>
        <?php if ($w['screenshot']): ?><a href="<?= e(url('/files/wallet/' . $w['id'])) ?>" target="_blank" rel="noopener" data-no-spa><img class="shot mt-1" style="max-height:220px" src="<?= e(url('/files/wallet/' . $w['id'])) ?>" alt="" loading="lazy"></a><?php endif; ?>
        <?php if ($w['status'] === 'pending'): ?>
            <form class="form mt-1" method="post" action="<?= e(url('/admin/wallet/' . $w['id'])) ?>" data-ajax data-refresh>
                <?= csrf_field() ?>
                <input class="input" name="admin_note" placeholder="<?= e(t('profile.admin_note')) ?>" maxlength="1000">
                <div class="row-gap">
                    <button class="btn btn-sm btn-success" type="submit" name="action" value="approve"><i class="fa-solid fa-check"></i> <?= e($w['type'] === 'withdraw' ? t('wallet.mark_paid') : t('wallet.approve_credit')) ?></button>
                    <button class="btn btn-sm btn-danger" type="submit" name="action" value="reject"><i class="fa-solid fa-xmark"></i> <?= e(t('status.rejected')) ?></button>
                </div>
            </form>
        <?php elseif ($w['admin_note']): ?><p class="xs muted mt-1 mb-0"><?= e($w['admin_note']) ?></p><?php endif; ?>
    </section>
<?php endforeach; ?>
</div>
<?= paginate_links($p, '/admin/wallet?' . http_build_query(array_filter(['type' => $type, 'status' => $status]))) ?>
