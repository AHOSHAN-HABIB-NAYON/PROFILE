<div class="auth-wrap">
    <a class="auth-brand" href="<?= e(url('/')) ?>"><?= brand_avatar('auth-logo') ?><span><?= e(setting('site_name')) ?></span></a>
    <div class="auth-card card">
        <div class="auth-head">
            <span class="auth-icon"><i class="fa-solid fa-key"></i></span>
            <h1><?= e(t('auth.forgot_title')) ?></h1>
            <p class="muted small"><?= e(t('auth.forgot_sub')) ?></p>
        </div>
        <?php if (!Mailer::configured()): ?><div class="alert alert-warning"><i class="fa-solid fa-circle-info"></i><span><?= e(t('auth.mail_unavailable')) ?></span></div><?php endif; ?>
        <form class="form" method="post" action="<?= e(url('/forgot-password')) ?>" data-ajax data-reset novalidate>
            <?= csrf_field() ?>
            <div class="field"><label for="f-email"><?= e(t('form.email')) ?></label><div class="input-icon"><i class="fa-regular fa-envelope"></i><input class="input" id="f-email" type="email" name="email" required autocomplete="email"></div></div>
            <?= Recaptcha::widget() ?>
            <button class="btn btn-primary btn-block" type="submit"><?= e(t('auth.send_link')) ?></button>
        </form>
        <p class="center small mt-2 mb-0"><a href="<?= e(url('/login')) ?>"><i class="fa-solid fa-arrow-left"></i> <?= e(t('auth.back_login')) ?></a> · <a href="<?= e(url('/contact')) ?>"><?= e(t('nav.contact')) ?></a></p>
        <?php require VIEWS . '/components/auth-secure.php'; ?>
    </div>
</div>
