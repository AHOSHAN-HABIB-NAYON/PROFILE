<?php
View::$meta['title'] = 'পেমেন্ট';
$page = max(1, (int) ($_GET['page'] ?? 1));
$per = 40;
$status = (string) ($_GET['status'] ?? '');
$where = in_array($status, ['pending', 'success', 'failed', 'expired', 'cancelled'], true) ? 'p.status = ?' : '1';
$args = $where === '1' ? [] : [$status];
$total = (int) db()->val("SELECT COUNT(*) FROM payments p WHERE $where", $args);
$rows = db()->all("SELECT p.*, u.name, t.uid AS tx_uid, t.id AS tx_id FROM payments p JOIN users u ON u.id = p.user_id LEFT JOIN transactions t ON t.id = p.transaction_id WHERE $where ORDER BY p.id DESC LIMIT $per OFFSET " . (($page - 1) * $per), $args);
$byMethod = db()->all("SELECT method_code, COUNT(*) c, COALESCE(SUM(CASE WHEN status='success' THEN amount END),0) s FROM payments GROUP BY method_code");
?>
<div class="admin-stats" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
  <?php foreach ($byMethod as $m): ?><?= admin_stat('card', $m['method_code'] . ' · ' . $m['c'] . 'টি', money($m['s']), 'brand') ?><?php endforeach; ?>
</div>
<div class="admin-toolbar">
  <div class="chips"><?php foreach (['' => 'সব', 'pending' => 'অপেক্ষমাণ', 'success' => 'সফল', 'failed' => 'ব্যর্থ', 'expired' => 'মেয়াদোত্তীর্ণ'] as $k => $v): ?><a class="chip <?= $status === $k ? 'active' : '' ?>" href="<?= e(url('/v2admin/payments' . ($k ? '?status=' . $k : ''))) ?>" data-link><?= $v ?></a><?php endforeach; ?></div>
</div>
<div class="card table-card"><div class="table-wrap"><table class="table">
  <thead><tr><th>#</th><th>ইউজার</th><th>মেথড</th><th>পরিমাণ</th><th>প্রোভাইডার রেফ</th><th>লেনদেন</th><th>স্ট্যাটাস</th><th>তারিখ</th></tr></thead>
  <tbody><?php foreach ($rows as $p): ?><tr>
    <td><?= (int) $p['id'] ?></td><td><a href="<?= e(url('/v2admin/users/' . $p['user_id'])) ?>" data-link><?= e($p['name']) ?></a></td>
    <td><?= e($p['method_code']) ?></td><td class="num"><?= e(number_format((float) $p['amount'], 2)) ?> <?= e($p['currency']) ?></td>
    <td class="num small"><?= e($p['provider_ref']) ?></td>
    <td><?= $p['tx_uid'] ? '<a class="num" href="' . e(url('/v2admin/transactions/' . $p['tx_id'])) . '" data-link>' . e($p['tx_uid']) . '</a>' : '—' ?></td>
    <td><?= status_badge($p['status']) ?></td><td class="small muted"><?= e(bn_date($p['created_at'])) ?></td>
  </tr><?php endforeach; ?></tbody>
</table></div><?php if (!$rows) echo empty_state('card', 'কোনো পেমেন্ট নেই'); ?></div>
<?= admin_pagination($total, $page, $per, array_filter(['status' => $status])) ?>
