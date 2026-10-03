<?php /** @var array $s @var array $u @var array $methods */
$needVerify = setting('require_verified_for_payment') === '1' && !$u['email_verified_at'];
?>
<a class="back-link" href="<?= e(url('/services/' . $s['slug'])) ?>"><i class="fa-solid fa-arrow-left"></i> <?= e(tr($s, 'title')) ?></a>
<div class="page-head"><h1><?= e(t('payment.make')) ?></h1></div>

<section class="card checkout-summary">
    <span class="ic-box ic-box-lg" style="--c:<?= e($s['icon_color'] ?: 'var(--primary)') ?>"><?= icon_html($s['icon'], $s['icon_image']) ?></span>
    <div class="grow" style="min-width:0"><strong class="truncate" style="display:block"><?= e(tr($s, 'title')) ?></strong><span class="xs muted"><?= e(tr($s, 'short_desc')) ?></span></div>
    <span class="price-tag"><?= money($s['price'], $s['currency']) ?></span>
</section>

<?php if ($needVerify): ?>
    <div class="alert alert-warning mt-2"><i class="fa-solid fa-envelope"></i><span><?= e(t('payment.verify_first')) ?> <a href="<?= e(url('/profile/security')) ?>"><?= e(t('nav.security')) ?></a></span></div>
<?php elseif (!$methods): ?>
    <div class="alert alert-warning mt-2"><i class="fa-solid fa-circle-info"></i><span><?= e(t('payment.no_methods')) ?></span></div>
<?php else: ?>
<form class="checkout" method="post" action="<?= e(url('/payment/' . $s['slug'])) ?>" enctype="multipart/form-data" data-ajax novalidate>
    <?= csrf_field() ?>
    <section class="card mt-2" data-component="pay-methods">
        <h2 class="card-title mb-1"><?= e(t('payment.method')) ?></h2>
        <div class="pay-options" role="radiogroup" aria-label="<?= e(t('payment.method')) ?>">
            <?php foreach ($methods as $i => $m): ?>
                <label class="pay-option">
                    <input type="radio" name="method" value="<?= e($m['code']) ?>" <?= $i === 0 ? 'checked' : '' ?>>
                    <img src="<?= e(Content::media($m['logo'])) ?>" alt="" width="30" height="30">
                    <span class="grow"><strong><?= e($m['name']) ?></strong><?php if ($m['account_type']): ?><small class="muted"> · <?= e($m['account_type']) ?></small><?php endif; ?></span>
                    <span class="pay-radio" aria-hidden="true"></span>
                </label>
            <?php endforeach; ?>
        </div>
    </section>

    <?php foreach ($methods as $i => $m): ?>
        <section class="card mt-2 pay-panel" data-method-panel="<?= e($m['code']) ?>" <?= $i === 0 ? '' : 'hidden' ?>>
            <h2 class="card-title mb-1"><i class="fa-solid fa-circle-info text-primary"></i> <?= e(t('payment.instructions')) ?> · <?= e($m['name']) ?></h2>
            <div class="pay-details">
                <?php if ($m['account_number']): ?>
                    <div><span class="xs muted"><?= e($m['type'] === 'crypto' ? t('payment.address') . ($m['network'] ? ' (' . $m['network'] . ')' : '') : ($m['type'] === 'exchange' ? 'Pay ID' : t('payment.number'))) ?></span>
                        <div class="copy-box"><span><?= e($m['account_number']) ?></span><button class="btn btn-xs btn-primary" type="button" data-action="copy" data-copy="<?= e($m['account_number']) ?>"><i class="fa-regular fa-copy"></i> <?= e(t('payment.copy')) ?></button></div></div>
                <?php endif; ?>
                <?php if ($m['account_name']): ?><p class="small mb-0"><?= e(t('payment.account_name')) ?>: <strong><?= e($m['account_name']) ?></strong></p><?php endif; ?>
                <p class="small mb-0"><?= e(t('payment.send_exact')) ?>: <strong class="text-primary"><?= money($s['price'], $s['currency']) ?></strong>
                    <?php if ($s['currency'] === 'USD' && $m['type'] === 'mobile' && (float)setting('usd_to_bdt') > 0): ?> ≈ <strong><?= money(ceil($s['price'] * (float)setting('usd_to_bdt')), 'BDT') ?></strong><?php endif; ?></p>
                <?php if ($m['qr_image']): ?><img class="pay-qr" src="<?= e(upload_url($m['qr_image'])) ?>" alt="QR" loading="lazy"><?php endif; ?>
                <?php if ($m['link']): ?><a class="btn btn-sm btn-outline" href="<?= e($m['link']) ?>" target="_blank" rel="noopener" data-no-spa><i class="fa-solid fa-arrow-up-right-from-square"></i> <?= e(t('payment.open_link', ['m' => $m['name']])) ?></a><?php endif; ?>
                <?php if (tr($m, 'instructions')): ?><p class="small muted mb-0"><?= nl2br(e(tr($m, 'instructions'))) ?></p><?php endif; ?>
                <?php if ($m['type'] === 'crypto'): ?><div class="alert alert-warning mb-0"><i class="fa-solid fa-triangle-exclamation"></i><span><?= e(t('payment.crypto_warn', ['n' => $m['network'] ?: $m['name']])) ?></span></div><?php endif; ?>
            </div>
        </section>
    <?php endforeach; ?>

    <section class="card mt-2 form">
        <h2 class="card-title"><?= e(t('payment.confirm')) ?></h2>
        <div class="field"><label class="req" for="txn"><?= e(t('profile.txn')) ?></label><input class="input mono" id="txn" name="transaction_id" required maxlength="120" autocomplete="off" placeholder="<?= e(t('payment.txn_ph')) ?>"></div>
        <div class="field"><label for="sender"><?= e(t('payment.sender')) ?></label><input class="input mono" id="sender" name="sender" maxlength="190" autocomplete="off" placeholder="<?= e(t('payment.sender_ph')) ?>"></div>
        <div class="field" data-component="file-preview"><label class="req" for="shot"><?= e(t('profile.screenshot')) ?></label>
            <input class="input" type="file" id="shot" name="screenshot" accept="image/jpeg,image/png,image/webp" required>
            <img class="shot-preview" alt="" hidden><span class="hint" data-file-info><?= e(t('payment.shot_hint', ['n' => setting('max_screenshot_mb')])) ?></span></div>
        <div class="field" data-component="char-count"><label for="note"><?= e(t('payment.note')) ?></label><textarea class="textarea" id="note" name="note" rows="3" maxlength="1000" placeholder="<?= e(t('payment.note_ph')) ?>"></textarea><span class="hint right" data-count></span></div>
        <button class="btn btn-primary btn-block" type="submit"><i class="fa-solid fa-paper-plane"></i> <?= e(t('payment.submit')) ?></button>
        <p class="xs muted center mb-0"><i class="fa-solid fa-lock"></i> <?= e(t('payment.secure_note')) ?></p>
    </section>
</form>
<?php endif; ?>
