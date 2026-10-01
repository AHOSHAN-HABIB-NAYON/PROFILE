<?php
View::$meta['title'] = 'নতুন পাসওয়ার্ড';
View::$meta['noindex'] = true;
$token = (string) ($_GET['token'] ?? '');
$valid = $token !== '' && db()->val("SELECT 1 FROM user_tokens WHERE token_hash = ? AND type = 'reset_password' AND used_at IS NULL AND expires_at > NOW()", [hash('sha256', $token)]);
?>
<div class="auth-wrap">
  <div class="auth-card">
    <div class="card">
      <div class="auth-head"><span class="ic-box" style="margin:0 auto 10px;width:56px;height:56px"><?= icon('lock') ?></span><h1>নতুন পাসওয়ার্ড সেট করুন</h1></div>
      <?php if (!$valid): ?>
        <div class="alert alert-err"><?= icon('alert') ?><div>লিংকটি অবৈধ অথবা মেয়াদ শেষ হয়ে গেছে। আবার রিসেটের অনুরোধ করুন।</div></div>
        <a href="<?= e(url('/forgot-password')) ?>" class="btn btn-primary btn-block" style="margin-top:14px" data-link>আবার চেষ্টা করুন</a>
      <?php else: ?>
      <form action="<?= e(url('/api/auth/reset')) ?>" method="post" data-ajax novalidate>
        <?= csrf_field() ?>
        <input type="hidden" name="token" value="<?= e($token) ?>">
        <div class="form-error" hidden></div>
        <div class="field"><label for="n-pass">নতুন পাসওয়ার্ড</label><div class="input-group"><input class="input" id="n-pass" type="password" name="password" autocomplete="new-password" required><button type="button" class="icon-btn input-addon" data-action="toggle-pass" aria-label="দেখুন"><?= icon('eye') ?></button></div></div>
        <div class="field"><label for="n-pass2">পাসওয়ার্ড নিশ্চিত করুন</label><input class="input" id="n-pass2" type="password" name="password_confirm" autocomplete="new-password" required></div>
        <button type="submit" class="btn btn-primary btn-block btn-lg">পাসওয়ার্ড পরিবর্তন করুন</button>
      </form>
      <?php endif; ?>
    </div>
  </div>
</div>
