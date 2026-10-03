<?php /** @var array $p */ $pm = Content::methodMap()[$p['method_code']] ?? null; ?>
<a class="list-item pay-row" href="<?= e(url('/profile/payments/' . $p['id'])) ?>">
    <span class="pay-logo-sm"><?php if ($pm && $pm['logo']): ?><img src="<?= e(Content::media($pm['logo'])) ?>" alt="" width="34" height="34" loading="lazy"><?php else: ?><i class="fa-solid fa-wallet"></i><?php endif; ?></span>
    <span class="grow" style="min-width:0">
        <span class="title truncate" style="display:block"><?= e($p['service_title']) ?></span>
        <span class="sub truncate" style="display:block"><b><?= e($pm['name'] ?? $p['method_code']) ?></b><?= !empty($pm['network']) ? ' · ' . e($pm['network']) : '' ?> · <?= e(fmt_date($p['created_at'])) ?></span>
    </span>
    <span class="meta right"><b class="text-primary"><?= money($p['amount'], $p['currency']) ?></b><br><?= status_badge($p['status']) ?></span>
</a>
