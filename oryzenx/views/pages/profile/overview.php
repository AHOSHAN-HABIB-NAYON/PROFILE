<?php /** @var array $u @var array $stats @var int $services @var array $recent @var array $activity @var array $security @var string $tab */
require VIEWS . '/components/profile-head.php';
$spent = money($stats['spent_usd']) . ((float)$stats['spent_bdt'] > 0 ? ' + ' . money($stats['spent_bdt'], 'BDT') : '');
?>
<div class="grid grid-2 md-grid-4">
    <div class="stat"><span class="label"><i class="fa-solid fa-user-shield"></i> <?= e(t('profile.account_status')) ?></span><span class="value small-value"><?= status_badge($u['status']) ?></span></div>
    <div class="stat"><span class="label"><i class="fa-solid fa-receipt"></i> <?= e(t('profile.total_payments')) ?></span><span class="value"><?= num((int)$stats['total']) ?></span></div>
    <div class="stat"><span class="label"><i class="fa-solid fa-circle-check"></i> <?= e(t('profile.approved')) ?></span><span class="value text-success"><?= num((int)$stats['approved']) ?></span></div>
    <div class="stat"><span class="label"><i class="fa-solid fa-hourglass-half"></i> <?= e(t('profile.pending')) ?></span><span class="value text-warning"><?= num((int)$stats['pending']) ?></span></div>
    <div class="stat"><span class="label"><i class="fa-solid fa-box"></i> <?= e(t('profile.services_bought')) ?></span><span class="value"><?= num($services) ?></span></div>
    <div class="stat"><span class="label"><i class="fa-solid fa-sack-dollar"></i> <?= e(t('profile.total_spent')) ?></span><span class="value"><?= $spent ?></span></div>
    <a class="stat card-link" href="<?= e(url('/profile/wallet')) ?>"><span class="label"><i class="fa-solid fa-wallet"></i> <?= e(t('admin.balance')) ?></span><span class="value"><?= money($u['balance']) ?></span></a>
    <a class="stat card-link" href="<?= e(url('/profile/security')) ?>"><span class="label"><i class="fa-solid fa-shield-halved"></i> <?= e(t('profile.security_score')) ?></span><span class="value <?= $security['score'] >= 60 ? 'text-success' : 'text-warning' ?>"><?= num($security['score']) ?>%</span></a>
</div>

<div class="profile-cols mt-2">
    <section class="card">
        <div class="card-head"><h2 class="card-title"><?= e(t('profile.recent_payments')) ?></h2><a class="small" href="<?= e(url('/profile/payments')) ?>"><?= e(t('common.view_all')) ?></a></div>
        <?php if (!$recent): ?>
            <div class="empty-sm"><i class="fa-solid fa-receipt"></i><?= e(t('profile.no_payments')) ?><br><a class="btn btn-sm btn-primary mt-1" href="<?= e(url('/services')) ?>"><?= e(t('home.explore')) ?></a></div>
        <?php endif; ?>
        <div class="list">
            <?php foreach ($recent as $p) require VIEWS . '/components/payment-row.php'; ?>
        </div>
    </section>
    <section class="card">
        <h2 class="card-title mb-1"><?= e(t('profile.activity')) ?></h2>
        <?php if (!$activity): ?><div class="empty-sm"><?= e(t('common.empty')) ?></div><?php endif; ?>
        <div class="list">
            <?php foreach ($activity as $a): ?>
                <div class="list-item"><span class="ic-box ic-box-sm"><i class="fa-solid fa-clock-rotate-left"></i></span><span class="grow"><span class="title" style="display:block"><?= e(t('act.' . $a['action'])) ?></span><?php if ($a['details']): ?><span class="sub"><?= e(str_limit($a['details'], 60)) ?></span><?php endif; ?></span><span class="meta"><?= e(time_ago($a['created_at'])) ?></span></div>
            <?php endforeach; ?>
        </div>
    </section>
</div>
