<?php
/** Login: manual (email/phone + password), Google, Passkey — nothing else. */
View::$meta['title'] = 'লগইন';
View::$meta['description'] = setting('site_name') . '-এ লগইন করুন — পাসওয়ার্ড, Google অথবা Passkey দিয়ে।';
$next = safe_next((string) ($_GET['next'] ?? ''), '');
$manual = setting_on('auth_manual');
$google = Google::enabled();
$passkey = WebAuthn::enabled();
$error = (string) ($_SESSION['flash_error'] ?? '');
unset($_SESSION['flash_error']);
?>
<div class="auth-wrap">
  <div class="auth-card">
    <div class="card">
      <div class="auth-head">
        <img src="<?= e(brand_logo()) ?>" alt="" class="brand-logo" width="52" height="52">
        <h1><?= e(setting('login_title', 'আবার স্বাগতম')) ?></h1>
        <p><?= e(setting('login_subtitle')) ?></p>
      </div>
      <?php if ($error !== ''): ?><div class="form-error"><?= e($error) ?></div><?php endif; ?>
      <?php if ($manual): ?>
      <form action="<?= e(url('/api/auth/login')) ?>" method="post" data-ajax data-on-success="login" novalidate>
        <?= csrf_field() ?>
        <input type="hidden" name="next" value="<?= e($next) ?>">
        <div class="form-error" hidden></div>
        <div class="field">
          <label for="identifier">ইমেইল অথবা মোবাইল নম্বর</label>
          <input class="input" id="identifier" name="identifier" autocomplete="username webauthn" inputmode="email" required placeholder="you@example.com / 01XXXXXXXXX">
        </div>
        <div class="field">
          <div class="row between"><label for="password" class="label">পাসওয়ার্ড</label><a href="<?= e(url('/forgot-password')) ?>" class="small" data-link>পাসওয়ার্ড ভুলে গেছেন?</a></div>
          <div class="input-group">
            <input class="input" id="password" type="password" name="password" autocomplete="current-password" required placeholder="••••••••">
            <button type="button" class="icon-btn input-addon" data-action="toggle-pass" aria-label="পাসওয়ার্ড দেখুন"><?= icon('eye') ?></button>
          </div>
        </div>
        <?= Captcha::widget('login') ?>
        <label class="check" style="margin-bottom:16px"><input type="checkbox" name="remember" value="1" checked> আমাকে মনে রাখুন</label>
        <button type="submit" class="btn btn-primary btn-block btn-lg" data-loading="লগইন হচ্ছে...">লগইন করুন</button>
      </form>
      <?php endif; ?>
      <?php if ($google || $passkey): ?>
        <?php if ($manual): ?><div class="divider">অথবা</div><?php endif; ?>
        <div class="auth-alt">
          <?php if ($google): ?><a href="<?= e(url('/auth/google' . ($next ? '?next=' . rawurlencode($next) : ''))) ?>" class="btn btn-google btn-block btn-lg"><?= Icons::google() ?> Continue with Google</a><?php endif; ?>
          <?php if ($passkey): ?><button type="button" class="btn btn-passkey btn-block btn-lg" data-action="passkey-login"><?= icon('fingerprint') ?> Passkey দিয়ে লগইন</button><?php endif; ?>
        </div>
      <?php endif; ?>
      <?php if (!$manual && !$google && !$passkey): ?><div class="alert alert-warn"><?= icon('alert') ?><div>লগইন সাময়িকভাবে বন্ধ আছে।</div></div><?php endif; ?>
    </div>
    <?php if (setting_on('auth_registration')): ?><p class="auth-foot">অ্যাকাউন্ট নেই? <a href="<?= e(url('/register')) ?>" data-link>অ্যাকাউন্ট তৈরি করুন</a></p><?php endif; ?>
  </div>
</div>
