<?php
/** Admin: payment verification queue. */
defined('APP') || exit;
require_once ROOT . '/admin/_crud.php';
meta(['title' => 'Payments']);

$status = input('status', 'pending');
$q = mb_substr(input('q'), 0, 100);
$sort = input('sort');
$method = input('method');
$where = '1';
$p = [];
if ($q !== '') { $q2 = '%' . addcslashes($q, '%_\\') . '%'; $where .= ' AND (p.txid LIKE ? OR o.code LIKE ? OR u.email LIKE ? OR u.name LIKE ?)'; array_push($p, $q2, $q2, $q2, $q2); $status = input('status', 'all'); }
if (in_array($status, ['pending', 'approved', 'rejected', 'cancelled', 'completed'], true)) { $where .= ' AND p.status = ?'; $p[] = $status; }
if ($method !== '') { $where .= ' AND p.method = ?'; $p[] = $method; }
$order = ['old' => 'p.id ASC', 'amount' => 'p.amount DESC'][$sort] ?? 'p.id DESC';
$from = 'FROM payments p JOIN orders o ON o.id = p.order_id JOIN users u ON u.id = p.user_id';
$pg = paginate((int)val("SELECT COUNT(*) $from WHERE $where", $p), 20, max(1, input_int('page', 1)));
$list = rows("SELECT p.*, o.code, o.product_name, o.amount_usd, o.amount_bdt, o.status AS order_status, u.name, u.email, u.id AS uid, r.name AS reviewer
              $from LEFT JOIN users r ON r.id = p.reviewed_by WHERE $where ORDER BY $order LIMIT {$pg['per']} OFFSET {$pg['offset']}", $p);
$counts = array_column(rows('SELECT status, COUNT(*) c FROM payments GROUP BY status'), 'c', 'status');
$methods = array_column(rows('SELECT code, name FROM payment_methods ORDER BY sort'), 'name', 'code') + ['balance' => 'Account balance'];
?>
<div class="page">
  <div class="adm-title"><h1>Payments</h1></div>
  <nav class="chips mb-2">
    <?php foreach (['pending' => 'Pending', 'approved' => 'Approved', 'rejected' => 'Rejected', 'all' => 'All'] as $k => $l): ?>
      <a class="chip <?= $status === $k ? 'active' : '' ?>" href="<?= e(url('/admin/payments?status=' . $k)) ?>"><?= $l ?><?php if ($k !== 'all'): ?> <span class="badge muted"><?= (int)($counts[$k] ?? 0) ?></span><?php endif ?></a>
    <?php endforeach ?>
  </nav>
  <form class="toolbar" method="get" action="<?= e(url('/admin/payments')) ?>" data-get-form>
    <input type="hidden" name="status" value="<?= e($status) ?>">
    <div class="input-icon grow"><i class="fa-solid fa-magnifying-glass"></i><input class="input" type="search" name="q" value="<?= e($q) ?>" placeholder="TXID, order, user email…"></div>
    <select class="select" name="method" data-autosubmit style="width:auto"><option value="">All methods</option><?php foreach ($methods as $k => $v): ?><option value="<?= e($k) ?>" <?= $method === $k ? 'selected' : '' ?>><?= e($v) ?></option><?php endforeach ?></select>
    <select class="select" name="sort" data-autosubmit style="width:auto"><option value="">Newest</option><option value="old" <?= $sort === 'old' ? 'selected' : '' ?>>Oldest</option><option value="amount" <?= $sort === 'amount' ? 'selected' : '' ?>>Amount</option></select>
  </form>
  <?php if (!$list): ?><div class="card empty"><div class="icon-box success"><i class="fa-solid fa-check"></i></div>No payments here.</div><?php endif ?>
  <div class="stack">
  <?php foreach ($list as $x):
      $expected = $x['currency'] === 'BDT' ? (float)$x['amount_bdt'] : (float)$x['amount_usd'];
      $mismatch = abs((float)$x['amount'] - $expected) > 0.009; ?>
    <article class="card card-pad-lg">
      <div class="row-between wrap">
        <div class="row"><span class="icon-box"><i class="fa-solid fa-money-bill-transfer"></i></span>
          <div><strong><?= e($x['product_name']) ?></strong> <span class="tiny muted">#<?= e($x['code']) ?></span><br>
          <a class="small" href="<?= e(url('/admin/users?id=' . $x['uid'])) ?>"><?= e($x['name']) ?></a> <span class="tiny muted"><?= e($x['email']) ?></span></div></div>
        <span class="status status-<?= e($x['status']) ?>"><?= e(ucfirst($x['status'])) ?></span>
      </div>
      <div class="grid-2 mt-2">
        <dl class="kv">
          <dt>Method</dt><dd><?= e($methods[$x['method']] ?? $x['method']) ?></dd>
          <dt>Amount</dt><dd><b><?= e(money($x['amount'], $x['currency'])) ?></b><?php if ($mismatch): ?> <span class="badge warning" title="Expected amount">expected <?= e(money($expected, $x['currency'])) ?></span><?php endif ?></dd>
          <dt>TXID</dt><dd><code class="small" style="word-break:break-all"><?= e($x['txid']) ?></code> <button class="icon-btn" style="width:28px;height:28px" data-action="copy" data-copy="<?= e($x['txid']) ?>" aria-label="Copy"><i class="fa-regular fa-copy small"></i></button></dd>
          <dt>Submitted</dt><dd><?= e(date('M j, Y H:i', strtotime($x['created_at']))) ?> · <?= e(time_ago($x['created_at'])) ?></dd>
          <?php if ($x['reviewed_at']): ?><dt>Reviewed</dt><dd><?= e($x['reviewer'] ?: 'System') ?> · <?= e(date('M j, H:i', strtotime($x['reviewed_at']))) ?></dd><?php endif ?>
          <?php if ($x['note']): ?><dt>User note</dt><dd><?= e($x['note']) ?></dd><?php endif ?>
          <?php if ($x['admin_note']): ?><dt>Admin note</dt><dd><?= e($x['admin_note']) ?></dd><?php endif ?>
        </dl>
        <div><?php if ($x['screenshot']): ?><a href="<?= e(url('/file/payment/' . $x['id'])) ?>" target="_blank" rel="noopener" data-no-spa><img src="<?= e(url('/file/payment/' . $x['id'])) ?>" alt="Payment screenshot" loading="lazy" style="max-height:220px;border-radius:12px;border:1px solid var(--border);margin-left:auto"></a><?php endif ?></div>
      </div>
      <div class="row wrap mt-2" style="justify-content:flex-end">
        <button class="btn btn-sm btn-ghost" data-action="post" data-url="<?= e(url('/api/admin?action=payment_note')) ?>" data-params='<?= e(json_encode(['id' => (int)$x['id']])) ?>' data-confirm="Add or replace the admin note (visible to the customer)." data-input="Admin note" data-input-name="note"><i class="fa-regular fa-comment"></i>Note</button>
        <?php if ($x['status'] === 'pending'): ?>
          <button class="btn btn-sm btn-danger" data-action="post" data-url="<?= e(url('/api/admin?action=payment_reject')) ?>" data-params='<?= e(json_encode(['id' => (int)$x['id']])) ?>' data-confirm="Reject this payment? The customer will be notified and can resubmit." data-input="Reason shown to the customer" data-input-name="note" data-danger="1"><i class="fa-solid fa-xmark"></i>Reject</button>
          <button class="btn btn-sm btn-success" data-action="post" data-url="<?= e(url('/api/admin?action=payment_approve')) ?>" data-params='<?= e(json_encode(['id' => (int)$x['id']])) ?>' data-confirm="Approve this payment and mark the order approved?" data-input="Optional note for the customer" data-input-name="note"><i class="fa-solid fa-check"></i>Approve</button>
        <?php endif ?>
      </div>
    </article>
  <?php endforeach ?>
  </div>
  <?php admin_pager($pg, '/admin/payments?' . http_build_query(array_filter(['status' => $status, 'q' => $q, 'method' => $method, 'sort' => $sort]))) ?>
</div>
