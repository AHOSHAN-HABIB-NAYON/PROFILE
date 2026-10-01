<?php
/** Users list + detail (wallet adjust, status, verification, notification). */
if ($id !== null) {
    $u = db()->row('SELECT * FROM users WHERE id = ?', [(int) $id]);
    if (!$u) {
        echo '<div class="card">' . empty_state('user', 'ইউজার পাওয়া যায়নি') . '</div>';
        return;
    }
    View::$meta['title'] = $u['name'];
    $w = Wallet::forUser((int) $u['id']);
    $tx = db()->all('SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 15', [$u['id']]);
    $pk = (int) db()->val('SELECT COUNT(*) FROM passkeys WHERE user_id = ?', [$u['id']]);
    $subs = (int) db()->val('SELECT COUNT(*) FROM push_subscriptions WHERE user_id = ?', [$u['id']]);
    $sessions = (int) db()->val('SELECT COUNT(*) FROM user_sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > NOW()', [$u['id']]);
    ?>
    <div class="admin-toolbar"><a href="<?= e(url('/v2admin/users')) ?>" class="btn btn-ghost btn-sm" data-link><?= icon('chevron-left') ?> সব ইউজার</a></div>
    <div class="admin-grid-2">
      <section class="card admin-card">
        <div class="row"><span class="avatar avatar-lg"><?php if ($u['avatar']): ?><img src="<?= e(upload_url($u['avatar'])) ?>" class="avatar-img" alt="" referrerpolicy="no-referrer"><?php else: ?><span class="avatar-initial"><?= e(mb_strtoupper(mb_substr($u['name'], 0, 1))) ?></span><?php endif; ?></span>
          <div class="grow"><h2 style="font-size:20px;margin:0"><?= e($u['name']) ?></h2><div class="muted small">ID <?= e($u['uid']) ?> · <?= status_badge($u['status']) ?></div></div></div>
        <div class="kv" style="margin-top:12px">
          <div><span class="k">ইমেইল</span><span class="v"><?= e($u['email']) ?> <?= $u['email_verified_at'] ? '<span class="badge badge-ok">ভেরিফায়েড</span>' : '<span class="badge badge-warn">আনভেরিফায়েড</span>' ?></span></div>
          <div><span class="k">মোবাইল</span><span class="v"><?= e($u['phone'] ?: '—') ?></span></div>
          <div><span class="k">লগইন পদ্ধতি</span><span class="v"><?= implode(', ', array_filter([$u['password_hash'] ? 'পাসওয়ার্ড' : '', $u['google_id'] ? 'Google' : '', $pk ? "Passkey ($pk)" : ''])) ?: '—' ?></span></div>
          <div><span class="k">2FA</span><span class="v"><?= $u['totp_enabled'] ? 'চালু' : 'বন্ধ' ?></span></div>
          <div><span class="k">গ্রুপ</span><span class="v"><?= e($u['user_group']) ?></span></div>
          <div><span class="k">পুশ ডিভাইস / সেশন</span><span class="v"><?= $subs ?> / <?= $sessions ?></span></div>
          <div><span class="k">শেষ লগইন</span><span class="v"><?= e(bn_date($u['last_login_at'])) ?> <small class="muted"><?= e($u['last_login_ip']) ?></small></span></div>
          <div><span class="k">যোগদান</span><span class="v"><?= e(bn_date($u['created_at'])) ?></span></div>
        </div>
        <div class="row wrap" style="margin-top:14px">
          <button class="btn btn-sm <?= $u['status'] === 'active' ? 'btn-danger' : 'btn-ok' ?>" data-post="<?= e(url('/v2admin/api/users/status')) ?>" data-id="<?= (int) $u['id'] ?>" data-confirm="<?= $u['status'] === 'active' ? 'ইউজারকে স্থগিত করবেন? সব সেশন বন্ধ হবে।' : 'ইউজারকে সক্রিয় করবেন?' ?>"><?= $u['status'] === 'active' ? 'স্থগিত করুন' : 'সক্রিয় করুন' ?></button>
          <?php if (!$u['email_verified_at']): ?><button class="btn btn-sm btn-soft" data-post="<?= e(url('/v2admin/api/users/verify')) ?>" data-id="<?= (int) $u['id'] ?>">ইমেইল ভেরিফাই করুন</button><?php endif; ?>
          <?php if ($u['totp_enabled']): ?><button class="btn btn-sm btn-ghost" data-post="<?= e(url('/v2admin/api/users/reset-2fa')) ?>" data-id="<?= (int) $u['id'] ?>" data-confirm="এই ইউজারের 2FA রিসেট করবেন?">2FA রিসেট</button><?php endif; ?>
          <button class="btn btn-sm btn-ghost" data-post="<?= e(url('/v2admin/api/users/logout-all')) ?>" data-id="<?= (int) $u['id'] ?>" data-confirm="সব ডিভাইস থেকে লগআউট করবেন?">সব সেশন বন্ধ</button>
        </div>
        <form class="row" style="margin-top:12px" action="<?= e(url('/v2admin/api/users/group')) ?>" method="post" data-ajax>
          <?= csrf_field() ?><input type="hidden" name="id" value="<?= (int) $u['id'] ?>">
          <input class="input grow" name="group" value="<?= e($u['user_group']) ?>" maxlength="40" placeholder="ইউজার গ্রুপ (যেমন vip)"><button class="btn btn-ghost">গ্রুপ সংরক্ষণ</button>
        </form>
      </section>
      <section class="card admin-card">
        <h3 class="card-title">ওয়ালেট</h3>
        <div class="admin-stats" style="grid-template-columns:1fr 1fr;margin:12px 0">
          <?= admin_stat('wallet', 'ব্যালেন্স', money($w['balance']), 'ok') ?>
          <?= admin_stat('lock', 'প্রক্রিয়াধীন', money($w['locked_balance']), 'warn') ?>
        </div>
        <form action="<?= e(url('/v2admin/api/finance/adjust')) ?>" method="post" data-ajax data-confirm="ব্যালেন্স সমন্বয় নিশ্চিত করবেন?">
          <?= csrf_field() ?><input type="hidden" name="user_id" value="<?= (int) $u['id'] ?>">
          <div class="row"><select class="select" name="direction" style="width:140px"><option value="credit">যোগ (+)</option><option value="debit">বিয়োগ (−)</option></select><input class="input grow" name="amount" type="number" step="0.01" min="0.01" required placeholder="পরিমাণ"></div>
          <input class="input" style="margin-top:8px" name="note" maxlength="200" required placeholder="কারণ / নোট (ইউজার দেখবে)">
          <button class="btn btn-primary btn-block" style="margin-top:8px">ব্যালেন্স সমন্বয়</button>
        </form>
        <button class="btn btn-ghost btn-block btn-sm" style="margin-top:8px" data-post="<?= e(url('/v2admin/api/finance/wallet-status')) ?>" data-id="<?= (int) $w['id'] ?>" data-confirm="ওয়ালেটের অবস্থা পরিবর্তন করবেন?"><?= $w['status'] === 'active' ? 'ওয়ালেট ফ্রিজ করুন' : 'ওয়ালেট আনফ্রিজ করুন' ?></button>
        <h3 class="card-title" style="margin-top:18px">নোটিফিকেশন পাঠান</h3>
        <form action="<?= e(url('/v2admin/api/notify/send')) ?>" method="post" data-ajax data-reset style="margin-top:8px">
          <?= csrf_field() ?><input type="hidden" name="target" value="user"><input type="hidden" name="target_value" value="<?= (int) $u['id'] ?>"><input type="hidden" name="category" value="admin">
          <input class="input" name="title" required maxlength="190" placeholder="শিরোনাম">
          <textarea class="textarea" style="margin-top:8px;min-height:80px" name="body" placeholder="বার্তা"></textarea>
          <div class="row wrap small" style="margin:8px 0"><label class="check"><input type="checkbox" name="channels[]" value="inapp" checked> ইন-অ্যাপ</label><label class="check"><input type="checkbox" name="channels[]" value="push" checked> পুশ</label><label class="check"><input type="checkbox" name="channels[]" value="email"> ইমেইল</label></div>
          <button class="btn btn-soft btn-block">পাঠান</button>
        </form>
      </section>
    </div>
    <section class="card admin-card table-card">
      <div class="card-head"><h3 class="card-title">সাম্প্রতিক লেনদেন</h3><a href="<?= e(url('/v2admin/transactions?q=' . $u['uid'])) ?>" data-link>সব</a></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>ID</th><th>ধরন</th><th>মেথড</th><th>পরিমাণ</th><th>স্ট্যাটাস</th><th>তারিখ</th></tr></thead><tbody>
      <?php foreach ($tx as $t): ?><tr><td><a class="num" href="<?= e(url('/v2admin/transactions/' . $t['id'])) ?>" data-link><?= e($t['uid']) ?></a></td><td><?= e(tx_type_label($t['type'], $t['direction'])) ?></td><td><?= e($t['method']) ?></td><td class="num"><?= $t['direction'] === 'credit' ? '+' : '−' ?><?= e(money($t['net_amount'])) ?></td><td><?= status_badge($t['status']) ?></td><td class="small muted"><?= e(bn_date($t['created_at'])) ?></td></tr><?php endforeach; ?>
      </tbody></table></div>
    </section>
    <?php
    return;
}

View::$meta['title'] = 'ইউজার';
$q = trim((string) ($_GET['q'] ?? ''));
$status = (string) ($_GET['status'] ?? '');
$page = max(1, (int) ($_GET['page'] ?? 1));
$per = 30;
$where = ['1'];
$args = [];
if ($q !== '') {
    $where[] = '(u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR u.uid = ?)';
    array_push($args, "%$q%", "%$q%", "%$q%", $q);
}
if (in_array($status, ['active', 'suspended'], true)) {
    $where[] = 'u.status = ?';
    $args[] = $status;
}
$w = implode(' AND ', $where);
$total = (int) db()->val("SELECT COUNT(*) FROM users u WHERE $w", $args);
$rows = db()->all("SELECT u.*, w.balance FROM users u LEFT JOIN wallets w ON w.user_id = u.id WHERE $w ORDER BY u.id DESC LIMIT $per OFFSET " . (($page - 1) * $per), $args);
?>
<div class="admin-toolbar">
  <form class="search-form" method="get" action="<?= e(url('/v2admin/users')) ?>" data-get-form>
    <input class="input" name="q" value="<?= e($q) ?>" placeholder="নাম, ইমেইল, মোবাইল, ID">
    <select class="select" name="status" style="width:150px"><option value="">সব</option><option value="active" <?= $status === 'active' ? 'selected' : '' ?>>সক্রিয়</option><option value="suspended" <?= $status === 'suspended' ? 'selected' : '' ?>>স্থগিত</option></select>
    <button class="btn btn-ghost btn-icon" aria-label="খুঁজুন"><?= icon('search') ?></button>
  </form>
  <span class="muted small">মোট <?= number_format($total) ?> জন</span>
</div>
<div class="card table-card"><div class="table-wrap"><table class="table">
  <thead><tr><th>ইউজার</th><th>ID</th><th>মোবাইল</th><th>ব্যালেন্স</th><th>গ্রুপ</th><th>স্ট্যাটাস</th><th>যোগদান</th></tr></thead>
  <tbody><?php foreach ($rows as $u): ?><tr>
    <td><a href="<?= e(url('/v2admin/users/' . $u['id'])) ?>" data-link class="tbl-link"><b><?= e($u['name']) ?></b><br><small class="muted"><?= e($u['email']) ?></small></a></td>
    <td class="num"><?= e($u['uid']) ?></td><td><?= e($u['phone'] ?: '—') ?></td><td class="num"><?= e(money($u['balance'] ?? 0)) ?></td>
    <td><span class="badge badge-muted"><?= e($u['user_group']) ?></span></td><td><?= status_badge($u['status']) ?></td><td class="small muted"><?= e(bn_date($u['created_at'], false)) ?></td>
  </tr><?php endforeach; ?></tbody>
</table></div><?php if (!$rows) echo empty_state('users', 'কোনো ইউজার পাওয়া যায়নি'); ?></div>
<?= admin_pagination($total, $page, $per, array_filter(['q' => $q, 'status' => $status])) ?>
