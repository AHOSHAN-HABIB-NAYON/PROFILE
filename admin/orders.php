<?php
/** Admin: orders. */
defined('APP') || exit;
require_once ROOT . '/admin/_crud.php';
meta(['title' => 'Orders']);

$orderStatuses = ['pending_payment', 'payment_submitted', 'under_review', 'approved', 'rejected', 'completed', 'cancelled'];
$status = input('status');
$q = mb_substr(input('q'), 0, 100);
$where = '1';
$p = [];
if ($q !== '') { $l = '%' . addcslashes($q, '%_\\') . '%'; $where .= ' AND (o.code LIKE ? OR o.product_name LIKE ? OR u.email LIKE ? OR u.name LIKE ?)'; array_push($p, $l, $l, $l, $l); }
if (in_array($status, $orderStatuses, true)) { $where .= ' AND o.status = ?'; $p[] = $status; }
$pg = paginate((int)val("SELECT COUNT(*) FROM orders o JOIN users u ON u.id = o.user_id WHERE $where", $p), 25, max(1, input_int('page', 1)));
$list = rows("SELECT o.*, u.name, u.email, (SELECT COUNT(*) FROM payments WHERE order_id = o.id) pays FROM orders o JOIN users u ON u.id = o.user_id
              WHERE $where ORDER BY o.id DESC LIMIT {$pg['per']} OFFSET {$pg['offset']}", $p);
$counts = array_column(rows('SELECT status, COUNT(*) c FROM orders GROUP BY status'), 'c', 'status');
?>
<div class="page">
  <div class="adm-title"><h1>Orders</h1></div>
  <nav class="chips mb-2">
    <a class="chip <?= $status === '' ? 'active' : '' ?>" href="<?= e(url('/admin/orders')) ?>">All</a>
    <?php foreach ($orderStatuses as $s): ?><a class="chip <?= $status === $s ? 'active' : '' ?>" href="<?= e(url('/admin/orders?status=' . $s)) ?>"><?= e(ucwords(str_replace('_', ' ', $s))) ?> <span class="badge muted"><?= (int)($counts[$s] ?? 0) ?></span></a><?php endforeach ?>
  </nav>
  <form class="toolbar" method="get" action="<?= e(url('/admin/orders')) ?>" data-get-form>
    <input type="hidden" name="status" value="<?= e($status) ?>">
    <div class="input-icon grow"><i class="fa-solid fa-magnifying-glass"></i><input class="input" type="search" name="q" value="<?= e($q) ?>" placeholder="Order code, product, customer…"></div>
    <button class="btn btn-ghost" type="submit">Search</button>
  </form>
  <table class="dtable">
    <thead><tr><th>Order</th><th>Customer</th><th>Amount</th><th>Status</th><th>Created</th><th></th></tr></thead>
    <tbody>
    <?php foreach ($list as $o): ?>
      <tr>
        <td data-label="Order"><span style="text-align:left;display:block"><strong>#<?= e($o['code']) ?></strong><br><span class="tiny muted"><?= e($o['product_name']) ?></span></span></td>
        <td data-label="Customer"><a href="<?= e(url('/admin/users?id=' . $o['user_id'])) ?>"><?= e($o['name']) ?></a></td>
        <td data-label="Amount">$<?= number_format((float)$o['amount_usd'], 2) ?> <span class="tiny muted">/ ৳<?= number_format((float)$o['amount_bdt']) ?></span></td>
        <td data-label="Status"><span class="status status-<?= e($o['status']) ?>"><?= e(ucwords(str_replace('_', ' ', $o['status']))) ?></span><?php if ($o['admin_note']): ?><br><span class="tiny muted"><?= e(mb_strimwidth($o['admin_note'], 0, 60, '…')) ?></span><?php endif ?></td>
        <td data-label="Created"><?= e(date('M j, Y H:i', strtotime($o['created_at']))) ?></td>
        <td class="actions"><div class="row" style="gap:4px">
          <?php if ($o['pays']): ?><a class="icon-btn" href="<?= e(url('/admin/payments?q=' . $o['code'])) ?>" title="View payments" aria-label="View payments"><i class="fa-solid fa-wallet"></i></a><?php endif ?>
          <a class="icon-btn" href="<?= e(url('/payment/' . $o['code'])) ?>" data-no-spa target="_blank" title="Customer view" aria-label="Customer view"><i class="fa-solid fa-eye"></i></a>
          <button class="btn btn-sm btn-soft" data-action="order-status" data-code="<?= e($o['code']) ?>" data-status="<?= e($o['status']) ?>" data-note="<?= e($o['admin_note']) ?>">Change</button></div></td>
      </tr>
    <?php endforeach ?>
    </tbody>
  </table>
  <?php if (!$list): ?><div class="card empty">No orders found.</div><?php endif ?>
  <?php admin_pager($pg, '/admin/orders?' . http_build_query(array_filter(['status' => $status, 'q' => $q]))) ?>
</div>
