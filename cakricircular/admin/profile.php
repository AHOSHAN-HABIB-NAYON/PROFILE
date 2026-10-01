<?php
/* ================= নিজের প্রোফাইল ও পাসওয়ার্ড ================= */
admin_start('আমার অ্যাকাউন্ট');
$me = admin_user();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_guard();
    $cur = (string)($_POST['current'] ?? '');
    if (!password_verify($cur, $me['pass'])) {
        flash('err', 'বর্তমান পাসওয়ার্ড ভুল।');
    } else {
        $user = trim((string)($_POST['username'] ?? ''));
        $name = trim((string)($_POST['name'] ?? ''));
        if (!preg_match('/^[a-zA-Z0-9_]{4,30}$/', $user)) flash('err', 'ইউজারনেম ৪-৩০ অক্ষরের (a-z, 0-9, _) হতে হবে।');
        elseif (one("SELECT id FROM admins WHERE username = ? AND id <> ?", [$user, $me['id']])) flash('err', 'এই ইউজারনেম আগেই ব্যবহার হচ্ছে।');
        else {
            q("UPDATE admins SET username = ?, name = ? WHERE id = ?", [$user, $name, $me['id']]);
            $new = (string)($_POST['password'] ?? '');
            if ($new !== '') {
                if (strlen($new) < 8) flash('err', 'নতুন পাসওয়ার্ড অন্তত ৮ অক্ষরের দিন।');
                elseif ($new !== ($_POST['password2'] ?? '')) flash('err', 'দুইবারের পাসওয়ার্ড মেলেনি।');
                else {
                    q("UPDATE admins SET pass = ? WHERE id = ?", [password_hash($new, PASSWORD_DEFAULT), $me['id']]);
                    flash('ok', 'পাসওয়ার্ড বদলানো হয়েছে।');
                }
            }
            if (empty($_SESSION['flash'])) flash('ok', 'সংরক্ষণ হয়েছে।');
        }
    }
    admin_go(au('profile'));
}
show_flash();
?>
<div class="a-card" style="max-width:560px">
  <h2><i class="fa fa-user-gear"></i>অ্যাকাউন্ট তথ্য</h2>
  <form method="post">
    <?= csrf_field() ?>
    <div class="grid g2">
      <div><label>ইউজারনেম</label><input type="text" name="username" value="<?= e($me['username']) ?>" required></div>
      <div><label>নাম</label><input type="text" name="name" value="<?= e($me['name']) ?>"></div>
    </div>
    <div style="margin-top:12px"><label>বর্তমান পাসওয়ার্ড *</label>
      <input type="password" name="current" required autocomplete="current-password"></div>
    <div class="grid g2" style="margin-top:12px">
      <div><label>নতুন পাসওয়ার্ড</label><input type="password" name="password" autocomplete="new-password"></div>
      <div><label>নতুন পাসওয়ার্ড আবার</label><input type="password" name="password2" autocomplete="new-password"></div>
    </div>
    <p class="hint">পাসওয়ার্ড বদলাতে না চাইলে নতুন পাসওয়ার্ডের ঘর খালি রাখুন।</p>
    <div class="save-bar"><button class="btn" type="submit"><i class="fa fa-floppy-disk"></i> সংরক্ষণ করুন</button></div>
  </form>
</div>
<?php admin_end(); ?>
