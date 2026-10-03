<?php /** @var array $p */ ?>
<a class="list-item pay-row" href="<?= e(url('/profile/payments/' . $p['id'])) ?>">
    <span class="ic-box ic-box-sm" style="--c:<?= ['approved' => 'var(--success)', 'rejected' => 'var(--danger)', 'pending' => 'var(--warning)'][$p['status']] ?? 'var(--text-muted)' ?>"><i class="fa-solid <?= ['approved' => 'fa-circle-check', 'rejected' => 'fa-circle-xmark', 'pending' => 'fa-hourglass-half', 'refunded' => 'fa-rotate-left'][$p['status']] ?? 'fa-receipt' ?>"></i></span>
    <span class="grow" style="min-width:0">
        <span class="title truncate" style="display:block"><?= e($p['service_title']) ?></span>
        <span class="sub truncate" style="display:block"><?= e($p['order_no']) ?> · <?= e(fmt_date($p['created_at'])) ?></span>
    </span>
    <span class="meta right"><b class="text-primary"><?= money($p['amount'], $p['currency']) ?></b><br><?= status_badge($p['status']) ?></span>
</a>
