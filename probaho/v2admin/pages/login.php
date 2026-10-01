<?php
/** /v2admin/login — separate admin authentication (+ first super-admin setup). */
View::$meta['title'] = 'অ্যাডমিন লগইন';
View::$meta['noindex'] = true;
$noAdmins = !(int) db()->val('SELECT COUNT(*) FROM admin_users');
$pending2fa = !empty($_SESSION['admin_2fa_pending']) && time() - (int) $_SESSION['admin_2fa_pending']['time'] < 600;
?>
<div class="auth-wrap" style="min-height:100vh">
  <div class="auth-card">
    <div class="card">
      <div class="auth-head">
        <img src="<?= e(brand_logo()) ?>" alt="" class="brand-logo" width="52" height="52">
        <h1><?= $noAdmins ? 'প্রথম অ্যাডমিন তৈরি করুন' : 'অ্যাডমিন প্যানেল' ?></h1>
        <p><?= e(setting('site_name')) ?> · নিরাপদ অ্যাক্সেস</p>
      </div>
      <?php if ($noAdmins): ?>
        <form action="<?= e(url('/v2admin/api/auth/setup')) ?>" method="post" data-ajax>
          <?= csrf_field() ?>
          <div class="form-error" hidden></div>
          <div class="field"><label>নাম</label><input class="input" name="name" required></div>
          <div class="field"><label>ইমেইল</label><input class="input" type="email" name="email" required autocomplete="username"></div>
          <div class="field"><label>পাসওয়ার্ড (কমপক্ষে ১০ অক্ষর)</label><input class="input" type="password" name="password" minlength="10" required autocomplete="new-password"></div>
          <button class="btn btn-primary btn-block btn-lg" type="submit">Super Admin তৈরি করুন</button>
        </form>
      <?php elseif ($pending2fa): ?>
        <form action="<?= e(url('/v2admin/api/auth/two-factor')) ?>" method="post" data-ajax>
          <?= csrf_field() ?>
          <div class="form-error" hidden></div>
          <div class="field"><label>Authenticator কোড</label><input class="input otp-input" name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required autofocus></div>
          <button class="btn btn-primary btn-block btn-lg" type="submit">যাচাই করুন</button>
        </form>
      <?php else: ?>
        <form action="<?= e(url('/v2admin/api/auth/login')) ?>" method="post" data-ajax>
          <?= csrf_field() ?>
          <div class="form-error" hidden></div>
          <div class="field"><label>ইমেইল</label><input class="input" type="email" name="email" required autocomplete="username"></div>
          <div class="field"><label>পাসওয়ার্ড</label><div class="input-group"><input class="input" type="password" name="password" required autocomplete="current-password"><button type="button" class="icon-btn input-addon" data-action="toggle-pass" aria-label="দেখুন"><?= icon('eye') ?></button></div></div>
          <button class="btn btn-primary btn-block btn-lg" type="submit" data-loading="যাচাই হচ্ছে...">লগইন</button>
        </form>
      <?php endif; ?>
    </div>
    <p class="auth-foot"><a href="<?= e(url('/')) ?>">← ওয়েবসাইটে ফিরে যান</a></p>
  </div>
</div>
