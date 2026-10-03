<div class="auth-wrap">
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
        <div class="divider-text"><?= e(t('auth.or')) ?></div>
        <div class="stack">
            <button class="btn btn-outline btn-block" type="button" data-component="passkey-login" hidden><i class="fa-solid fa-fingerprint"></i> <?= e(t('auth.passkey_login')) ?></button>
            <?php if (GoogleController::enabled()): ?>
                <a class="btn btn-outline btn-block" href="<?= e(url('/auth/google')) ?>" data-no-spa><img src="<?= e(asset('img/google.svg')) ?>" alt="" width="18" height="18"> <?= e(t('auth.google')) ?></a>
            <?php endif; ?>
        </div>
        <p class="center small mt-2 mb-0"><?= e(t('auth.no_account')) ?> <a href="<?= e(url('/register')) ?>"><?= e(t('auth.register')) ?></a></p>
    </div>
    <p class="center xs muted"><i class="fa-solid fa-shield-halved"></i> <?= e(t('auth.secure_note')) ?></p>
</div>
