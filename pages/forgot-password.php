<?php
/** Forgot password (request link) and reset password (with token). */
defined('APP') || exit;

$token = input('token');
$reset = defined('NAV_PATH') ? NAV_PATH === '/reset-password' : request_path() === '/reset-password';
$valid = $reset && check_email_token($token, 'reset', false) !== null;
meta(['title' => $reset ? t('auth.reset_title') : t('auth.forgot_title'), 'robots' => 'noindex', 'cache' => false]);
?>
<div class="page auth-wrap" data-page="forgot">
  <div class="card auth-card">
    <?php include ROOT . '/includes/auth-brand.php'; ?>
    <?php if (!$reset): ?>
      <div class="auth-head"><span class="icon-box lg"><i class="fa-solid fa-key"></i></span><h1><?= e(t('auth.forgot_title')) ?></h1><p><?= e(t('auth.forgot_sub')) ?></p></div>
      <form method="post" action="<?= e(url('/api/auth?action=forgot')) ?>" data-ajax data-reset data-recaptcha="forgot" novalidate>
        <?= csrf_field() ?>
        <div class="form-group"><label class="label" for="f-email"><?= e(t('form.email')) ?></label>
          <div class="input-icon"><i class="fa-regular fa-envelope"></i><input class="input" id="f-email" type="email" name="email" required maxlength="191" autocomplete="email"></div></div>
        <button class="btn btn-block btn-lg" type="submit"><?= e(t('auth.send_link')) ?></button>
      </form>
    <?php elseif (!$valid): ?>
      <div class="auth-head"><span class="icon-box lg danger"><i class="fa-solid fa-link-slash"></i></span><h1><?= e(t('auth.link_invalid')) ?></h1><p><?= e(t('auth.link_invalid_sub')) ?></p></div>
      <a class="btn btn-block" href="<?= e(url('/forgot-password')) ?>"><?= e(t('auth.send_link')) ?></a>
    <?php else: ?>
      <div class="auth-head"><span class="icon-box lg"><i class="fa-solid fa-lock-open"></i></span><h1><?= e(t('auth.reset_title')) ?></h1><p><?= e(t('auth.reset_sub')) ?></p></div>
      <form method="post" action="<?= e(url('/api/auth?action=reset')) ?>" data-ajax novalidate>
        <?= csrf_field() ?>
        <input type="hidden" name="token" value="<?= e($token) ?>">
        <div class="form-group"><label class="label" for="p1"><?= e(t('form.new_password')) ?></label>
          <div class="input-icon"><i class="fa-solid fa-lock"></i><input class="input" id="p1" type="password" name="password" required maxlength="200" autocomplete="new-password">
            <button type="button" class="icon-btn toggle-pw" data-action="toggle-pw" aria-label="<?= e(t('auth.show_password')) ?>"><i class="fa-regular fa-eye"></i></button></div>
          <p class="hint"><?= e(t('auth.password_rule', ['n' => num((int)setting('security.password_min', 8))])) ?></p></div>
        <div class="form-group"><label class="label" for="p2"><?= e(t('form.confirm_password')) ?></label>
          <div class="input-icon"><i class="fa-solid fa-lock"></i><input class="input" id="p2" type="password" name="password_confirm" required maxlength="200" autocomplete="new-password"></div></div>
        <button class="btn btn-block btn-lg" type="submit"><?= e(t('auth.reset_btn')) ?></button>
      </form>
    <?php endif ?>
    <p class="auth-foot"><a href="<?= e(url('/login')) ?>"><i class="fa-solid fa-arrow-left"></i> <?= e(t('auth.back_login')) ?></a></p>
  </div>
</div>
