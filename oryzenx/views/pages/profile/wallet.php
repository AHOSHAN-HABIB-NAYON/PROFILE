<?php /** @var array $u @var array $p @var array $pending @var string $tab */
require VIEWS . '/components/profile-head.php';
$pg = $p;
$icons = ['deposit' => ['fa-arrow-down', 'var(--success)'], 'withdraw' => ['fa-arrow-up', 'var(--danger)'], 'purchase' => ['fa-bag-shopping', 'var(--primary)'],
    'refund' => ['fa-rotate-left', 'var(--info)'], 'adjust' => ['fa-sliders', 'var(--text-muted)']];
?>
<section class="wallet-card">
    <div class="wallet-top">
        <span class="xs"><i class="fa-solid fa-wallet"></i> <?= e(t('wallet.balance')) ?></span>
        <strong class="wallet-amount"><?= money($u['balance']) ?></strong>
        <?php if ((float)$pending['dep'] > 0 || (float)$pending['wd'] > 0): ?>
            <span class="xs wallet-pending"><i class="fa-regular fa-clock"></i>
                <?= (float)$pending['dep'] > 0 ? e(t('wallet.pending_deposit')) . ' ' . money($pending['dep']) : '' ?>
                <?= (float)$pending['wd'] > 0 ? ' · ' . e(t('wallet.pending_withdraw')) . ' ' . money($pending['wd']) : '' ?></span>
        <?php endif; ?>
    </div>
    <div class="wallet-actions">
        <a class="wallet-btn" href="<?= e(url('/profile/wallet/deposit')) ?>"><span><i class="fa-solid fa-plus"></i></span><?= e(t('wallet.deposit')) ?></a>
        <a class="wallet-btn" href="<?= e(url('/profile/wallet/withdraw')) ?>"><span><i class="fa-solid fa-arrow-up"></i></span><?= e(t('wallet.withdraw')) ?></a>
        <a class="wallet-btn" href="<?= e(url('/services')) ?>"><span><i class="fa-solid fa-bag-shopping"></i></span><?= e(t('wallet.shop')) ?></a>
    </div>
</section>

<section class="card mt-2">
    <h2 class="card-title mb-1"><?= e(t('wallet.history')) ?></h2>
    <?php if (!$pg['rows']): ?><div class="empty-sm"><i class="fa-solid fa-receipt"></i><?= e(t('wallet.no_history')) ?></div><?php endif; ?>
    <div class="list">
        <?php foreach ($pg['rows'] as $w): [$ic, $c] = $icons[$w['type']]; $plus = in_array($w['type'], ['deposit', 'refund'], true) || ($w['type'] === 'adjust' && $w['amount'] >= 0); ?>
            <div class="list-item">
                <span class="ic-box ic-box-sm" style="--c:<?= $c ?>"><i class="fa-solid <?= $ic ?>"></i></span>
                <span class="grow" style="min-width:0"><span class="title" style="display:block"><?= e(t('wallet.type_' . $w['type'])) ?></span>
                    <span class="sub truncate" style="display:block"><?= e(implode(' · ', array_filter([Content::methodMap()[$w['method_code']]['name'] ?? null, $w['note'], fmt_date($w['created_at'], true)]))) ?></span>
                    <?php if ($w['admin_note']): ?><span class="xs text-primary" style="display:block"><?= e($w['admin_note']) ?></span><?php endif; ?></span>
                <span class="meta right"><b class="<?= $plus ? 'text-success' : 'text-danger' ?>"><?= $plus ? '+' : '−' ?><?= money(abs((float)$w['amount'])) ?></b><br><?= status_badge($w['status']) ?></span>
            </div>
        <?php endforeach; ?>
    </div>
</section>
<?= paginate_links($pg, '/profile/wallet') ?>
