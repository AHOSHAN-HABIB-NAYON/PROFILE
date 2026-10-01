<?php
/** Shared renderer for settings pages: settings, support, smtp, push, pwa, security. */
$titles = ['settings' => 'সেটিংস', 'support' => 'সাপোর্ট সেটিংস', 'smtp' => 'SMTP ইমেইল', 'push' => 'Web Push', 'pwa' => 'PWA', 'security' => 'সিকিউরিটি'];
View::$meta['title'] = $titles[$section] ?? 'সেটিংস';
?>
<?php if ($section === 'smtp'): ?>
  <div class="card admin-card" style="margin-bottom:14px">
    <form class="row wrap" action="<?= e(url('/v2admin/api/system/test-email')) ?>" method="post" data-ajax>
      <?= csrf_field() ?>
      <input class="input grow" type="email" name="to" required placeholder="টেস্ট ইমেইল পাঠানোর ঠিকানা" value="<?= e($admin['email']) ?>">
      <button class="btn btn-soft" data-loading="পাঠানো হচ্ছে..."><?= icon('mail') ?> টেস্ট ইমেইল</button>
    </form>
    <p class="hint small muted" style="margin:8px 0 0">টেমপ্লেট: Welcome, Verification, Password reset, Login alert, Passkey added, Payment success/failed, New product, Security alert, Report update।</p>
  </div>
<?php elseif ($section === 'push'): ?>
  <div class="card admin-card" style="margin-bottom:14px">
    <h3 class="card-title">VAPID কী</h3>
    <p class="small muted">পাবলিক কী ব্রাউজারে পাঠানো হয়; প্রাইভেট কী সার্ভারে এনক্রিপ্ট অবস্থায় থাকে। নতুন কী তৈরি করলে আগের সব সাবস্ক্রিপশন বাতিল হবে।</p>
    <code class="code-block"><?= e(WebPush::publicKey() ?: 'এখনো তৈরি হয়নি') ?></code>
    <div class="row wrap" style="margin-top:10px">
      <button class="btn btn-ghost" data-post="<?= e(url('/v2admin/api/system/vapid')) ?>" data-confirm="নতুন VAPID কী তৈরি করবেন? সব ডিভাইসকে আবার সাবস্ক্রাইব করতে হবে।" data-danger><?= icon('refresh') ?> নতুন কী তৈরি করুন</button>
      <a href="<?= e(url('/v2admin/notifications')) ?>" class="btn btn-soft" data-link><?= icon('send') ?> পুশ পাঠান</a>
    </div>
  </div>
<?php elseif ($section === 'settings'): ?>
  <div class="alert alert-info" style="margin-bottom:14px"><?= icon('info') ?><div>লগইন পদ্ধতি শুধুমাত্র তিনটি: ম্যানুয়াল, Google এবং Passkey। Binance শুধুমাত্র পেমেন্ট মেথড (Binance Pay পেজ থেকে নিয়ন্ত্রণ করুন)।</div></div>
<?php endif; ?>
<?= admin_settings_form($section) ?>
