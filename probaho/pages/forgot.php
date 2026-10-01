<?php
View::$meta['title'] = 'পাসওয়ার্ড রিসেট';
View::$meta['noindex'] = true;
?>
<div class="auth-wrap">
  <div class="auth-card">
    <div class="card">
      <div class="auth-head">
        <span class="ic-box" style="margin:0 auto 10px;width:56px;height:56px"><?= icon('key') ?></span>
        <h1>পাসওয়ার্ড ভুলে গেছেন?</h1>
        <p>আপনার ইমেইল দিন — রিসেট লিংক পাঠানো হবে।</p>
      </div>
      <form action="<?= e(url('/api/auth/forgot')) ?>" method="post" data-ajax data-reset novalidate>
        <?= csrf_field() ?>
        <div class="form-error" hidden></div>
        <div class="field"><label for="f-email">ইমেইল</label><input class="input" id="f-email" type="email" name="email" autocomplete="email" required placeholder="you@example.com"></div>
        <?= Captcha::widget('login') ?>
        <button type="submit" class="btn btn-primary btn-block btn-lg">রিসেট লিংক পাঠান</button>
      </form>
    </div>
    <p class="auth-foot"><a href="<?= e(url('/login')) ?>" data-link>← লগইনে ফিরে যান</a></p>
  </div>
</div>
