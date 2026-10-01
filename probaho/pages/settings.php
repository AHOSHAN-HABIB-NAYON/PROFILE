<?php
/** Settings: appearance, notifications, passkeys, password, 2FA, sessions. */
View::$meta['title'] = 'সেটিংস';
View::$meta['back'] = true;
$u = $user;
$passkeys = db()->all('SELECT * FROM passkeys WHERE user_id = ? ORDER BY id DESC', [$u['id']]);
$sessions = db()->all('SELECT * FROM user_sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > NOW() ORDER BY last_seen_at DESC LIMIT 15', [$u['id']]);
$currentSid = (int) ($_SESSION['sid'] ?? 0);
$allowed = array_filter(['light' => [setting_on('theme_light'), 'sun', 'লাইট'], 'dark' => [setting_on('theme_dark'), 'moon', 'ডার্ক'], 'system' => [setting_on('theme_system'), 'monitor', 'সিস্টেম']], static fn ($t) => $t[0]);
$twoFaOn = setting_on('auth_2fa');
$pendingSecret = $_SESSION['totp_setup'] ?? null;
$methods = ['password' => 'পাসওয়ার্ড', 'google' => 'Google', 'passkey' => 'Passkey'];
?>
<div class="settings-group mt-0">
  <h3>থিম</h3>
  <div class="card">
    <div class="seg" role="radiogroup" aria-label="থিম">
      <?php foreach ($allowed as $k => [$on, $ic, $label]): ?>
        <button type="button" data-theme-set="<?= e($k) ?>"><?= icon($ic) ?> <?= e($label) ?></button>
      <?php endforeach; ?>
    </div>
  </div>
</div>

<div class="settings-group">
  <h3>নোটিফিকেশন</h3>
  <div class="list">
    <label class="setting-row">
      <span class="tx-ic"><?= icon('bell') ?></span>
      <span class="li-main"><span class="li-title">পুশ নোটিফিকেশন</span><span class="li-sub" data-push-status>যাচাই করা হচ্ছে...</span></span>
      <span class="switch" data-action="push-toggle"><input type="checkbox" aria-label="পুশ নোটিফিকেশন"><span></span></span>
    </label>
    <form class="setting-row" action="<?= e(url('/api/profile/email-alerts')) ?>" method="post" data-ajax>
      <span class="tx-ic"><?= icon('mail') ?></span>
      <span class="li-main"><span class="li-title">ইমেইল নোটিফিকেশন</span><span class="li-sub">পেমেন্ট ও প্রোডাক্ট আপডেট ইমেইলে</span></span>
      <span class="switch"><input type="checkbox" name="enabled" value="1" <?= $u['email_alerts'] ? 'checked' : '' ?> onchange="this.form.requestSubmit()" aria-label="ইমেইল নোটিফিকেশন"><span></span></span>
    </form>
  </div>
</div>

<?php if (WebAuthn::enabled()): ?>
<div class="settings-group" id="passkeys">
  <h3>Passkey</h3>
  <div class="card" style="padding:14px">
    <p class="small muted" style="margin-bottom:12px">ফিঙ্গারপ্রিন্ট, ফেস আনলক, ডিভাইস PIN বা Windows Hello দিয়ে পাসওয়ার্ড ছাড়া লগইন করুন। আপনার বায়োমেট্রিক তথ্য কখনো আমাদের সার্ভারে আসে না।</p>
    <button type="button" class="btn btn-primary btn-block" data-action="passkey-add"><?= icon('plus') ?> নতুন Passkey যোগ করুন</button>
  </div>
  <?php if ($passkeys): ?>
  <div class="list" style="margin-top:10px">
    <?php foreach ($passkeys as $p): ?>
      <div class="list-item passkey-item" data-item>
        <span class="tx-ic"><?= icon('fingerprint') ?></span>
        <span class="li-main">
          <span class="li-title"><?= e($p['name']) ?><?= $p['backed_up'] ? ' <span class="badge badge-info">সিঙ্ক</span>' : '' ?></span>
          <span class="li-sub"><?= e($p['device_info']) ?> · যোগ: <?= e(bn_date($p['created_at'], false)) ?></span>
          <span class="li-sub">শেষ ব্যবহার: <?= $p['last_used_at'] ? e(time_ago($p['last_used_at'])) : 'এখনো ব্যবহার হয়নি' ?></span>
        </span>
        <button class="icon-btn" data-action="passkey-rename" data-id="<?= (int) $p['id'] ?>" data-name="<?= e($p['name']) ?>" aria-label="নাম পরিবর্তন"><?= icon('edit') ?></button>
        <button class="icon-btn" data-post="<?= e(url('/api/passkey/delete')) ?>" data-id="<?= (int) $p['id'] ?>" data-confirm="এই Passkey মুছে ফেলবেন? এই ডিভাইস দিয়ে আর Passkey লগইন করা যাবে না।" data-danger aria-label="মুছুন"><?= icon('trash') ?></button>
      </div>
    <?php endforeach; ?>
  </div>
  <?php endif; ?>
</div>
<?php endif; ?>

<div class="settings-group">
  <h3><?= $u['password_hash'] ? 'পাসওয়ার্ড পরিবর্তন' : 'পাসওয়ার্ড সেট করুন' ?></h3>
  <form class="card" action="<?= e(url('/api/profile/password')) ?>" method="post" data-ajax data-reset>
    <?= csrf_field() ?>
    <div class="form-error" hidden></div>
    <?php if ($u['password_hash']): ?><div class="field"><label for="s-cur">বর্তমান পাসওয়ার্ড</label><input class="input" id="s-cur" type="password" name="current" autocomplete="current-password" required></div><?php endif; ?>
    <div class="field"><label for="s-new">নতুন পাসওয়ার্ড</label><input class="input" id="s-new" type="password" name="password" autocomplete="new-password" required></div>
    <div class="field"><label for="s-new2">নতুন পাসওয়ার্ড নিশ্চিত করুন</label><input class="input" id="s-new2" type="password" name="password_confirm" autocomplete="new-password" required></div>
    <button type="submit" class="btn btn-primary btn-block">পাসওয়ার্ড সংরক্ষণ</button>
  </form>
</div>

<?php if ($twoFaOn): ?>
<div class="settings-group">
  <h3>দ্বি-স্তর যাচাই (2FA)</h3>
  <div class="card">
    <?php if ($u['totp_enabled']): ?>
      <div class="alert alert-ok" style="margin-bottom:12px"><?= icon('shield') ?><div>2FA চালু আছে। লগইন ও ট্রান্সফারে Authenticator কোড লাগবে।</div></div>
      <form action="<?= e(url('/api/profile/2fa-disable')) ?>" method="post" data-ajax data-confirm="2FA বন্ধ করলে অ্যাকাউন্টের নিরাপত্তা কমে যাবে। নিশ্চিত?" data-danger>
        <?= csrf_field() ?>
        <div class="field"><label for="tf-off">Authenticator কোড</label><input class="input otp-input" id="tf-off" name="code" inputmode="numeric" maxlength="6" required></div>
        <button class="btn btn-ghost btn-block" type="submit">2FA বন্ধ করুন</button>
      </form>
    <?php elseif ($pendingSecret): ?>
      <p class="small">Google Authenticator / Microsoft Authenticator অ্যাপে QR স্ক্যান করুন অথবা কী লিখুন:</p>
      <div class="my-qr" style="width:200px" data-totp-uri="<?= e(Totp::uri($pendingSecret, $u['email'])) ?>"><div class="skeleton" style="aspect-ratio:1"></div></div>
      <p class="center num small" style="margin:10px 0;word-break:break-all"><b><?= e(trim(chunk_split($pendingSecret, 4, ' '))) ?></b><button class="copy-btn" data-copy-text="<?= e($pendingSecret) ?>" aria-label="কপি"><?= icon('copy') ?></button></p>
      <form action="<?= e(url('/api/profile/2fa-enable')) ?>" method="post" data-ajax>
        <?= csrf_field() ?>
        <div class="form-error" hidden></div>
        <div class="field"><label for="tf-on">অ্যাপে দেখানো ৬ সংখ্যার কোড</label><input class="input otp-input" id="tf-on" name="code" inputmode="numeric" maxlength="6" required></div>
        <button class="btn btn-primary btn-block" type="submit">যাচাই করে চালু করুন</button>
      </form>
    <?php else: ?>
      <p class="small muted">Authenticator অ্যাপের কোড দিয়ে অতিরিক্ত নিরাপত্তা যোগ করুন।</p>
      <button class="btn btn-primary btn-block" data-post="<?= e(url('/api/profile/2fa-setup')) ?>"><?= icon('shield') ?> 2FA চালু করুন</button>
    <?php endif; ?>
  </div>
</div>
<?php endif; ?>

<div class="settings-group">
  <h3>সক্রিয় সেশন</h3>
  <div class="list">
    <?php foreach ($sessions as $s): ?>
      <div class="list-item" data-item>
        <span class="tx-ic"><?= icon(stripos((string) $s['user_agent'], 'mobile') !== false ? 'smartphone' : 'monitor') ?></span>
        <span class="li-main">
          <span class="li-title"><?= e(device_label((string) $s['user_agent'])) ?><?= (int) $s['id'] === $currentSid ? ' <span class="badge badge-ok">এই ডিভাইস</span>' : '' ?></span>
          <span class="li-sub"><?= e($methods[$s['method']] ?? $s['method']) ?> · <?= e($s['ip']) ?> · <?= e(time_ago($s['last_seen_at'])) ?></span>
        </span>
        <?php if ((int) $s['id'] !== $currentSid): ?><button class="icon-btn" data-post="<?= e(url('/api/profile/revoke-session')) ?>" data-id="<?= (int) $s['id'] ?>" data-then="remove" aria-label="লগআউট করুন"><?= icon('logout') ?></button><?php endif; ?>
      </div>
    <?php endforeach; ?>
  </div>
  <?php if (count($sessions) > 1): ?><button class="btn btn-ghost btn-block" style="margin-top:10px" data-post="<?= e(url('/api/profile/revoke-others')) ?>" data-confirm="অন্যান্য সব ডিভাইস থেকে লগআউট করবেন?">অন্য সব ডিভাইস থেকে লগআউট</button><?php endif; ?>
</div>
<button type="button" class="btn btn-ghost btn-block" style="margin-top:18px;color:var(--err)" data-action="logout"><?= icon('logout') ?> লগআউট</button>
