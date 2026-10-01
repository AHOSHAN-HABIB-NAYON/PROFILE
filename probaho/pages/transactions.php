<?php
/** Transaction history with type filters and incremental loading. */
View::$meta['title'] = 'লেনদেন';
$type = (string) ($_GET['type'] ?? 'all');
$types = ['all' => 'সব', 'deposit' => 'জমা', 'withdraw' => 'উত্তোলন', 'payment' => 'পেমেন্ট', 'transfer' => 'ট্রান্সফার'];
if (!isset($types[$type])) {
    $type = 'all';
}
$page = max(1, (int) ($_GET['page'] ?? 1));
$per = 20;
$where = 'user_id = ?';
$args = [(int) $user['id']];
if ($type !== 'all') {
    $where .= ' AND type = ?';
    $args[] = $type;
}
$rows = db()->all("SELECT * FROM transactions WHERE $where ORDER BY id DESC LIMIT " . ($per + 1) . ' OFFSET ' . (($page - 1) * $per), $args);
$hasMore = count($rows) > $per;
$rows = array_slice($rows, 0, $per);
$groups = [];
foreach ($rows as $t) {
    $groups[bn_date($t['created_at'], false)][] = $t;
}
?>
<div class="chips" style="margin-bottom:12px">
  <?php foreach ($types as $k => $label): ?>
    <a href="<?= e(url('/transactions' . ($k === 'all' ? '' : '?type=' . $k))) ?>" class="chip <?= $type === $k ? 'active' : '' ?>" data-link><?= e($label) ?></a>
  <?php endforeach; ?>
</div>
<div data-tx-list>
<?php foreach ($groups as $date => $items): ?>
  <div class="list-group-title"><?= e($date) ?></div>
  <div class="list"><?php foreach ($items as $t) echo tx_item($t); ?></div>
<?php endforeach; ?>
</div>
<?php if (!$rows && $page === 1): ?>
  <div class="card"><?= empty_state('history', 'কোনো লেনদেন পাওয়া যায়নি', $type === 'all' ? 'আপনার লেনদেন এখানে দেখা যাবে।' : 'এই ধরনের কোনো লেনদেন নেই।') ?></div>
<?php endif; ?>
<?php if ($hasMore): ?><div class="load-more"><button type="button" class="btn btn-ghost" data-load-more data-next="<?= $page + 1 ?>">আরও দেখুন</button></div><?php endif; ?>
