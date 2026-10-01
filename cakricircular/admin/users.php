<?php
/* ================= এডমিন ও মডারেটর ================= */
admin_start('এডমিন ও মডারেটর');
need('users');

$PERMS = [
    'posts'      => 'পোস্ট (যোগ/এডিট/ডিলিট)',
    'categories' => 'ক্যাটাগরি',
    'banners'    => 'ব্যানার',
    'notices'    => 'নোটিশ',
    'reports'    => 'রিপোর্ট',
    'analytics'  => 'অ্যানালিটিকস',
    'users'      => 'এডমিন ব্যবস্থাপনা',
    'settings'   => 'সেটিংস',
];
$me = admin_user();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_guard();
    if ($me['role'] !== 'super') { flash('err', 'শুধু মেইন এডমিন এই কাজ করতে পারবেন।'); admin_go(au('users')); }
    $do = (string)($_POST['do'] ?? '');

    if ($do === 'save') {
        $id   = (int)($_POST['id'] ?? 0);
        $user = trim((string)$_POST['username']);
        $role = in_array($_POST['role'] ?? '', ['admin', 'moderator'], true) ? $_POST['role'] : 'moderator';
        $perm = json_encode(array_values(array_intersect(array_keys($PERMS), (array)($_POST['perms'] ?? []))), JSON_UNESCAPED_UNICODE);
        $act  = isset($_POST['is_active']) ? 1 : 0;

        if (!preg_match('/^[a-zA-Z0-9_]{4,30}$/', $user)) flash('err', 'ইউজারনেম ৪-৩০ অক্ষরের (a-z, 0-9, _) হতে হবে।');
        else {
            if ($id) {
                q("UPDATE admins SET username=?, name=?, role=?, perms=?, is_active=? WHERE id=? AND role <> 'super'",
                  [$user, trim((string)$_POST['name']), $role, $perm, $act, $id]);
                if (($_POST['password'] ?? '') !== '') {
                    if (strlen($_POST['password']) < 8) flash('err', 'পাসওয়ার্ড অন্তত ৮ অক্ষরের দিন।');
                    else q("UPDATE admins SET pass = ? WHERE id = ?", [password_hash($_POST['password'], PASSWORD_DEFAULT), $id]);
                }
                if (empty($_SESSION['flash'])) flash('ok', 'আপডেট হয়েছে।');
            } else {
                if (strlen((string)$_POST['password']) < 8) flash('err', 'পাসওয়ার্ড অন্তত ৮ অক্ষরের দিন।');
                elseif (one("SELECT id FROM admins WHERE username = ?", [$user])) flash('err', 'এই ইউজারনেম আগেই আছে।');
                else {
                    q("INSERT INTO admins (username, pass, name, role, perms, is_active, created_at) VALUES (?,?,?,?,?,?,NOW())",
                      [$user, password_hash($_POST['password'], PASSWORD_DEFAULT), trim((string)$_POST['name']), $role, $perm, $act]);
                    flash('ok', 'নতুন অ্যাকাউন্ট তৈরি হয়েছে।');
                }
            }
        }
    } elseif ($do === 'delete') {
        $id = (int)$_POST['id'];
        if ($id === (int)$me['id']) flash('err', 'নিজের অ্যাকাউন্ট মোছা যাবে না।');
        else { q("DELETE FROM admins WHERE id = ? AND role <> 'super'", [$id]); flash('ok', 'মুছে ফেলা হয়েছে।'); }
    }
    admin_go(au('users'));
}

$edit = isset($_GET['id']) ? one("SELECT * FROM admins WHERE id = ?", [(int)$_GET['id']]) : null;
$editPerms = $edit ? (json_decode($edit['perms'] ?: '[]', true) ?: []) : [];
$rows = all("SELECT * FROM admins ORDER BY role = 'super' DESC, id");
show_flash();
?>
<?php if ($me['role'] !== 'super'): ?>
  <div class="msg err">শুধু মেইন এডমিন নতুন এডমিন/মডারেটর যোগ বা সম্পাদনা করতে পারবেন।</div>
<?php endif; ?>

<div class="a-card">
  <h2><i class="fa <?= $edit ? 'fa-pen' : 'fa-user-plus' ?>"></i><?= $edit ? 'অ্যাকাউন্ট এডিট' : 'নতুন এডমিন / মডারেটর' ?></h2>
  <form method="post">
    <?= csrf_field() ?>
    <input type="hidden" name="do" value="save">
    <input type="hidden" name="id" value="<?= (int)($edit['id'] ?? 0) ?>">
    <div class="grid g4">
      <div><label>ইউজারনেম *</label><input type="text" name="username" required value="<?= e($edit['username'] ?? '') ?>"></div>
      <div><label>নাম</label><input type="text" name="name" value="<?= e($edit['name'] ?? '') ?>"></div>
      <div><label>পাসওয়ার্ড <?= $edit ? '(বদলাতে চাইলে)' : '*' ?></label><input type="password" name="password" <?= $edit ? '' : 'required' ?> autocomplete="new-password"></div>
      <div>
        <label>ভূমিকা</label>
        <select name="role">
          <option value="admin" <?= ($edit['role'] ?? '') === 'admin' ? 'selected' : '' ?>>এডমিন</option>
          <option value="moderator" <?= ($edit['role'] ?? 'moderator') === 'moderator' ? 'selected' : '' ?>>মডারেটর</option>
        </select>
      </div>
    </div>

    <div style="margin-top:14px">
      <label>কোন কোন অংশে প্রবেশাধিকার দেবেন</label>
      <div class="grid g3" style="gap:8px;margin-top:6px">
        <?php foreach ($PERMS as $k => $v): ?>
          <label style="display:flex;gap:8px;align-items:center;font-weight:500;background:#f8fbfa;border:1px solid var(--line);
                        padding:9px 12px;border-radius:11px;margin:0">
            <input type="checkbox" class="chk" name="perms[]" value="<?= e($k) ?>" <?= in_array($k, $editPerms, true) ? 'checked' : '' ?>>
            <?= e($v) ?>
          </label>
        <?php endforeach; ?>
      </div>
    </div>

    <div style="margin-top:14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <label style="display:flex;gap:8px;align-items:center;font-weight:500;margin:0">
        <input type="checkbox" class="chk" name="is_active" value="1" <?= (!$edit || $edit['is_active']) ? 'checked' : '' ?>> সক্রিয়</label>
    </div>
    <div class="save-bar">
      <button class="btn" type="submit"><i class="fa fa-floppy-disk"></i> সংরক্ষণ</button>
      <?php if ($edit): ?><a class="btn sec" href="<?= e(au('users')) ?>">বাতিল</a><?php endif; ?>
    </div>
  </form>
</div>

<div class="a-card">
  <h2><i class="fa fa-users"></i>সব অ্যাকাউন্ট</h2>
  <div class="a-list">
    <?php foreach ($rows as $r): $ps = json_decode($r['perms'] ?: '[]', true) ?: []; ?>
      <div class="a-row">
        <span class="pill <?= $r['role'] === 'super' ? 'on' : 'mut' ?>" style="flex:none">
          <?= $r['role'] === 'super' ? 'মেইন' : ($r['role'] === 'admin' ? 'এডমিন' : 'মডারেটর') ?></span>
        <div class="rw-tx">
          <b><?= e($r['username']) ?><?= $r['name'] ? ' · ' . e($r['name']) : '' ?></b>
          <small><?= $r['last_login'] ? 'শেষ লগইন ' . e(time_ago($r['last_login'])) : 'কখনো লগইন করেনি' ?></small>
        </div>
        <div class="rw-act">
          <button type="button" class="ibtn" data-view title="বিস্তারিত"><i class="fa fa-eye"></i></button>
          <?php if ($r['role'] !== 'super'): ?>
            <a class="ibtn" href="<?= e(au('users?id=' . $r['id'])) ?>" title="সম্পাদনা"><i class="fa fa-pen"></i></a>
            <button type="button" class="ibtn dan" data-del="<?= (int)$r['id'] ?>" title="মুছুন"><i class="fa fa-trash"></i></button>
          <?php else: ?>
            <span class="ibtn" title="সুরক্ষিত" style="cursor:default"><i class="fa fa-lock"></i></span>
          <?php endif; ?>
        </div>

        <script type="text/template" class="rw-full">
          <h3><?= e($r['username']) ?><?= $r['name'] ? ' — ' . e($r['name']) : '' ?></h3>
          <div class="am-meta">
            <span><?= $r['role'] === 'super' ? 'মেইন এডমিন' : ($r['role'] === 'admin' ? 'এডমিন' : 'মডারেটর') ?></span>
            <span><i class="fa fa-clock" style="margin-left:0;margin-right:5px"></i><?= $r['last_login'] ? e(time_ago($r['last_login'])) : 'লগইন করেনি' ?></span>
          </div>
          <div class="am-text"><?= $r['role'] === 'super' ? 'সব কিছুতে পূর্ণ অনুমতি আছে।' : e(implode('
', array_map(fn($k) => '• ' . ($PERMS[$k] ?? $k), $ps)) ?: 'কোনো অনুমতি দেওয়া হয়নি।') ?></div>
        </script>
      </div>
    <?php endforeach; ?>
  </div>

  <form method="post" id="userDelForm" style="display:none">
    <?= csrf_field() ?>
    <input type="hidden" name="do" value="delete">
    <input type="hidden" name="id" id="userDelId">
  </form>
  <script>
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-del]');
    if (!b) return;
    if (!confirm('অ্যাকাউন্টটি মুছে ফেলবেন?')) return;
    document.getElementById('userDelId').value = b.getAttribute('data-del');
    document.getElementById('userDelForm').submit();
  });
  </script>
</div>
<?php admin_end(); ?>
