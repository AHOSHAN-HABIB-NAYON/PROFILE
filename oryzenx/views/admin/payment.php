<?php /** @var array $pay @var ?array $method @var int $others */ ?>
<a class="back-link" href="<?= e(url('/admin/payments')) ?>"><i class="fa-solid fa-arrow-left"></i> <?= e(t('admin.payments')) ?></a>
<div class="admin-head"><h1><?= e(t('admin.payment')) ?> #<?= (int)$pay['id'] ?> <?= status_badge($pay['status']) ?></h1></div>
<div class="admin-grid">
    <section class="card">
        <dl class="kv">
            <dt><?= e(t('admin.user')) ?></dt><dd><a href="<?= e(url('/admin/users/' . $pay['user_id'])) ?>"><?= e($pay['name']) ?></a><br><small class="muted"><?= e($pay['email']) ?><?= $pay['phone'] ? ' · ' . e($pay['phone']) : '' ?></small><?php if ($others): ?><br><small class="muted"><?= e(t('admin.other_payments', ['n' => num($others)])) ?></small><?php endif; ?></dd>
            <dt><?= e(t('profile.service')) ?></dt><dd><?= e($pay['service_title']) ?></dd>
            <dt><?= e(t('profile.order')) ?></dt><dd class="mono"><?= e($pay['order_no']) ?> <?= status_badge($pay['order_status']) ?></dd>
            <dt><?= e(t('profile.amount')) ?></dt><dd class="bold text-primary"><?= money($pay['amount'], $pay['currency']) ?></dd>
            <dt><?= e(t('profile.method')) ?></dt><dd><?= e($method['name'] ?? $pay['method_code']) ?><?= !empty($method['network']) ? ' · ' . e($method['network']) : '' ?></dd>
            <dt><?= e(t('profile.txn')) ?></dt><dd><span class="mono"><?= e($pay['transaction_id']) ?></span> <button class="icon-btn icon-btn-sm" type="button" data-action="copy" data-copy="<?= e($pay['transaction_id']) ?>" aria-label="Copy"><i class="fa-regular fa-copy"></i></button></dd>
            <dt><?= e(t('payment.sender')) ?></dt><dd class="mono"><?= e($pay['sender'] ?: '—') ?></dd>
            <dt><?= e(t('profile.date')) ?></dt><dd><?= e(fmt_date($pay['created_at'], true)) ?></dd>
            <?php if ($pay['note']): ?><dt><?= e(t('payment.note')) ?></dt><dd><?= nl2br(e($pay['note'])) ?></dd><?php endif; ?>
            <?php if ($pay['reviewed_at']): ?><dt><?= e(t('admin.reviewed')) ?></dt><dd><?= e($pay['reviewer'] ?? '—') ?> · <?= e(fmt_date($pay['reviewed_at'], true)) ?></dd><?php endif; ?>
        </dl>
    </section>
    <section class="card">
        <h2 class="card-title mb-1"><?= e(t('profile.screenshot')) ?></h2>
        <?php if ($pay['screenshot']): ?>
            <a href="<?= e(url('/files/payment/' . $pay['id'])) ?>" target="_blank" rel="noopener" data-no-spa><img class="shot" src="<?= e(url('/files/payment/' . $pay['id'])) ?>" alt="<?= e(t('profile.screenshot')) ?>" loading="lazy"></a>
        <?php else: ?><div class="empty-sm"><?= e(t('common.empty')) ?></div><?php endif; ?>
    </section>
    <form class="card form" method="post" action="<?= e(url('/admin/payments/' . $pay['id'])) ?>" data-ajax data-refresh>
        <?= csrf_field() ?>
        <h2 class="card-title"><?= e(t('admin.review')) ?></h2>
        <div class="seg">
            <?php foreach (['approved' => 'fa-circle-check', 'rejected' => 'fa-circle-xmark', 'pending' => 'fa-hourglass-half', 'refunded' => 'fa-rotate-left'] as $st => $ic): ?>
                <label class="seg-opt seg-<?= $st ?>"><input type="radio" name="status" value="<?= $st ?>" <?= $pay['status'] === $st ? 'checked' : '' ?>><span><i class="fa-solid <?= $ic ?>"></i> <?= e(t('status.' . $st)) ?></span></label>
            <?php endforeach; ?>
        </div>
        <div class="field"><label for="os"><?= e(t('admin.order_status')) ?></label>
            <select class="select" id="os" name="order_status"><option value=""><?= e(t('admin.auto')) ?></option>
                <?php foreach (['pending', 'processing', 'completed', 'cancelled', 'refunded'] as $os): ?><option value="<?= $os ?>"><?= e(t('status.' . $os)) ?></option><?php endforeach; ?></select></div>
        <div class="field"><label for="an"><?= e(t('profile.admin_note')) ?></label><textarea class="textarea" id="an" name="admin_note" rows="3" maxlength="1000"><?= e($pay['admin_note']) ?></textarea><span class="hint"><?= e(t('admin.note_hint')) ?></span></div>
        <button class="btn btn-primary" type="submit"><i class="fa-solid fa-floppy-disk"></i> <?= e(t('admin.update_notify')) ?></button>
    </form>
</div>
