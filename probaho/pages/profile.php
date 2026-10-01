<?php
/** Profile overview + edit. */
View::$meta['title'] = 'প্রোফাইল';
$u = $user;
$reports = (int) db()->val('SELECT COUNT(*) FROM reports WHERE user_id = ?', [$u['id']]);
$passkeys = (int) db()->val('SELECT COUNT(*) FROM passkeys WHERE user_id = ?', [$u['id']]);
?>
<div class="card profile-head">
  <span class="avatar avatar-lg"><?php if ($u['avatar']): ?><img src="<?= e(upload_url($u['avatar'])) ?>" alt="" class="avatar-img" referrerpolicy="no-referrer"><?php else: ?><span class="avatar-initial"><?= e(mb_strtoupper(mb_substr((string) $u['name'], 0, 1))) ?></span><?php endif; ?></span>
  <h2><?= e($u['name']) ?></h2>
  <p class="muted mb-0">ইউজার আইডি: <b class="num"><?= e($u['uid']) ?></b><button class="copy-btn" data-copy-text="<?= e($u['uid']) ?>" aria-label="কপি"><?= icon('copy') ?></button></p>
  <div class="row" style="justify-content:center;margin-top:10px;gap:6px;flex-wrap:wrap">
    <?= $u['email_verified_at'] ? '<span class="badge badge-ok">' . icon('check') . ' ইমেইল ভেরিফায়েড</span>' : '<span class="badge badge-warn">ইমেইল ভেরিফাই বাকি</span>' ?>
    <?= $passkeys ? '<span class="badge badge-brand">' . icon('fingerprint') . ' ' . bn_digits((string) $passkeys) . 'টি Passkey</span>' : '' ?>
    <?= $u['totp_enabled'] ? '<span class="badge badge-ok">2FA চালু</span>' : '' ?>
  </div>
</div>

<div class="settings-group">
  <h3>অ্যাকাউন্ট</h3>
  <div class="list">
    <a href="<?= e(url('/settings')) ?>" class="list-item" data-link><span class="tx-ic"><?= icon('settings') ?></span><span class="li-main"><span class="li-title">সেটিংস ও নিরাপত্তা</span><span class="li-sub">থিম, Passkey, পাসওয়ার্ড, 2FA, সেশন</span></span><?= icon('chevron-right') ?></a>
    <a href="<?= e(url('/notifications')) ?>" class="list-item" data-link><span class="tx-ic"><?= icon('bell') ?></span><span class="li-main"><span class="li-title">নোটিফিকেশন</span></span><?= icon('chevron-right') ?></a>
    <a href="<?= e(url('/transactions')) ?>" class="list-item" data-link><span class="tx-ic"><?= icon('history') ?></span><span class="li-main"><span class="li-title">লেনদেন হিস্ট্রি</span></span><?= icon('chevron-right') ?></a>
    <a href="<?= e(url('/report')) ?>" class="list-item" data-link><span class="tx-ic"><?= icon('flag') ?></span><span class="li-main"><span class="li-title">রিপোর্ট ও অভিযোগ</span><span class="li-sub"><?= bn_digits((string) $reports) ?>টি রিপোর্ট</span></span><?= icon('chevron-right') ?></a>
    <a href="<?= e(url('/support')) ?>" class="list-item" data-link><span class="tx-ic"><?= icon('headset') ?></span><span class="li-main"><span class="li-title">সাপোর্ট</span></span><?= icon('chevron-right') ?></a>
    <a href="<?= e(url('/products')) ?>" class="list-item" data-link><span class="tx-ic"><?= icon('package') ?></span><span class="li-main"><span class="li-title">প্রোডাক্ট ও আপডেট</span></span><?= icon('chevron-right') ?></a>
    <button type="button" class="list-item" data-action="install-app"><span class="tx-ic"><?= icon('download') ?></span><span class="li-main"><span class="li-title">অ্যাপ ইনস্টল করুন</span></span><?= icon('chevron-right') ?></button>
  </div>
</div>

<div class="settings-group">
  <h3>প্রোফাইল তথ্য</h3>
  <form class="card" action="<?= e(url('/api/profile/update')) ?>" method="post" enctype="multipart/form-data" data-ajax>
    <?= csrf_field() ?>
    <div class="form-error" hidden></div>
    <div class="field"><label for="p-name">নাম</label><input class="input" id="p-name" name="name" value="<?= e($u['name']) ?>" maxlength="120" required></div>
    <div class="field"><label>ইমেইল</label><input class="input" value="<?= e($u['email']) ?>" disabled></div>
    <div class="field"><label for="p-phone">মোবাইল</label><input class="input" id="p-phone" name="phone" type="tel" value="<?= e($u['phone']) ?>" placeholder="01XXXXXXXXX"></div>
    <div class="field"><label for="p-avatar">প্রোফাইল ছবি</label><input class="input" id="p-avatar" type="file" name="avatar" accept="image/jpeg,image/png,image/webp"></div>
    <button type="submit" class="btn btn-primary btn-block">সংরক্ষণ করুন</button>
  </form>
  <?php if (!$u['email_verified_at']): ?>
    <button class="btn btn-soft btn-block" style="margin-top:10px" data-post="<?= e(url('/api/profile/resend-verification')) ?>" data-then="none"><?= icon('mail') ?> ভেরিফিকেশন ইমেইল পাঠান</button>
  <?php endif; ?>
</div>

<button type="button" class="btn btn-ghost btn-block" style="margin-top:18px;color:var(--err)" data-action="logout"><?= icon('logout') ?> লগআউট</button>
