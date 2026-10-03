<?php /** @var ?array $u @var array $payments @var array $services @var array $methods */ ?>
<div class="page-head"><h1><?= e(t('payment.title')) ?></h1><p><?= e(t('payment.sub')) ?></p></div>

<?php if ($u): ?>
<section class="card section">
    <div class="card-head"><h2 class="card-title"><?= e(t('payment.your_payments')) ?></h2><a class="small" href="<?= e(url('/profile/payments')) ?>"><?= e(t('common.view_all')) ?></a></div>
    <?php if (!$payments): ?><div class="empty-sm"><i class="fa-solid fa-receipt"></i><?= e(t('profile.no_payments')) ?></div><?php endif; ?>
    <div class="list"><?php foreach ($payments as $p) require VIEWS . '/components/payment-row.php'; ?></div>
</section>
<?php else: ?>
<div class="card between section">
    <div><strong><?= e(t('payment.login_needed')) ?></strong><p class="muted small mb-0"><?= e(t('payment.login_needed_d')) ?></p></div>
    <div class="row-gap"><a class="btn btn-sm btn-primary" href="<?= e(url('/login')) ?>"><?= e(t('auth.login')) ?></a><a class="btn btn-sm btn-outline" href="<?= e(url('/register')) ?>"><?= e(t('auth.register')) ?></a></div>
</div>
<?php endif; ?>

<section class="section">
    <div class="section-head"><h2 class="section-title"><?= e(t('payment.methods')) ?></h2></div>
    <div class="grid md-grid-2">
        <?php foreach ($methods as $m): ?>
            <div class="card row pay-method-card">
                <img src="<?= e(Content::media($m['logo'])) ?>" alt="" width="36" height="36">
                <div class="grow" style="min-width:0"><strong><?= e($m['name']) ?></strong><p class="xs muted mb-0 clamp-2"><?= e(tr($m, 'instructions')) ?></p></div>
                <span class="badge badge-success"><?= e(t('payment.available')) ?></span>
            </div>
        <?php endforeach; ?>
        <?php if (!$methods): ?><div class="card empty-sm"><?= e(t('payment.no_methods')) ?></div><?php endif; ?>
    </div>
</section>

<section class="section">
    <div class="section-head"><h2 class="section-title"><?= e(t('payment.choose_service')) ?></h2><a class="small" href="<?= e(url('/services')) ?>"><?= e(t('common.view_all')) ?></a></div>
    <div class="card"><div class="list">
        <?php foreach ($services as $s): ?>
            <a class="list-item" href="<?= e(url('/payment/' . $s['slug'])) ?>">
                <span class="ic-box ic-box-sm" style="--c:<?= e($s['icon_color'] ?: 'var(--primary)') ?>"><?= icon_html($s['icon'], $s['icon_image']) ?></span>
                <span class="title truncate grow"><?= e(tr($s, 'title')) ?></span>
                <span class="meta text-primary bold"><?= money($s['price'], $s['currency'], (bool)$s['price_plus']) ?></span>
                <i class="fa-solid fa-chevron-right muted xs"></i>
            </a>
        <?php endforeach; ?>
    </div></div>
</section>

<section class="section">
    <h2 class="section-title mb-1"><?= e(t('home.how')) ?></h2>
    <ol class="pay-guide">
        <?php foreach (['payment.g1', 'payment.g2', 'payment.g3', 'payment.g4', 'payment.g5'] as $i => $k): ?><li><span><?= num($i + 1) ?></span><?= e(t($k)) ?></li><?php endforeach; ?>
    </ol>
</section>
