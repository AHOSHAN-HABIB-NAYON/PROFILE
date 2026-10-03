<?php /** @var array $u @var string $secret @var string $uri @var string $tab */ require VIEWS . '/components/profile-head.php'; ?>
<section class="card tfa-setup">
    <h2 class="card-title"><i class="fa-solid fa-mobile-screen text-primary"></i> <?= e(t('profile.2fa_setup')) ?></h2>
    <ol class="tfa-steps small">
        <li><?= e(t('profile.2fa_step1')) ?></li>
        <li><?= e(t('profile.2fa_step2')) ?></li>
        <li><?= e(t('profile.2fa_step3')) ?></li>
    </ol>
    <div class="tfa-grid">
        <div class="qr-box" data-component="qr" data-text="<?= e($uri) ?>" aria-label="QR code"></div>
        <div class="stack grow">
            <div><span class="xs muted"><?= e(t('profile.manual_key')) ?></span>
                <div class="copy-box"><span><?= e(trim(chunk_split($secret, 4, ' '))) ?></span><button class="btn btn-xs btn-primary" type="button" data-action="copy" data-copy="<?= e($secret) ?>"><i class="fa-regular fa-copy"></i></button></div></div>
            <a class="btn btn-sm btn-outline only-mobile-inline" href="<?= e($uri) ?>" data-no-spa><i class="fa-solid fa-arrow-up-right-from-square"></i> <?= e(t('profile.open_app')) ?></a>
            <form class="form" method="post" action="<?= e(url('/profile/2fa/enable')) ?>" data-ajax data-component="recovery-codes">
                <?= csrf_field() ?>
                <div class="field"><label for="tfa-code"><?= e(t('auth.code')) ?></label><input class="input otp-input" id="tfa-code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required placeholder="000000"></div>
                <button class="btn btn-primary" type="submit"><i class="fa-solid fa-shield-halved"></i> <?= e(t('profile.enable_2fa')) ?></button>
                <div class="codes" hidden></div>
            </form>
        </div>
    </div>
</section>
