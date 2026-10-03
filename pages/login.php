<?php
/** Login: email+password → (2FA | email code) ; Google ; Passkey. */
defined('APP') || exit;
require_once ROOT . '/core/google.php';

$next = safe_next(input('next'), '/');
if (user()) throw new RedirectTo($next === '/' ? '/profile' : $next);
$step = in_array(input('step'), ['2fa', 'email'], true) && pending_login() ? input('step') : '';
meta(['title' => t('auth.login'), 'robots' => 'noindex', 'cache' => false]);
?>
<div class="page auth-wrap" data-page="login" data-init="login" data-step="<?= e($step) ?>">
  <div class="card auth-card">
    <?php if (maintenance_active() || setting_bool('maintenance.enabled')): ?><div class="alert warning mb-2"><i class="fa-solid fa-screwdriver-wrench"></i><span><?= e(t('auth.maintenance_login')) ?></span></div><?php endif ?>

    <form method="post" action="<?= e(url('/api/auth?action=login')) ?>" data-ajax data-recaptcha="login" data-step-form="password" novalidate>
      <?php include ROOT . '/includes/auth-brand.php'; ?>
      <div class="auth-head">
        <h1><?= e(t('auth.login')) ?> 👋</h1>
        <p><?= e(t('auth.login_sub')) ?></p>
      </div>
      <?= csrf_field() ?>
      <input type="hidden" name="next" value="<?= e($next) ?>">
      <?php if (google_enabled()): ?>
        <a class="btn btn-block btn-google" href="<?= e(url('/auth/google?next=' . rawurlencode($next))) ?>" data-no-spa><?php include ROOT . '/includes/google-icon.php'; ?><?= e(t('auth.google')) ?></a>
      <?php endif ?>
      <?php if (setting_bool('security.passkeys_enabled')): ?><button type="button" class="btn btn-block btn-ghost mt-1" data-action="passkey-login" data-next="<?= e($next) ?>" data-passkey-only hidden><i class="fa-solid fa-fingerprint"></i><?= e(t('auth.passkey_login')) ?></button><?php endif ?>
      <?php if (google_enabled() || setting_bool('security.passkeys_enabled')): ?><div class="or"><?= e(t('auth.or_email')) ?></div><?php endif ?>
      <div class="form-group"><label class="label" for="l-email"><?= e(t('form.email')) ?></label>
        <div class="input-icon"><i class="fa-regular fa-envelope"></i><input class="input" id="l-email" type="email" name="email" required autocomplete="username webauthn" inputmode="email" maxlength="191" placeholder="you@example.com"></div></div>
      <div class="form-group"><label class="label" for="l-pass"><?= e(t('form.password')) ?></label>
        <div class="input-icon"><i class="fa-solid fa-lock"></i><input class="input" id="l-pass" type="password" name="password" required autocomplete="current-password" maxlength="200" placeholder="••••••••">
          <button type="button" class="icon-btn toggle-pw" data-action="toggle-pw" aria-label="<?= e(t('auth.show_password')) ?>"><i class="fa-regular fa-eye"></i></button></div></div>
      <div class="row-between form-group">
        <label class="check"><input type="checkbox" name="remember" value="1" checked> <?= e(t('auth.remember')) ?></label>
        <a class="small" style="font-weight:700" href="<?= e(url('/forgot-password')) ?>"><?= e(t('auth.forgot')) ?></a>
      </div>
      <button class="btn btn-block btn-lg" type="submit"><i class="fa-solid fa-right-to-bracket"></i><?= e(t('auth.login')) ?></button>
      <p class="auth-safe"><i class="fa-solid fa-shield-halved"></i><?= e(t('auth.protected')) ?></p>
      <?php if (setting_bool('security.allow_registration')): ?><p class="auth-foot"><?= e(t('auth.no_account')) ?> <a href="<?= e(url('/register' . ($next !== '/' ? '?next=' . rawurlencode($next) : ''))) ?>"><?= e(t('auth.create_account')) ?></a></p><?php endif ?>
    </form>

    <form method="post" action="<?= e(url('/api/auth?action=verify_2fa')) ?>" data-ajax data-step-form="2fa" hidden novalidate>
      <div class="auth-head">
        <span class="icon-box lg"><i class="fa-solid fa-shield-halved"></i></span>
        <h1><?= e(t('auth.2fa_title')) ?></h1>
        <p><?= e(t('auth.2fa_sub')) ?></p>
      </div>
      <?= csrf_field() ?>
      <div class="form-group"><input class="input code-input" name="code" required autocomplete="one-time-code" inputmode="text" maxlength="12" placeholder="••••••" aria-label="<?= e(t('auth.code')) ?>"></div>
      <button class="btn btn-block btn-lg" type="submit"><?= e(t('auth.verify')) ?></button>
      <p class="hint center mt-2"><?= e(t('auth.recovery_hint')) ?></p>
      <p class="auth-foot"><button type="button" class="btn btn-sm btn-ghost" data-action="post" data-url="<?= e(url('/api/auth?action=2fa_recovery_request')) ?>" data-confirm="<?= e(t('auth.2fa_lost_confirm')) ?>"><?= e(t('auth.2fa_lost')) ?></button></p>
    </form>

    <form method="post" action="<?= e(url('/api/auth?action=verify_email_code')) ?>" data-ajax data-step-form="email" hidden novalidate>
      <div class="auth-head">
        <span class="icon-box lg"><i class="fa-solid fa-envelope-open-text"></i></span>
        <h1><?= e(t('auth.email_code_title')) ?></h1>
        <p><?= e(t('auth.email_code_sub')) ?></p>
      </div>
      <?= csrf_field() ?>
      <div class="form-group"><input class="input code-input" name="code" required autocomplete="one-time-code" inputmode="numeric" maxlength="6" pattern="\d{6}" placeholder="••••••" aria-label="<?= e(t('auth.code')) ?>"></div>
      <button class="btn btn-block btn-lg" type="submit"><?= e(t('auth.verify')) ?></button>
      <p class="auth-foot"><button type="button" class="btn btn-sm btn-ghost" data-action="post" data-url="<?= e(url('/api/auth?action=resend_login_code')) ?>"><?= e(t('auth.resend_code')) ?></button></p>
    </form>
  </div>
</div>
