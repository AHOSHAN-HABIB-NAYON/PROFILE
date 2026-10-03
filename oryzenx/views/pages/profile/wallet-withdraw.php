<?php /** @var array $u @var array $methods @var string $tab */
require VIEWS . '/components/profile-head.php';
$min = max(1, (float)setting('wallet_min_withdraw', 5));
?>
<a class="back-link" href="<?= e(url('/profile/wallet')) ?>"><i class="fa-solid fa-arrow-left"></i> <?= e(t('wallet.title')) ?></a>
<form class="checkout" method="post" action="<?= e(url('/profile/wallet/withdraw')) ?>" data-ajax novalidate>
    <?= csrf_field() ?>
    <section class="card form">
        <h2 class="card-title"><i class="fa-solid fa-circle-arrow-up text-danger"></i> <?= e(t('wallet.withdraw')) ?></h2>
        <div class="alert alert-info mb-0"><i class="fa-solid fa-wallet"></i><span><?= e(t('wallet.available')) ?>: <strong><?= money($u['balance']) ?></strong> · <?= e(t('wallet.min_withdraw', ['n' => money($min)])) ?></span></div>
        <div class="field"><label class="req" for="w-amt"><?= e(t('wallet.amount_usd')) ?></label>
            <div class="input-group"><div class="input-icon grow"><i class="fa-solid fa-dollar-sign"></i><input class="input" id="w-amt" name="amount" type="number" min="<?= $min ?>" max="<?= (float)$u['balance'] ?>" step="0.01" inputmode="decimal" required></div>
                <button class="btn btn-outline" type="button" onclick="document.getElementById('w-amt').value='<?= (float)$u['balance'] ?>'">MAX</button></div></div>
        <div class="field"><label class="req"><?= e(t('wallet.receive_with')) ?></label>
            <div class="pay-options" data-component="pay-methods">
                <?php foreach ($methods as $i => $m): ?>
                    <label class="pay-option"><input type="radio" name="method" value="<?= e($m['code']) ?>" <?= $i === 0 ? 'checked' : '' ?>>
                        <img src="<?= e(Content::media($m['logo'])) ?>" alt="" width="30" height="30"><span class="grow"><strong><?= e($m['name']) ?></strong></span><span class="pay-radio"></span></label>
                <?php endforeach; ?>
            </div></div>
        <div class="field"><label class="req" for="w-acc"><?= e(t('wallet.account')) ?></label><input class="input mono" id="w-acc" name="account" maxlength="190" required autocomplete="off" placeholder="<?= e(t('wallet.account_ph')) ?>"></div>
        <button class="btn btn-primary btn-block" type="submit" <?= (float)$u['balance'] < $min ? 'disabled' : '' ?>><i class="fa-solid fa-paper-plane"></i> <?= e(t('wallet.submit_withdraw')) ?></button>
        <p class="xs muted mb-0"><i class="fa-solid fa-circle-info"></i> <?= e(t('wallet.withdraw_note')) ?></p>
    </section>
</form>
