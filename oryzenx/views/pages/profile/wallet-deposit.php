<?php /** @var array $u @var array $methods @var string $tab */
require VIEWS . '/components/profile-head.php';
$rate = (float)setting('usd_to_bdt');
?>
<a class="back-link" href="<?= e(url('/profile/wallet')) ?>"><i class="fa-solid fa-arrow-left"></i> <?= e(t('wallet.title')) ?></a>
<?php if (!$methods): ?><div class="alert alert-warning"><i class="fa-solid fa-circle-info"></i><span><?= e(t('payment.no_methods')) ?></span></div><?php else: ?>
<form class="checkout" method="post" action="<?= e(url('/profile/wallet/deposit')) ?>" enctype="multipart/form-data" data-ajax novalidate>
    <?= csrf_field() ?>
    <section class="card form">
        <h2 class="card-title"><i class="fa-solid fa-circle-plus text-success"></i> <?= e(t('wallet.deposit')) ?></h2>
        <div class="field"><label class="req" for="d-amt"><?= e(t('wallet.amount_usd')) ?></label>
            <div class="input-icon"><i class="fa-solid fa-dollar-sign"></i><input class="input" id="d-amt" name="amount" type="number" min="1" step="0.01" inputmode="decimal" required data-bdt-rate="<?= $rate ?>"></div>
            <?php if ($rate > 0): ?><span class="hint" data-bdt-out></span><?php endif; ?></div>
    </section>
    <section class="card mt-2" data-component="pay-methods">
        <h2 class="card-title mb-1"><?= e(t('payment.method')) ?></h2>
        <div class="pay-options">
            <?php foreach ($methods as $i => $m): ?>
                <label class="pay-option"><input type="radio" name="method" value="<?= e($m['code']) ?>" <?= $i === 0 ? 'checked' : '' ?>>
                    <img src="<?= e(Content::media($m['logo'])) ?>" alt="" width="30" height="30"><span class="grow"><strong><?= e($m['name']) ?></strong></span><span class="pay-radio"></span></label>
            <?php endforeach; ?>
        </div>
    </section>
    <?php foreach ($methods as $i => $m): ?>
        <section class="card mt-2 pay-panel" data-method-panel="<?= e($m['code']) ?>" <?= $i ? 'hidden' : '' ?>>
            <div class="pay-details">
                <?php if ($m['account_number']): ?><div class="copy-box"><span><?= e($m['account_number']) ?></span><button class="btn btn-xs btn-primary" type="button" data-action="copy" data-copy="<?= e($m['account_number']) ?>"><i class="fa-regular fa-copy"></i> <?= e(t('payment.copy')) ?></button></div><?php endif; ?>
                <?php if ($m['qr_image']): ?><div class="pay-qr-wrap"><img class="pay-qr" src="<?= e(upload_url($m['qr_image'])) ?>" alt="QR" loading="lazy"></div><?php endif; ?>
                <?php if ($m['link']): ?><a class="pay-open pay-open-<?= e(preg_replace('/[^a-z0-9_]/', '', $m['code'])) ?>" href="<?= e($m['link']) ?>" target="_blank" rel="noopener" data-no-spa><img src="<?= e(Content::media($m['logo'])) ?>" alt="" width="22" height="22"><span><?= e(t('payment.open_link', ['m' => $m['name']])) ?></span><i class="fa-solid fa-arrow-up-right-from-square"></i></a><?php endif; ?>
                <?php if (tr($m, 'instructions')): ?><p class="small muted mb-0"><?= nl2br(e(tr($m, 'instructions'))) ?></p><?php endif; ?>
            </div>
        </section>
    <?php endforeach; ?>
    <section class="card mt-2 form">
        <h2 class="card-title"><?= e(t('payment.confirm')) ?></h2>
        <div class="field"><label class="req" for="txn"><?= e(t('profile.txn')) ?></label><input class="input mono" id="txn" name="transaction_id" maxlength="120" required autocomplete="off" placeholder="<?= e(t('payment.txn_ph')) ?>"></div>
        <div class="field" data-component="file-preview"><label class="req" for="shot"><?= e(t('profile.screenshot')) ?></label>
            <label class="upload-box" for="shot"><span class="upload-ic"><i class="fa-solid fa-cloud-arrow-up"></i></span>
                <span class="grow"><strong><?= e(t('payment.upload_shot')) ?></strong><span class="hint" data-file-info><?= e(t('payment.shot_hint', ['n' => setting('max_screenshot_mb')])) ?></span></span><img class="shot-preview" alt="" hidden></label>
            <input class="sr-only" type="file" id="shot" name="screenshot" accept="image/jpeg,image/png,image/webp" required></div>
        <button class="btn btn-primary btn-block" type="submit"><i class="fa-solid fa-paper-plane"></i> <?= e(t('wallet.submit_deposit')) ?></button>
    </section>
</form>
<?php endif; ?>
