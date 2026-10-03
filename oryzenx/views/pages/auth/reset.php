<?php /** @var string $token @var bool $valid */ ?>
<div class="auth-wrap">
    <a class="auth-brand" href="<?= e(url('/')) ?>"><?= brand_avatar('auth-logo') ?><span><?= e(setting('site_name')) ?></span></a>
    <div class="auth-card card">
        <div class="auth-head">
            <span class="auth-icon"><i class="fa-solid fa-unlock-keyhole"></i></span>
            <h1><?= e(t('auth.reset')) ?></h1>
        </div>
        <?php if (!$valid): ?>
            <div class="alert alert-danger"><i class="fa-solid fa-link-slash"></i><span><?= e(t('auth.link_invalid')) ?></span></div>
            <a class="btn btn-primary btn-block" href="<?= e(url('/forgot-password')) ?>"><?= e(t('auth.send_link')) ?></a>
        <?php else: ?>
        <form class="form" method="post" action="<?= e(url('/reset-password')) ?>" data-ajax novalidate>
            <?= csrf_field() ?><input type="hidden" name="token" value="<?= e($token) ?>">
            <div class="field"><label for="n-pass"><?= e(t('auth.new_password')) ?></label><div class="input-icon"><i class="fa-solid fa-lock"></i><input class="input" id="n-pass" type="password" name="password" required minlength="8" autocomplete="new-password"><button class="icon-btn icon-btn-sm pw-toggle" type="button" data-action="pw-toggle" aria-label="<?= e(t('auth.show_pw')) ?>"><i class="fa-solid fa-eye"></i></button></div><span class="hint"><?= e(t('auth.pw_rules')) ?></span></div>
            <div class="field"><label for="n-pass2"><?= e(t('form.password_confirm')) ?></label><div class="input-icon"><i class="fa-solid fa-lock"></i><input class="input" id="n-pass2" type="password" name="password_confirmation" required autocomplete="new-password"><button class="icon-btn icon-btn-sm pw-toggle" type="button" data-action="pw-toggle" aria-label="<?= e(t('auth.show_pw')) ?>"><i class="fa-solid fa-eye"></i></button></div></div>
            <button class="btn btn-primary btn-block" type="submit"><?= e(t('auth.reset')) ?></button>
        </form>
        <?php endif; ?>
        <?php require VIEWS . '/components/auth-secure.php'; ?>
    </div>
</div>
