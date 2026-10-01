<?php
/** All transactions; approve/reject pending deposits & withdrawals. */
if ($id !== null) {
    $t = db()->row('SELECT t.*, u.name, u.email, u.uid AS user_uid, c.name AS cp_name FROM transactions t JOIN users u ON u.id = t.user_id LEFT JOIN users c ON c.id = t.counterparty_user_id WHERE t.id = ?', [(int) $id]);
    if (!$t) {
        echo '<div class="card">' . empty_state('receipt', 'লেনদেন পাওয়া যায়নি') . '</div>';
        return;
    }
    View::$meta['title'] = 'লেনদেন ' . $t['uid'];
    $meta = json_decode((string) $t['meta'], true) ?: [];
    ?>
    <div class="admin-toolbar"><a href="<?= e(url('/v2admin/transactions')) ?>" class="btn btn-ghost btn-sm" data-link><?= icon('chevron-left') ?> সব লেনদেন</a></div>
    <div class="admin-grid-2">
      <section class="card admin-card">
        <div class="row between"><h3 class="card-title num"><?= e($t['uid']) ?></h3><?= status_badge($t['status']) ?></div>
        <div class="kv" style="margin-top:10px">
          <div><span class="k">ইউজার</span><span class="v"><a href="<?= e(url('/v2admin/users/' . $t['user_id'])) ?>" data-link><?= e($t['name']) ?></a> <small class="muted"><?= e($t['user_uid']) ?></small></span></div>
          <div><span class="k">ধরন</span><span class="v"><?= e(tx_type_label($t['type'], $t['direction'])) ?> (<?= e($t['direction']) ?>)</span></div>
          <div><span class="k">পরিমাণ (নেট)</span><span class="v num"><?= e(money($t['net_amount'])) ?></span></div>
          <div><span class="k">ফি</span><span class="v num"><?= e(money($t['fee'])) ?></span></div>
          <div><span class="k">মোট</span><span class="v num"><?= e(money($t['amount'])) ?></span></div>
          <div><span class="k">মেথড</span><span class="v"><?= e($t['method']) ?></span></div>
          <?php if ($t['account_ref']): ?><div><span class="k">অ্যাকাউন্ট</span><span class="v"><?= e($t['account_ref']) ?><button class="copy-btn" data-copy-text="<?= e($t['account_ref']) ?>"><?= icon('copy') ?></button></span></div><?php endif; ?>
          <?php if ($t['reference']): ?><div><span class="k">রেফারেন্স</span><span class="v num"><?= e($t['reference']) ?><button class="copy-btn" data-copy-text="<?= e($t['reference']) ?>"><?= icon('copy') ?></button></span></div><?php endif; ?>
          <?php if ($t['cp_name']): ?><div><span class="k">কাউন্টারপার্টি</span><span class="v"><?= e($t['cp_name']) ?></span></div><?php endif; ?>
          <div><span class="k">বিবরণ</span><span class="v"><?= e($t['description']) ?></span></div>
          <?php if (!empty($meta['note'])): ?><div><span class="k">ইউজারের নোট</span><span class="v"><?= e($meta['note']) ?></span></div><?php endif; ?>
          <?php if ($t['admin_note']): ?><div><span class="k">অ্যাডমিন নোট</span><span class="v"><?= e($t['admin_note']) ?></span></div><?php endif; ?>
          <div><span class="k">তারিখ</span><span class="v"><?= e(bn_date($t['created_at'])) ?></span></div>
        </div>
      </section>
      <?php if ($t['status'] === 'pending' && in_array($t['type'], ['deposit', 'withdraw'], true)): ?>
      <section class="card admin-card">
        <h3 class="card-title"><?= $t['type'] === 'deposit' ? 'জমা যাচাই' : 'উত্তোলন প্রক্রিয়া' ?></h3>
        <p class="small muted"><?= $t['type'] === 'deposit' ? 'রেফারেন্স যাচাই করে অনুমোদন দিলে ইউজারের ব্যালেন্সে যোগ হবে।' : 'ইউজারের অ্যাকাউন্টে টাকা পাঠিয়ে রেফারেন্সসহ সম্পন্ন করুন। প্রত্যাখ্যান করলে টাকা ফেরত যাবে।' ?></p>
        <form action="<?= e(url('/v2admin/api/finance/approve')) ?>" method="post" data-ajax data-confirm="অনুমোদন নিশ্চিত করবেন?">
          <?= csrf_field() ?><input type="hidden" name="id" value="<?= (int) $t['id'] ?>">
          <?php if ($t['type'] === 'withdraw'): ?><input class="input" name="reference" maxlength="120" placeholder="পেমেন্ট রেফারেন্স / TrxID" style="margin-bottom:8px"><?php endif; ?>
          <input class="input" name="note" maxlength="200" placeholder="নোট (ঐচ্ছিক)">
          <button class="btn btn-ok btn-block" style="margin-top:8px"><?= icon('check') ?> অনুমোদন</button>
        </form>
        <form action="<?= e(url('/v2admin/api/finance/reject')) ?>" method="post" data-ajax data-confirm="প্রত্যাখ্যান নিশ্চিত করবেন?" data-danger style="margin-top:14px">
          <?= csrf_field() ?><input type="hidden" name="id" value="<?= (int) $t['id'] ?>">
          <input class="input" name="reason" maxlength="200" required placeholder="প্রত্যাখ্যানের কারণ (ইউজার দেখবে)">
          <button class="btn btn-danger btn-block" style="margin-top:8px"><?= icon('x') ?> প্রত্যাখ্যান</button>
        </form>
      </section>
      <?php endif; ?>
    </div>
    <?php
    return;
}

View::$meta['title'] = 'লেনদেন';
$q = trim((string) ($_GET['q'] ?? ''));
$type = (string) ($_GET['type'] ?? '');
$status = (string) ($_GET['status'] ?? '');
$page = max(1, (int) ($_GET['page'] ?? 1));
$per = 40;
$where = ['1'];
$args = [];
if ($q !== '') {
    $where[] = '(t.uid = ? OR t.reference = ? OR u.uid = ? OR u.email = ?)';
    array_push($args, $q, $q, $q, mb_strtolower($q));
}
if (in_array($type, ['deposit', 'withdraw', 'payment', 'transfer'], true)) {
    $where[] = 't.type = ?';
    $args[] = $type;
}
if (in_array($status, ['pending', 'success', 'failed', 'expired', 'cancelled'], true)) {
    $where[] = 't.status = ?';
    $args[] = $status;
}
$w = implode(' AND ', $where);
$total = (int) db()->val("SELECT COUNT(*) FROM transactions t JOIN users u ON u.id = t.user_id WHERE $w", $args);
$rows = db()->all("SELECT t.*, u.name FROM transactions t JOIN users u ON u.id = t.user_id WHERE $w ORDER BY (t.status = 'pending') DESC, t.id DESC LIMIT $per OFFSET " . (($page - 1) * $per), $args);
?>
<div class="admin-toolbar">
  <form class="search-form" method="get" action="<?= e(url('/v2admin/transactions')) ?>" data-get-form>
    <input class="input" name="q" value="<?= e($q) ?>" placeholder="TX ID, রেফারেন্স, ইউজার ID/ইমেইল">
    <select class="select" name="type" style="width:130px"><option value="">সব ধরন</option><?php foreach (['deposit' => 'জমা', 'withdraw' => 'উত্তোলন', 'payment' => 'পেমেন্ট', 'transfer' => 'ট্রান্সফার'] as $k => $v): ?><option value="<?= $k ?>" <?= $type === $k ? 'selected' : '' ?>><?= $v ?></option><?php endforeach; ?></select>
    <select class="select" name="status" style="width:140px"><option value="">সব স্ট্যাটাস</option><?php foreach (['pending' => 'অপেক্ষমাণ', 'success' => 'সফল', 'failed' => 'ব্যর্থ', 'expired' => 'মেয়াদোত্তীর্ণ', 'cancelled' => 'বাতিল'] as $k => $v): ?><option value="<?= $k ?>" <?= $status === $k ? 'selected' : '' ?>><?= $v ?></option><?php endforeach; ?></select>
    <button class="btn btn-ghost btn-icon" aria-label="খুঁজুন"><?= icon('filter') ?></button>
  </form>
</div>
<div class="card table-card"><div class="table-wrap"><table class="table">
  <thead><tr><th>TX ID</th><th>ইউজার</th><th>ধরন</th><th>মেথড</th><th>পরিমাণ</th><th>ফি</th><th>রেফারেন্স</th><th>স্ট্যাটাস</th><th>তারিখ</th></tr></thead>
  <tbody><?php foreach ($rows as $t): ?><tr>
    <td><a class="num tbl-link" href="<?= e(url('/v2admin/transactions/' . $t['id'])) ?>" data-link><?= e($t['uid']) ?></a></td>
    <td><a href="<?= e(url('/v2admin/users/' . $t['user_id'])) ?>" data-link><?= e($t['name']) ?></a></td>
    <td><?= e(tx_type_label($t['type'], $t['direction'])) ?></td><td><?= e($t['method']) ?></td>
    <td class="num"><?= $t['direction'] === 'credit' ? '+' : '−' ?><?= e(money($t['net_amount'])) ?></td><td class="num"><?= e(money($t['fee'])) ?></td>
    <td class="num small"><?= e(mb_strimwidth((string) $t['reference'], 0, 22, '…')) ?></td><td><?= status_badge($t['status']) ?></td><td class="small muted"><?= e(bn_date($t['created_at'])) ?></td>
  </tr><?php endforeach; ?></tbody>
</table></div><?php if (!$rows) echo empty_state('history', 'কোনো লেনদেন নেই'); ?></div>
<?= admin_pagination($total, $page, $per, array_filter(['q' => $q, 'type' => $type, 'status' => $status])) ?>
