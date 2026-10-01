<?php
View::$meta['title'] = 'ওয়ালেট';
$page = max(1, (int) ($_GET['page'] ?? 1));
$per = 40;
$total = (int) db()->val('SELECT COUNT(*) FROM wallets');
$sum = db()->row('SELECT COALESCE(SUM(balance),0) b, COALESCE(SUM(locked_balance),0) l FROM wallets');
$rows = db()->all('SELECT w.*, u.name, u.uid, u.email FROM wallets w JOIN users u ON u.id = w.user_id ORDER BY w.balance DESC LIMIT ' . $per . ' OFFSET ' . (($page - 1) * $per));
?>
<div class="admin-stats" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
  <?= admin_stat('wallet', 'মোট ব্যবহারযোগ্য ব্যালেন্স', money($sum['b']), 'ok') ?>
  <?= admin_stat('lock', 'মোট প্রক্রিয়াধীন (উত্তোলন)', money($sum['l']), 'warn') ?>
  <?= admin_stat('users', 'ওয়ালেট সংখ্যা', number_format($total)) ?>
</div>
<div class="card table-card"><div class="table-wrap"><table class="table">
  <thead><tr><th>ইউজার</th><th>ID</th><th>ব্যালেন্স</th><th>প্রক্রিয়াধীন</th><th>স্ট্যাটাস</th><th>আপডেট</th><th></th></tr></thead>
  <tbody><?php foreach ($rows as $w): ?><tr>
    <td><a href="<?= e(url('/v2admin/users/' . $w['user_id'])) ?>" data-link><?= e($w['name']) ?></a><br><small class="muted"><?= e($w['email']) ?></small></td>
    <td class="num"><?= e($w['uid']) ?></td><td class="num"><b><?= e(money($w['balance'])) ?></b></td><td class="num"><?= e(money($w['locked_balance'])) ?></td>
    <td><?= $w['status'] === 'active' ? '<span class="badge badge-ok">সক্রিয়</span>' : '<span class="badge badge-err">ফ্রিজ</span>' ?></td>
    <td class="small muted"><?= e(time_ago($w['updated_at'])) ?></td>
    <td><button class="btn btn-sm btn-ghost" data-post="<?= e(url('/v2admin/api/finance/wallet-status')) ?>" data-id="<?= (int) $w['id'] ?>" data-confirm="ওয়ালেটের অবস্থা পরিবর্তন করবেন?"><?= $w['status'] === 'active' ? 'ফ্রিজ' : 'আনফ্রিজ' ?></button></td>
  </tr><?php endforeach; ?></tbody>
</table></div></div>
<?= admin_pagination($total, $page, $per) ?>
