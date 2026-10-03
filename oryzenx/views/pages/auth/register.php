<div class="auth-wrap">
    <div class="auth-card card">
        <div class="auth-head">
            <span class="auth-icon"><i class="fa-solid fa-user-plus"></i></span>
            <h1><?= e(t('auth.register_title')) ?></h1>
            <p class="muted small"><?= e(t('auth.register_sub')) ?></p>
        </div>
        <?php if (setting('registration_enabled') !== '1' && (int)DB::val("SELECT COUNT(*) FROM users WHERE role = 'admin'") > 0): ?>
            <div class="alert alert-warning"><i class="fa-solid fa-circle-info"></i><?= e(t('auth.reg_closed')) ?></div>
        <?php else: ?>
        <form class="form" method="post" action="<?= e(url('/register')) ?>" data-ajax novalidate>
            <?= csrf_field() ?>
            <div class="field"><label class="req" for="r-name"><?= e(t('form.name')) ?></label><div class="input-icon"><i class="fa-regular fa-user"></i><input class="input" id="r-name" name="name" required maxlength="100" autocomplete="name"></div></div>
            <div class="field"><label class="req" for="r-email"><?= e(t('form.email')) ?></label><div class="input-icon"><i class="fa-regular fa-envelope"></i><input class="input" id="r-email" type="email" name="email" required maxlength="190" autocomplete="email"></div></div>
            <div class="field"><label class="req" for="r-pass"><?= e(t('form.password')) ?></label><div class="input-icon"><i class="fa-solid fa-lock"></i><input class="input" id="r-pass" type="password" name="password" required minlength="8" autocomplete="new-password"><button class="icon-btn icon-btn-sm pw-toggle" type="button" data-action="pw-toggle" aria-label="<?= e(t('auth.show_pw')) ?>"><i class="fa-solid fa-eye"></i></button></div><span class="hint"><?= e(t('auth.pw_rules')) ?></span></div>
            <div class="field"><label class="req" for="r-pass2"><?= e(t('form.password_confirm')) ?></label><div class="input-icon"><i class="fa-solid fa-lock"></i><input class="input" id="r-pass2" type="password" name="password_confirmation" required autocomplete="new-password"></div></div>
            <div class="field"><label class="check"><input type="checkbox" name="terms" value="1" required> <?= e(t('auth.terms')) ?></label></div>
            <?= Recaptcha::widget() ?>
            <button class="btn btn-primary btn-block" type="submit"><?= e(t('auth.create_account')) ?></button>
        </form>
        <?php if (GoogleController::enabled()): ?>
            <div class="divider-text"><?= e(t('auth.or')) ?></div>
            <a class="btn btn-outline btn-block" href="<?= e(url('/auth/google')) ?>" data-no-spa><img src="<?= e(asset('img/google.svg')) ?>" alt="" width="18" height="18"> <?= e(t('auth.google')) ?></a>
        <?php endif; ?>
        <?php endif; ?>
        <p class="center small mt-2 mb-0"><?= e(t('auth.have_account')) ?> <a href="<?= e(url('/login')) ?>"><?= e(t('auth.login')) ?></a></p>
    </div>
</div>
