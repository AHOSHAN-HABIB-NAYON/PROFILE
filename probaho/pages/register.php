<?php
/** Registration (manual or Google). */
View::$meta['title'] = 'অ্যাকাউন্ট তৈরি করুন';
View::$meta['description'] = setting('site_name') . '-এ ফ্রি অ্যাকাউন্ট খুলুন।';
$open = setting_on('auth_registration');
?>
<div class="auth-wrap">
  <div class="auth-card">
    <div class="card">
      <div class="auth-head">
        <img src="<?= e(brand_logo()) ?>" alt="" class="brand-logo" width="52" height="52">
        <h1>অ্যাকাউন্ট তৈরি করুন</h1>
        <p>মাত্র এক মিনিটে শুরু করুন — সম্পূর্ণ ফ্রি</p>
      </div>
      <?php if (!$open): ?>
        <div class="alert alert-warn"><?= icon('alert') ?><div>নতুন রেজিস্ট্রেশন সাময়িকভাবে বন্ধ আছে।</div></div>
      <?php else: ?>
        <?php if (Google::enabled()): ?>
          <a href="<?= e(url('/auth/google')) ?>" class="btn btn-google btn-block btn-lg"><?= Icons::google() ?> Continue with Google</a>
          <?php if (setting_on('auth_manual')): ?><div class="divider">অথবা ইমেইল দিয়ে</div><?php endif; ?>
        <?php endif; ?>
        <?php if (setting_on('auth_manual')): ?>
        <form action="<?= e(url('/api/auth/register')) ?>" method="post" data-ajax novalidate>
          <?= csrf_field() ?>
          <div class="form-error" hidden></div>
          <div class="field"><label for="r-name">পূর্ণ নাম</label><input class="input" id="r-name" name="name" autocomplete="name" required maxlength="120" placeholder="আপনার নাম"></div>
          <div class="field"><label for="r-email">ইমেইল</label><input class="input" id="r-email" type="email" name="email" autocomplete="email" required placeholder="you@example.com"></div>
          <div class="field"><label for="r-phone">মোবাইল নম্বর</label><input class="input" id="r-phone" type="tel" name="phone" autocomplete="tel" inputmode="tel" placeholder="01XXXXXXXXX"></div>
          <div class="field">
            <label for="r-pass">পাসওয়ার্ড</label>
            <div class="input-group">
              <input class="input" id="r-pass" type="password" name="password" autocomplete="new-password" required placeholder="কমপক্ষে <?= e(bn_digits(setting('security_password_min', '8'))) ?> অক্ষর">
              <button type="button" class="icon-btn input-addon" data-action="toggle-pass" aria-label="পাসওয়ার্ড দেখুন"><?= icon('eye') ?></button>
            </div>
            <div class="pw-meter"><i></i></div>
          </div>
          <?= Captcha::widget('register') ?>
          <label class="check" style="margin-bottom:16px"><input type="checkbox" name="agree" value="1" required> আমি <a href="<?= e(url('/terms')) ?>" data-link>শর্তাবলী</a> ও <a href="<?= e(url('/privacy')) ?>" data-link>গোপনীয়তা নীতি</a> মেনে নিচ্ছি</label>
          <button type="submit" class="btn btn-primary btn-block btn-lg" data-loading="অ্যাকাউন্ট তৈরি হচ্ছে...">অ্যাকাউন্ট তৈরি করুন</button>
        </form>
        <?php endif; ?>
      <?php endif; ?>
    </div>
    <p class="auth-foot">আগেই অ্যাকাউন্ট আছে? <a href="<?= e(url('/login')) ?>" data-link>লগইন করুন</a></p>
  </div>
</div>
