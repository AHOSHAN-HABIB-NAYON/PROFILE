<?php
/** Admin overview. */
View::$meta['title'] = 'ড্যাশবোর্ড';
$today = date('Y-m-d');
$stats = [
    'users' => (int) db()->val('SELECT COUNT(*) FROM users'),
    'users_today' => (int) db()->val('SELECT COUNT(*) FROM users WHERE created_at >= ?', [$today]),
    'balance' => (float) db()->val('SELECT COALESCE(SUM(balance + locked_balance),0) FROM wallets'),
    'dep_today' => (float) db()->val("SELECT COALESCE(SUM(net_amount),0) FROM transactions WHERE type='deposit' AND status='success' AND method <> 'admin' AND created_at >= ?", [$today]),
    'pending_dep' => (int) db()->val("SELECT COUNT(*) FROM transactions WHERE type='deposit' AND status='pending'"),
    'pending_wd' => (int) db()->val("SELECT COUNT(*) FROM transactions WHERE type='withdraw' AND status='pending'"),
    'reports' => (int) db()->val("SELECT COUNT(*) FROM reports WHERE status IN ('pending','reviewing')"),
    'push' => (int) db()->val('SELECT COUNT(*) FROM push_subscriptions'),
    'passkeys' => (int) db()->val('SELECT COUNT(*) FROM passkeys'),
    'chats' => (int) db()->val("SELECT COUNT(*) FROM ai_chat_logs WHERE role='user' AND created_at >= ?", [$today]),
];
$days = [];
for ($i = 13; $i >= 0; $i--) {
    $days[date('Y-m-d', strtotime("-$i day"))] = 0.0;
}
foreach (db()->all("SELECT DATE(created_at) d, SUM(net_amount) s FROM transactions WHERE status='success' AND created_at >= ? GROUP BY DATE(created_at)", [array_key_first($days)]) as $r) {
    $days[$r['d']] = (float) $r['s'];
}
$max = max(1.0, max($days));
$recentTx = db()->all('SELECT t.*, u.name FROM transactions t JOIN users u ON u.id = t.user_id ORDER BY t.id DESC LIMIT 8');
$recentUsers = db()->all('SELECT id, name, email, created_at FROM users ORDER BY id DESC LIMIT 6');
$checks = [
    'SMTP ইমেইল' => [Mailer::enabled(), '/v2admin/smtp'],
    'Web Push' => [WebPush::enabled(), '/v2admin/push'],
    'Google লগইন' => [Google::enabled(), '/v2admin/settings'],
    'Binance Pay (' . BinancePay::mode() . ')' => [BinancePay::enabled(), '/v2admin/binance'],
    'AI (' . setting('ai_provider') . ')' => [AI::enabled(), '/v2admin/settings'],
    'HTTPS' => [is_https(), null],
];
?>
<div class="admin-stats">
  <?= admin_stat('users', 'মোট ইউজার', number_format($stats['users']) . ($stats['users_today'] ? '  (+' . $stats['users_today'] . ' আজ)' : ''), 'brand', '/v2admin/users') ?>
  <?= admin_stat('wallet', 'মোট ওয়ালেট ব্যালেন্স', money($stats['balance']), 'ok', '/v2admin/wallets') ?>
  <?= admin_stat('arrow-down', 'আজকের জমা', money($stats['dep_today']), 'info', '/v2admin/transactions?type=deposit') ?>
  <?= admin_stat('clock', 'অপেক্ষমাণ জমা / উত্তোলন', $stats['pending_dep'] . ' / ' . $stats['pending_wd'], 'warn', '/v2admin/transactions?status=pending') ?>
  <?= admin_stat('flag', 'খোলা রিপোর্ট', (string) $stats['reports'], 'err', '/v2admin/reports') ?>
  <?= admin_stat('bell', 'পুশ সাবস্ক্রাইবার', (string) $stats['push'], 'brand', '/v2admin/notifications') ?>
  <?= admin_stat('fingerprint', 'নিবন্ধিত Passkey', (string) $stats['passkeys'], 'ok') ?>
  <?= admin_stat('bot', 'আজকের AI প্রশ্ন', (string) $stats['chats'], 'info', '/v2admin/chat-logs') ?>
</div>

<div class="admin-grid-2">
  <section class="card admin-card">
    <div class="card-head"><h3 class="card-title">লেনদেনের পরিমাণ (১৪ দিন)</h3></div>
    <div class="bar-chart" role="img" aria-label="১৪ দিনের সফল লেনদেনের পরিমাণ">
      <?php foreach ($days as $d => $v): ?>
        <div class="bar" style="--h:<?= round($v / $max * 100, 1) ?>%" title="<?= e($d) ?>: <?= e(money($v)) ?>"><span></span><small><?= e(date('j', strtotime($d))) ?></small></div>
      <?php endforeach; ?>
    </div>
  </section>
  <section class="card admin-card">
    <div class="card-head"><h3 class="card-title">সিস্টেম স্ট্যাটাস</h3></div>
    <div class="list">
      <?php foreach ($checks as $label => [$on, $href]): ?>
        <<?= $href ? 'a href="' . e(url($href)) . '" data-link' : 'div' ?> class="list-item"><span class="li-main"><?= e($label) ?></span><?= $on ? '<span class="badge badge-ok">চালু</span>' : '<span class="badge badge-muted">বন্ধ / কনফিগার করুন</span>' ?></<?= $href ? 'a' : 'div' ?>>
      <?php endforeach; ?>
    </div>
  </section>
</div>

<div class="admin-grid-2">
  <section class="card admin-card table-card">
    <div class="card-head"><h3 class="card-title">সাম্প্রতিক লেনদেন</h3><a href="<?= e(url('/v2admin/transactions')) ?>" data-link>সব</a></div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>ID</th><th>ইউজার</th><th>ধরন</th><th>পরিমাণ</th><th>স্ট্যাটাস</th></tr></thead>
      <tbody><?php foreach ($recentTx as $t): ?><tr>
        <td><a href="<?= e(url('/v2admin/transactions/' . $t['id'])) ?>" data-link class="num"><?= e($t['uid']) ?></a></td>
        <td><?= e($t['name']) ?></td><td><?= e(tx_type_label($t['type'], $t['direction'])) ?></td>
        <td class="num"><?= e(money($t['net_amount'])) ?></td><td><?= status_badge($t['status']) ?></td>
      </tr><?php endforeach; ?></tbody>
    </table></div>
  </section>
  <section class="card admin-card table-card">
    <div class="card-head"><h3 class="card-title">নতুন ইউজার</h3><a href="<?= e(url('/v2admin/users')) ?>" data-link>সব</a></div>
    <div class="list">
      <?php foreach ($recentUsers as $u): ?>
        <a href="<?= e(url('/v2admin/users/' . $u['id'])) ?>" class="list-item" data-link><span class="avatar avatar-sm"><span class="avatar-initial"><?= e(mb_strtoupper(mb_substr($u['name'], 0, 1))) ?></span></span><span class="li-main"><span class="li-title"><?= e($u['name']) ?></span><span class="li-sub"><?= e($u['email']) ?></span></span><span class="small muted"><?= e(time_ago($u['created_at'])) ?></span></a>
      <?php endforeach; ?>
    </div>
  </section>
</div>
