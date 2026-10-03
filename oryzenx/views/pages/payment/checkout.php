<?php /** @var array $s @var array $u @var array $methods */
$needVerify = setting('require_verified_for_payment') === '1' && !$u['email_verified_at'];
[$price, $disc, $pct] = Offer::price($s, (int)$u['id']);
$priceUsd = Wallet::toUsd($price, $s['currency']);
$offerOpen = !$disc && Offer::enabled() && !Offer::claim((int)$u['id']);
$bal = (float)$u['balance'];
$canBalance = $bal > 0 && $bal >= $priceUsd;
?>
<a class="back-link" href="<?= e(url('/services/' . $s['slug'])) ?>"><i class="fa-solid fa-arrow-left"></i> <?= e(tr($s, 'title')) ?></a>
<div class="page-head"><h1><?= e(t('payment.make')) ?></h1></div>

<section class="card checkout-summary">
    <?= svc_logo($s, 'lg') ?>
    <div class="grow" style="min-width:0"><strong class="truncate" style="display:block"><?= e(tr($s, 'title')) ?></strong><span class="xs muted"><?= e(tr($s, 'short_desc')) ?></span></div>
    <span class="price-tag"><?php if ($disc): ?><s class="price-old"><?= money($s['price'], $s['currency']) ?></s><?php endif; ?><?= money($price, $s['currency']) ?></span>
</section>
<?php if ($disc): ?>
    <div class="offer-applied"><i class="fa-solid fa-gift"></i><span><?= e(t('offer.applied', ['p' => num($pct)])) ?></span><strong>−<?= money($disc, $s['currency']) ?></strong></div>
<?php elseif ($offerOpen): ?>
    <button type="button" class="offer-applied offer-cta" data-action="offer-open"><i class="fa-solid fa-gift"></i><span><?= e(t('offer.claim_here', ['p' => num(Offer::percent())])) ?></span><i class="fa-solid fa-chevron-right"></i></button>
<?php endif; ?>

<?php if ($needVerify): ?>
    <div class="alert alert-warning mt-2"><i class="fa-solid fa-envelope"></i><span><?= e(t('payment.verify_first')) ?> <a href="<?= e(url('/profile/security')) ?>"><?= e(t('nav.security')) ?></a></span></div>
<?php elseif (!$methods && $bal <= 0): ?>
    <div class="alert alert-warning mt-2"><i class="fa-solid fa-circle-info"></i><span><?= e(t('payment.no_methods')) ?></span></div>
<?php else: ?>
<form class="checkout" method="post" action="<?= e(url('/payment/' . $s['slug'])) ?>" enctype="multipart/form-data" data-ajax novalidate>
    <?= csrf_field() ?>
    <section class="card mt-2" data-component="pay-methods">
        <h2 class="card-title mb-1"><?= e(t('payment.method')) ?></h2>
        <div class="pay-options" role="radiogroup" aria-label="<?= e(t('payment.method')) ?>">
            <?php if ($bal > 0): ?>
                <label class="pay-option pay-balance<?= $canBalance ? '' : ' is-disabled' ?>">
                    <input type="radio" name="method" value="balance" <?= $canBalance ? 'checked' : 'disabled' ?>>
                    <img src="<?= e(asset('img/pay/wallet.svg')) ?>" alt="" width="30" height="30">
                    <span class="grow"><strong><?= e(t('wallet.balance_method')) ?></strong><small class="muted" style="display:block"><?= e(t('wallet.available')) ?>: <?= money($bal) ?><?= $canBalance ? '' : ' · ' . e(t('wallet.not_enough')) ?></small></span>
                    <span class="pay-radio" aria-hidden="true"></span>
                </label>
            <?php endif; ?>
            <?php foreach ($methods as $i => $m): ?>
                <label class="pay-option">
                    <input type="radio" name="method" value="<?= e($m['code']) ?>" <?= $i === 0 && !$canBalance ? 'checked' : '' ?>>
                    <img src="<?= e(Content::media($m['logo'])) ?>" alt="" width="30" height="30">
                    <span class="grow"><strong><?= e($m['name']) ?></strong><?php if ($m['account_type']): ?><small class="muted"> · <?= e($m['account_type']) ?></small><?php endif; ?></span>
                    <span class="pay-radio" aria-hidden="true"></span>
                </label>
            <?php endforeach; ?>
        </div>
    </section>

    <?php foreach ($methods as $i => $m): ?>
        <section class="card mt-2 pay-panel" data-method-panel="<?= e($m['code']) ?>" <?= $i === 0 && !$canBalance ? '' : 'hidden' ?>>
            <h2 class="card-title mb-1"><i class="fa-solid fa-circle-info text-primary"></i> <?= e(t('payment.instructions')) ?> · <?= e($m['name']) ?></h2>
            <div class="pay-details">
                <?php if ($m['account_number']): ?>
                    <div><span class="xs muted"><?= e($m['type'] === 'crypto' ? t('payment.address') . ($m['network'] ? ' (' . $m['network'] . ')' : '') : ($m['type'] === 'exchange' ? 'Pay ID' : t('payment.number'))) ?></span>
                        <div class="copy-box"><span><?= e($m['account_number']) ?></span><button class="btn btn-xs btn-primary" type="button" data-action="copy" data-copy="<?= e($m['account_number']) ?>"><i class="fa-regular fa-copy"></i> <?= e(t('payment.copy')) ?></button></div></div>
                <?php endif; ?>
                <?php if ($m['account_name']): ?><p class="small mb-0"><?= e(t('payment.account_name')) ?>: <strong><?= e($m['account_name']) ?></strong></p><?php endif; ?>
                <p class="small mb-0"><?= e(t('payment.send_exact')) ?>: <strong class="text-primary"><?= money($price, $s['currency']) ?></strong>
                    <?php if ($s['currency'] === 'USD' && $m['type'] === 'mobile' && (float)setting('usd_to_bdt') > 0): ?> ≈ <strong><?= money(ceil($price * (float)setting('usd_to_bdt')), 'BDT') ?></strong><?php endif; ?></p>
                <?php if ($m['qr_image']): ?><div class="pay-qr-wrap"><img class="pay-qr" src="<?= e(upload_url($m['qr_image'])) ?>" alt="QR" loading="lazy"><span class="xs muted"><i class="fa-solid fa-qrcode"></i> <?= e(t('payment.scan_qr')) ?></span></div><?php endif; ?>
                <?php if ($m['link']): ?><a class="pay-open pay-open-<?= e(preg_replace('/[^a-z0-9_]/', '', $m['code'])) ?>" href="<?= e($m['link']) ?>" target="_blank" rel="noopener" data-no-spa><img src="<?= e(Content::media($m['logo'])) ?>" alt="" width="22" height="22"><span><?= e(t('payment.open_link', ['m' => $m['name']])) ?></span><i class="fa-solid fa-arrow-up-right-from-square"></i></a><?php endif; ?>
                <?php if (tr($m, 'instructions')): ?><p class="small muted mb-0"><?= nl2br(e(tr($m, 'instructions'))) ?></p><?php endif; ?>
                <?php if ($m['type'] === 'crypto'): ?><div class="alert alert-warning mb-0"><i class="fa-solid fa-triangle-exclamation"></i><span><?= e(t('payment.crypto_warn', ['n' => $m['network'] ?: $m['name']])) ?></span></div><?php endif; ?>
            </div>
        </section>
    <?php endforeach; ?>

    <?php if ($bal > 0): ?>
    <section class="card mt-2 pay-panel balance-panel" data-method-panel="balance" <?= $canBalance ? '' : 'hidden' ?>>
        <div class="row"><img src="<?= e(asset('img/pay/wallet.svg')) ?>" alt="" width="44" height="44">
            <div class="grow"><strong><?= e(t('wallet.pay_from_balance')) ?></strong><p class="xs muted mb-0"><?= money($bal) ?> → <?= money(max(0, $bal - $priceUsd)) ?></p></div></div>
        <button class="btn btn-primary btn-block mt-2" type="submit"><i class="fa-solid fa-bolt"></i> <?= e(t('wallet.pay_now', ['n' => money($priceUsd)])) ?></button>
    </section>
    <?php endif; ?>
    <section class="card mt-2 form" data-proof <?= $canBalance ? 'hidden' : '' ?>>
        <h2 class="card-title"><?= e(t('payment.confirm')) ?></h2>
        <div class="field"><label class="req" for="txn"><?= e(t('profile.txn')) ?></label><input class="input mono" id="txn" name="transaction_id" maxlength="120" autocomplete="off" placeholder="<?= e(t('payment.txn_ph')) ?>"></div>
        <div class="field" data-component="file-preview"><label class="req" for="shot"><?= e(t('profile.screenshot')) ?></label>
            <label class="upload-box" for="shot">
                <span class="upload-ic"><i class="fa-solid fa-cloud-arrow-up"></i></span>
                <span class="grow"><strong><?= e(t('payment.upload_shot')) ?></strong><span class="hint" data-file-info><?= e(t('payment.shot_hint', ['n' => setting('max_screenshot_mb')])) ?></span></span>
                <img class="shot-preview" alt="" hidden>
            </label>
            <input class="sr-only" type="file" id="shot" name="screenshot" accept="image/jpeg,image/png,image/webp"></div>
        <button class="btn btn-primary btn-block" type="submit"><i class="fa-solid fa-paper-plane"></i> <?= e(t('payment.submit')) ?></button>
        <p class="xs muted center mb-0"><i class="fa-solid fa-lock"></i> <?= e(t('payment.secure_note')) ?></p>
    </section>
</form>
<?php endif; ?>
