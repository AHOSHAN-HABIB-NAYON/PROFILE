<?php /** @var array $u @var array $p @var string $status @var array $methods @var string $tab */
require VIEWS . '/components/profile-head.php';
$pg = $p;
?>
<nav class="chips">
    <?php foreach (['' => 'common.all', 'pending' => 'status.pending', 'approved' => 'status.approved', 'rejected' => 'status.rejected', 'refunded' => 'status.refunded'] as $v => $l): ?>
        <a class="chip<?= $status === $v ? ' active' : '' ?>" href="<?= e(url('/profile/payments' . ($v ? '?status=' . $v : ''))) ?>"><?= e(t($l)) ?></a>
    <?php endforeach; ?>
</nav>
<section class="card">
    <?php if (!$pg['rows']): ?>
        <div class="empty"><i class="fa-solid fa-receipt"></i><?= e(t('profile.no_payments')) ?><br><a class="btn btn-sm btn-primary mt-1" href="<?= e(url('/services')) ?>"><?= e(t('home.explore')) ?></a></div>
    <?php endif; ?>
    <div class="list"><?php foreach ($pg['rows'] as $p) require VIEWS . '/components/payment-row.php'; ?></div>
</section>
<?= paginate_links($pg, '/profile/payments' . ($status ? '?status=' . $status : '')) ?>
