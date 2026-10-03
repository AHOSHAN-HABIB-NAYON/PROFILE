<?php /** @var string $method */ ?>
<div class="auth-wrap">
    <a class="auth-brand" href="<?= e(url('/')) ?>"><?= brand_avatar('auth-logo') ?><span><?= e(setting('site_name')) ?></span></a>
    <div class="auth-card card">
        <div class="auth-head">
            <span class="auth-icon"><i class="fa-solid <?= $method === 'totp' ? 'fa-mobile-screen' : 'fa-envelope-open-text' ?>"></i></span>
            <h1><?= e(t('auth.verify_title')) ?></h1>
            <p class="muted small"><?= e($method === 'totp' ? t('auth.verify_totp') : t('auth.verify_email')) ?></p>
        </div>
        <form class="form" method="post" action="<?= e(url('/login/verify')) ?>" data-ajax novalidate>
            <?= csrf_field() ?>
            <div class="field"><label for="v-code"><?= e(t('auth.code')) ?></label>
                <input class="input otp-input" id="v-code" name="code" required inputmode="<?= $method === 'totp' ? 'text' : 'numeric' ?>" autocomplete="one-time-code" maxlength="12" autofocus placeholder="000000"></div>
            <?php if ($method === 'totp'): ?><p class="xs muted mb-0"><?= e(t('auth.recovery_hint')) ?></p><?php endif; ?>
            <button class="btn btn-primary btn-block" type="submit"><?= e(t('auth.verify')) ?></button>
        </form>
        <div class="stack mt-2">
            <?php if ($method === 'email'): ?>
                <form method="post" action="<?= e(url('/login/verify/resend')) ?>" data-ajax><?= csrf_field() ?><button class="btn btn-ghost btn-sm btn-block" type="submit"><i class="fa-solid fa-rotate"></i> <?= e(t('auth.resend_code')) ?></button></form>
            <?php else: ?>
                <form method="post" action="<?= e(url('/recover-2fa')) ?>" data-ajax data-confirm="<?= e(t('auth.recover_confirm')) ?>"><?= csrf_field() ?><button class="btn btn-ghost btn-sm btn-block" type="submit"><i class="fa-solid fa-life-ring"></i> <?= e(t('auth.lost_device')) ?></button></form>
            <?php endif; ?>
            <a class="btn btn-ghost btn-sm btn-block" href="<?= e(url('/login')) ?>"><i class="fa-solid fa-arrow-left"></i> <?= e(t('auth.back_login')) ?></a>
        </div>
        <?php require VIEWS . '/components/auth-secure.php'; ?>
    </div>
</div>
