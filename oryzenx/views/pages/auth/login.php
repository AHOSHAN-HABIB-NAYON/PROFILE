<div class="auth-wrap">
    <a class="auth-brand" href="<?= e(url('/')) ?>"><?= brand_avatar('auth-logo') ?><span><?= e(setting('site_name')) ?></span></a>
    <div class="auth-card card">
        <div class="auth-head">
            <span class="auth-icon"><i class="fa-solid fa-right-to-bracket"></i></span>
            <h1><?= e(t('auth.login_title')) ?></h1>
            <p class="muted small"><?= e(t('auth.login_sub', ['site' => setting('site_name')])) ?></p>
        </div>
        <form class="form" method="post" action="<?= e(url('/login')) ?>" data-ajax novalidate>
            <?= csrf_field() ?>
            <div class="field"><label for="l-email"><?= e(t('form.email')) ?></label>
                <div class="input-icon"><i class="fa-regular fa-envelope"></i><input class="input" id="l-email" type="email" name="email" required autocomplete="username webauthn" maxlength="190" autofocus></div></div>
            <div class="field"><div class="between"><label for="l-pass"><?= e(t('form.password')) ?></label><a class="xs" href="<?= e(url('/forgot-password')) ?>"><?= e(t('auth.forgot')) ?></a></div>
                <div class="input-icon"><i class="fa-solid fa-lock"></i><input class="input" id="l-pass" type="password" name="password" required autocomplete="current-password"><button class="icon-btn icon-btn-sm pw-toggle" type="button" data-action="pw-toggle" aria-label="<?= e(t('auth.show_pw')) ?>"><i class="fa-solid fa-eye"></i></button></div></div>
            <label class="check"><input type="checkbox" name="remember" value="1" checked> <?= e(t('auth.remember')) ?></label>
            <?= Recaptcha::widget() ?>
            <button class="btn btn-primary btn-block" type="submit"><?= e(t('auth.login')) ?></button>
        </form>
        <div class="divider-text"><?= e(t('auth.or_continue')) ?></div>
        <div class="social-login">
            <button class="social-btn" type="button" data-component="passkey-login" hidden aria-label="<?= e(t('auth.passkey_login')) ?>" title="<?= e(t('auth.passkey_login')) ?>"><i class="fa-solid fa-fingerprint"></i></button>
            <?php if (GoogleController::enabled()): ?>
                <a class="social-btn" href="<?= e(url('/auth/google')) ?>" data-no-spa aria-label="<?= e(t('auth.google')) ?>" title="<?= e(t('auth.google')) ?>"><img src="<?= e(asset('img/google.svg')) ?>" alt="" width="22" height="22"></a>
            <?php endif; ?>
        </div>
        <p class="center small mt-2 mb-0"><?= e(t('auth.no_account')) ?> <a href="<?= e(url('/register')) ?>"><?= e(t('auth.register')) ?></a></p>
    </div>
    <?php require VIEWS . '/components/auth-secure.php'; ?>
</div>
