<?php /** @var array $u @var array $pay @var ?array $method @var string $tab */
require VIEWS . '/components/profile-head.php';
$done = in_array($pay['status'], ['approved', 'rejected', 'refunded'], true);
?>
<a class="back-link" href="<?= e(url('/profile/payments')) ?>"><i class="fa-solid fa-arrow-left"></i> <?= e(t('profile.payments')) ?></a>
<div class="profile-cols">
    <section class="card">
        <div class="between mb-1"><h2 class="card-title"><?= e(t('profile.payment')) ?> #<?= (int)$pay['id'] ?></h2><?= status_badge($pay['status']) ?></div>
        <ol class="timeline">
            <li class="done"><i class="fa-solid fa-paper-plane"></i><span><?= e(t('profile.tl_submitted')) ?><small><?= e(fmt_date($pay['created_at'], true)) ?></small></span></li>
            <li class="<?= $pay['status'] === 'pending' ? 'current' : 'done' ?>"><i class="fa-solid fa-magnifying-glass"></i><span><?= e(t('profile.tl_review')) ?><small><?= e($pay['status'] === 'pending' ? t('profile.tl_review_d') : fmt_date($pay['reviewed_at'], true)) ?></small></span></li>
            <li class="<?= $done ? 'done ' . $pay['status'] : '' ?>"><i class="fa-solid <?= $pay['status'] === 'rejected' ? 'fa-circle-xmark' : ($pay['status'] === 'refunded' ? 'fa-rotate-left' : 'fa-circle-check') ?>"></i><span><?= e($done ? t('status.' . $pay['status']) : t('status.approved') . ' / ' . t('status.rejected')) ?></span></li>
        </ol>
        <dl class="kv mt-2">
            <dt><?= e(t('profile.service')) ?></dt><dd><?= $pay['slug'] ? '<a href="' . e(url('/services/' . $pay['slug'])) . '">' . e($pay['service_title']) . '</a>' : e($pay['service_title']) ?></dd>
            <dt><?= e(t('profile.order')) ?></dt><dd class="mono"><?= e($pay['order_no']) ?> <?= status_badge($pay['order_status']) ?></dd>
            <dt><?= e(t('profile.amount')) ?></dt><dd class="bold text-primary"><?= money($pay['amount'], $pay['currency']) ?></dd>
            <dt><?= e(t('profile.method')) ?></dt><dd><?php if ($method): ?><img src="<?= e(Content::media($method['logo'])) ?>" alt="" width="18" height="18" style="display:inline;vertical-align:-3px"> <?= e($method['name']) ?><?php else: ?><?= e($pay['method_code']) ?><?php endif; ?></dd>
            <dt><?= e(t('profile.txn')) ?></dt><dd class="mono"><?= e($pay['transaction_id']) ?></dd>
            <?php if ($pay['sender']): ?><dt><?= e(t('payment.sender')) ?></dt><dd class="mono"><?= e($pay['sender']) ?></dd><?php endif; ?>
            <dt><?= e(t('profile.date')) ?></dt><dd><?= e(fmt_date($pay['created_at'], true)) ?></dd>
            <dt><?= e(t('admin.status')) ?></dt><dd><?= status_badge($pay['status']) ?></dd>
            <?php if ($pay['note']): ?><dt><?= e(t('payment.note')) ?></dt><dd><?= nl2br(e($pay['note'])) ?></dd><?php endif; ?>
        </dl>
        <?php if ($pay['admin_note']): ?>
            <div class="alert alert-info mt-2"><i class="fa-solid fa-user-shield"></i><span><strong><?= e(t('profile.admin_note')) ?>:</strong> <?= nl2br(e($pay['admin_note'])) ?></span></div>
        <?php endif; ?>
    </section>
    <section class="card">
        <h2 class="card-title mb-1"><?= e(t('profile.screenshot')) ?></h2>
        <?php if ($pay['screenshot']): ?>
            <a href="<?= e(url('/files/payment/' . $pay['id'])) ?>" target="_blank" rel="noopener" data-no-spa><img class="shot" src="<?= e(url('/files/payment/' . $pay['id'])) ?>" alt="<?= e(t('profile.screenshot')) ?>" loading="lazy"></a>
        <?php else: ?><div class="empty-sm"><?= e(t('common.empty')) ?></div><?php endif; ?>
        <a class="btn btn-sm btn-outline btn-block mt-2" href="<?= e(url('/contact?subject=' . rawurlencode(t('profile.payment') . ' #' . $pay['id'] . ' ' . $pay['order_no']))) ?>"><i class="fa-solid fa-headset"></i> <?= e(t('profile.need_help')) ?></a>
    </section>
</div>
