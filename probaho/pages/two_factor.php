<?php
View::$meta['title'] = 'দ্বি-স্তর যাচাই';
View::$meta['noindex'] = true;
$pending = $_SESSION['pending_2fa'] ?? null;
if (!$pending || time() - (int) $pending['time'] > 600) {
    unset($_SESSION['pending_2fa']);
    redirect('/login');
}
?>
<div class="auth-wrap">
  <div class="auth-card">
    <div class="card">
      <div class="auth-head"><span class="ic-box" style="margin:0 auto 10px;width:56px;height:56px"><?= icon('shield') ?></span><h1>দ্বি-স্তর যাচাই (2FA)</h1><p>Authenticator অ্যাপে দেখানো ৬ সংখ্যার কোড দিন।</p></div>
      <form action="<?= e(url('/api/auth/two-factor')) ?>" method="post" data-ajax data-on-success="login" novalidate>
        <?= csrf_field() ?>
        <div class="form-error" hidden></div>
        <div class="field"><input class="input otp-input" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required placeholder="000000" autofocus></div>
        <button type="submit" class="btn btn-primary btn-block btn-lg">যাচাই করুন</button>
      </form>
    </div>
    <p class="auth-foot"><a href="<?= e(url('/login')) ?>" data-link>← অন্য পদ্ধতিতে লগইন</a></p>
  </div>
</div>
