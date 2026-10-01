<?php
/** Admin accounts (super admin) + own security (password, 2FA). */
View::$meta['title'] = 'অ্যাডমিন';
$isSuper = $admin['role'] === 'super';
$admins = $isSuper ? db()->all('SELECT * FROM admin_users ORDER BY id') : [];
$pending = $_SESSION['admin_totp_setup'] ?? null;
?>
<div class="admin-grid-2">
  <section class="card admin-card">
    <h3 class="card-title">আমার নিরাপত্তা</h3>
    <form action="<?= e(url('/v2admin/api/auth/password')) ?>" method="post" data-ajax data-reset style="margin-top:12px">
      <?= csrf_field() ?>
      <div class="field"><label>বর্তমান পাসওয়ার্ড</label><input class="input" type="password" name="current" required autocomplete="current-password"></div>
      <div class="field"><label>নতুন পাসওয়ার্ড (১০+ অক্ষর)</label><input class="input" type="password" name="password" minlength="10" required autocomplete="new-password"></div>
      <button class="btn btn-primary btn-block">পাসওয়ার্ড পরিবর্তন</button>
    </form>
    <hr style="border:0;border-top:1px solid var(--border);margin:18px 0">
    <?php if ($admin['totp_enabled']): ?>
      <div class="alert alert-ok"><?= icon('shield') ?><div>আপনার অ্যাকাউন্টে 2FA চালু আছে।</div></div>
    <?php elseif ($pending): ?>
      <p class="small">Authenticator অ্যাপে স্ক্যান করুন:</p>
      <div class="my-qr" style="width:190px" data-totp-uri="<?= e(Totp::uri($pending, $admin['email'])) ?>"></div>
      <p class="center num small"><b><?= e(trim(chunk_split($pending, 4, ' '))) ?></b></p>
      <form class="row" action="<?= e(url('/v2admin/api/auth/2fa-enable')) ?>" method="post" data-ajax><?= csrf_field() ?><input class="input otp-input grow" name="code" maxlength="6" required inputmode="numeric"><button class="btn btn-primary">চালু</button></form>
    <?php else: ?>
      <?php if (setting_on('security_admin_2fa')): ?><div class="alert alert-warn" style="margin-bottom:10px"><?= icon('alert') ?><div>সিকিউরিটি নীতি অনুযায়ী সব অ্যাডমিনের 2FA চালু রাখা আবশ্যক।</div></div><?php endif; ?>
      <button class="btn btn-soft btn-block" data-post="<?= e(url('/v2admin/api/auth/2fa-setup')) ?>"><?= icon('shield') ?> 2FA চালু করুন</button>
    <?php endif; ?>
  </section>
  <?php if ($isSuper): ?>
  <section class="card admin-card">
    <h3 class="card-title">নতুন অ্যাডমিন</h3>
    <form action="<?= e(url('/v2admin/api/system/admin-create')) ?>" method="post" data-ajax data-reset style="margin-top:12px">
      <?= csrf_field() ?>
      <div class="field"><label>নাম</label><input class="input" name="name" required></div>
      <div class="field"><label>ইমেইল</label><input class="input" type="email" name="email" required></div>
      <div class="field"><label>পাসওয়ার্ড (১০+ অক্ষর)</label><input class="input" type="password" name="password" minlength="10" required autocomplete="new-password"></div>
      <div class="field"><label>রোল</label><select class="select" name="role"><option value="editor">Editor (কনটেন্ট)</option><option value="admin">Admin (সব, অ্যাডমিন ব্যবস্থাপনা ছাড়া)</option><option value="super">Super Admin</option></select></div>
      <button class="btn btn-primary btn-block">তৈরি করুন</button>
    </form>
  </section>
  <?php endif; ?>
</div>
<?php if ($isSuper): ?>
<div class="card table-card"><div class="table-wrap"><table class="table">
  <thead><tr><th>নাম</th><th>ইমেইল</th><th>রোল</th><th>2FA</th><th>শেষ লগইন</th><th>স্ট্যাটাস</th><th></th></tr></thead>
  <tbody><?php foreach ($admins as $a): ?><tr>
    <td><?= e($a['name']) ?></td><td><?= e($a['email']) ?></td><td><span class="badge badge-brand"><?= e($a['role']) ?></span></td>
    <td><?= $a['totp_enabled'] ? '<span class="badge badge-ok">চালু</span>' : '<span class="badge badge-muted">বন্ধ</span>' ?></td>
    <td class="small muted"><?= e(bn_date($a['last_login_at'])) ?></td><td><?= $a['status'] === 'active' ? '<span class="badge badge-ok">সক্রিয়</span>' : '<span class="badge badge-err">নিষ্ক্রিয়</span>' ?></td>
    <td class="tbl-actions"><?php if ((int) $a['id'] !== (int) $admin['id']): ?>
      <button class="btn btn-sm btn-ghost" data-post="<?= e(url('/v2admin/api/system/admin-status')) ?>" data-id="<?= (int) $a['id'] ?>" data-confirm="এই অ্যাডমিনের অবস্থা পরিবর্তন করবেন?"><?= $a['status'] === 'active' ? 'নিষ্ক্রিয়' : 'সক্রিয়' ?></button>
      <?php if ($a['totp_enabled']): ?><button class="btn btn-sm btn-ghost" data-post="<?= e(url('/v2admin/api/system/admin-reset-2fa')) ?>" data-id="<?= (int) $a['id'] ?>" data-confirm="2FA রিসেট করবেন?">2FA রিসেট</button><?php endif; ?>
    <?php endif; ?></td>
  </tr><?php endforeach; ?></tbody>
</table></div></div>
<?php endif; ?>
