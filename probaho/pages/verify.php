<?php
/** Email verification landing (link from email). */
View::$meta['title'] = 'ইমেইল ভেরিফিকেশন';
View::$meta['noindex'] = true;
$token = (string) ($_GET['token'] ?? '');
$ok = false;
if ($token !== '') {
    $row = db()->row("SELECT * FROM user_tokens WHERE token_hash = ? AND type = 'verify_email' AND used_at IS NULL AND expires_at > NOW()", [hash('sha256', $token)]);
    if ($row) {
        db()->q('UPDATE users SET email_verified_at = NOW() WHERE id = ?', [$row['user_id']]);
        db()->q('UPDATE user_tokens SET used_at = NOW() WHERE id = ?', [$row['id']]);
        Notify::user((int) $row['user_id'], 'security', 'ইমেইল ভেরিফাই হয়েছে ✓', 'আপনার ইমেইল ঠিকানা সফলভাবে নিশ্চিত হয়েছে।', '/profile', ['push' => false]);
        Auth::refresh();
        $ok = true;
    }
}
?>
<div class="auth-wrap">
  <div class="auth-card">
    <div class="card center">
      <div class="receipt-ic <?= $ok ? 'ok' : 'err' ?>"><?= icon($ok ? 'check' : 'x') ?></div>
      <h1 style="font-size:21px"><?= $ok ? 'ইমেইল ভেরিফাই হয়েছে' : 'লিংকটি কার্যকর নয়' ?></h1>
      <p class="muted"><?= $ok ? 'ধন্যবাদ! এখন আপনি সব ফিচার ব্যবহার করতে পারবেন।' : 'লিংকের মেয়াদ শেষ অথবা আগেই ব্যবহার করা হয়েছে। প্রোফাইল থেকে নতুন লিংক পাঠান।' ?></p>
      <a href="<?= e(url(Auth::check() ? '/dashboard' : '/login')) ?>" class="btn btn-primary btn-block" data-link><?= Auth::check() ? 'ড্যাশবোর্ডে যান' : 'লগইন করুন' ?></a>
    </div>
  </div>
</div>
