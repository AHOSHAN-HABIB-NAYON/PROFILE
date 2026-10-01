<?php
View::$meta['title'] = 'অফলাইন';
View::$meta['noindex'] = true;
?>
<div class="auth-wrap"><div class="auth-card"><div class="card center">
  <div class="receipt-ic warn"><?= icon('cloud-off') ?></div>
  <h1 style="font-size:21px">আপনি অফলাইনে আছেন</h1>
  <p class="muted">ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।</p>
  <a href="<?= e(url('/')) ?>" class="btn btn-primary btn-block">আবার চেষ্টা করুন</a>
</div></div></div>
