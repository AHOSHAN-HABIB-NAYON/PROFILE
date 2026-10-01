<?php
View::$meta['title'] = 'পেজ পাওয়া যায়নি';
View::$meta['noindex'] = true;
?>
<div class="auth-wrap"><div class="auth-card"><div class="card center">
  <div class="receipt-ic warn"><?= icon('search') ?></div>
  <h1 style="font-size:21px">পেজটি পাওয়া যায়নি</h1>
  <p class="muted">আপনি যে পেজটি খুঁজছেন সেটি সরানো হয়েছে অথবা লিংকটি ভুল।</p>
  <a href="<?= e(url(Auth::check() ? '/dashboard' : '/')) ?>" class="btn btn-primary btn-block" data-link>হোমে ফিরে যান</a>
</div></div></div>
