<?php
/** Registration. */
defined('APP') || exit;
require_once ROOT . '/core/google.php';

$next = safe_next(input('next'), '/');
if (user()) throw new RedirectTo('/profile');
meta(['title' => t('auth.register'), 'robots' => 'noindex', 'cache' => false]);
$open = setting_bool('security.allow_registration');
?>
<div class="page auth-wrap" data-page="register">
  <div class="card auth-card">
    <div class="auth-head">
      <span class="icon-box lg"><i class="fa-solid fa-user-plus"></i></span>
      <h1><?= e(t('auth.create_account')) ?></h1>
      <p><?= e(t('auth.register_sub')) ?></p>
    </div>
    <?php if (!$open): ?>
      <div class="alert warning"><i class="fa-solid fa-lock"></i><span><?= e(t('auth.registration_closed')) ?></span></div>
    <?php else: ?>
    <form method="post" action="<?= e(url('/api/auth?action=register')) ?>" data-ajax data-recaptcha="register" novalidate>
      <?= csrf_field() ?>
      <input type="hidden" name="next" value="<?= e($next) ?>">
      <div class="form-group"><label class="label" for="r-name"><?= e(t('form.name')) ?></label>
        <div class="input-icon"><i class="fa-regular fa-user"></i><input class="input" id="r-name" name="name" required maxlength="120" autocomplete="name"></div></div>
      <div class="form-group"><label class="label" for="r-email"><?= e(t('form.email')) ?></label>
        <div class="input-icon"><i class="fa-regular fa-envelope"></i><input class="input" id="r-email" type="email" name="email" required maxlength="191" autocomplete="email" inputmode="email"></div></div>
      <div class="form-group"><label class="label" for="r-pass"><?= e(t('form.password')) ?></label>
        <div class="input-icon"><i class="fa-solid fa-lock"></i><input class="input" id="r-pass" type="password" name="password" required maxlength="200" autocomplete="new-password">
          <button type="button" class="icon-btn toggle-pw" data-action="toggle-pw" aria-label="<?= e(t('auth.show_password')) ?>"><i class="fa-regular fa-eye"></i></button></div>
        <p class="hint"><?= e(t('auth.password_rule', ['n' => num((int)setting('security.password_min', 8))])) ?></p></div>
      <div class="form-group"><label class="label" for="r-pass2"><?= e(t('form.confirm_password')) ?></label>
        <div class="input-icon"><i class="fa-solid fa-lock"></i><input class="input" id="r-pass2" type="password" name="password_confirm" required maxlength="200" autocomplete="new-password"></div></div>
      <label class="check form-group"><input type="checkbox" name="agree" value="1" required> <span class="small"><?= e(t('auth.agree')) ?></span></label>
      <button class="btn btn-block btn-lg" type="submit"><?= e(t('auth.create_account')) ?></button>
      <?php if (google_enabled()): ?>
        <div class="or"><?= e(t('auth.or')) ?></div>
        <a class="btn btn-block btn-google" href="<?= e(url('/auth/google?next=' . rawurlencode($next))) ?>" data-no-spa><i class="fa-brands fa-google" style="color:#ea4335"></i><?= e(t('auth.google')) ?></a>
      <?php endif ?>
    </form>
    <?php endif ?>
    <p class="auth-foot"><?= e(t('auth.have_account')) ?> <a href="<?= e(url('/login')) ?>"><?= e(t('auth.login')) ?></a></p>
  </div>
</div>
