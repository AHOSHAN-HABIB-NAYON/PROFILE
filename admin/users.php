<?php
/** Admin: user management (list + full user view with actions). */
defined('APP') || exit;
require_once ROOT . '/admin/_crud.php';
meta(['title' => 'Users']);
$id = input_int('id');
$statusBadge = fn($s) => '<span class="badge ' . ['active' => 'success', 'suspended' => 'warning', 'banned' => 'danger', 'deleted' => 'muted'][$s] . '">' . e(ucfirst($s)) . '</span>';

if (!$id):
    $q = mb_substr(input('q'), 0, 80);
    $role = input('role');
    $st = input('status');
    $sort = input('sort');
    $where = '1';
    $p = [];
    if ($q !== '') { $where .= ' AND (name LIKE ? OR email LIKE ? OR phone LIKE ? OR id = ?)'; $l = '%' . addcslashes($q, '%_\\') . '%'; array_push($p, $l, $l, $l, (int)$q); }
    if (in_array($role, ['user', 'support', 'editor', 'admin'], true)) { $where .= ' AND role = ?'; $p[] = $role; }
    if (in_array($st, ['active', 'suspended', 'banned', 'deleted'], true)) { $where .= ' AND status = ?'; $p[] = $st; } elseif ($st !== 'all') $where .= " AND status <> 'deleted'";
    if ($st === 'vip') $where .= ' AND is_vip = 1';
    $order = ['new' => 'id DESC', 'balance' => 'balance DESC', 'seen' => 'last_seen_at DESC', 'name' => 'name ASC'][$sort] ?? 'id DESC';
    $pg = paginate((int)val("SELECT COUNT(*) FROM users WHERE $where", $p), 25, max(1, input_int('page', 1)));
    $list = rows("SELECT * FROM users WHERE $where ORDER BY $order LIMIT {$pg['per']} OFFSET {$pg['offset']}", $p);
?>
<div class="page">
  <div class="adm-title"><h1>Users</h1><span class="muted small"><?= number_format($pg['total']) ?> found</span></div>
  <form class="toolbar" method="get" action="<?= e(url('/admin/users')) ?>" data-get-form>
    <div class="input-icon grow"><i class="fa-solid fa-magnifying-glass"></i><input class="input" type="search" name="q" value="<?= e($q) ?>" placeholder="Name, email, phone or ID"></div>
    <select class="select" name="role" data-autosubmit style="width:auto"><option value="">All roles</option><?php foreach (['user', 'support', 'editor', 'admin'] as $r): ?><option value="<?= $r ?>" <?= $role === $r ? 'selected' : '' ?>><?= ucfirst($r) ?></option><?php endforeach ?></select>
    <select class="select" name="status" data-autosubmit style="width:auto"><option value="">Active + suspended + banned</option><?php foreach (['active', 'suspended', 'banned', 'deleted', 'vip', 'all'] as $s): ?><option value="<?= $s ?>" <?= $st === $s ? 'selected' : '' ?>><?= ucfirst($s) ?></option><?php endforeach ?></select>
    <select class="select" name="sort" data-autosubmit style="width:auto"><?php foreach (['new' => 'Newest', 'seen' => 'Last seen', 'balance' => 'Balance', 'name' => 'Name'] as $k => $v): ?><option value="<?= $k ?>" <?= $sort === $k ? 'selected' : '' ?>><?= $v ?></option><?php endforeach ?></select>
  </form>
  <table class="dtable">
    <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Balance</th><th>Joined</th><th>Last seen</th><th></th></tr></thead>
    <tbody>
    <?php foreach ($list as $x): ?>
      <tr>
        <td data-label="User"><a class="row" style="color:inherit" href="<?= e(url('/admin/users?id=' . $x['id'])) ?>"><span class="avatar sm"><?= e(mb_strtoupper(mb_substr($x['name'], 0, 1))) ?></span><span style="min-width:0;text-align:left"><strong><?= e($x['name']) ?></strong><?= $x['is_vip'] ? ' <span class="badge vip">VIP</span>' : '' ?><br><span class="tiny muted"><?= e($x['email']) ?><?= $x['email_verified_at'] ? ' <i class="fa-solid fa-circle-check" style="color:var(--success)" title="Verified"></i>' : '' ?></span></span></a></td>
        <td data-label="Role"><span class="badge muted"><?= e($x['role']) ?></span></td>
        <td data-label="Status"><?= $statusBadge($x['status']) ?></td>
        <td data-label="Balance">$<?= number_format((float)$x['balance'], 2) ?></td>
        <td data-label="Joined"><?= e(date('M j, Y', strtotime($x['created_at']))) ?></td>
        <td data-label="Last seen"><?= $x['last_seen_at'] ? e(time_ago($x['last_seen_at'])) : '—' ?></td>
        <td class="actions"><a class="btn btn-sm btn-soft" href="<?= e(url('/admin/users?id=' . $x['id'])) ?>">Manage</a></td>
      </tr>
    <?php endforeach ?>
    </tbody>
  </table>
  <?php if (!$list): ?><div class="card empty">No users match.</div><?php endif ?>
  <?php admin_pager($pg, '/admin/users?' . http_build_query(array_filter(['q' => $q, 'role' => $role, 'status' => $st, 'sort' => $sort]))) ?>
</div>
<?php
    return;
endif;

$x = row('SELECT u.*, s.login_notify, s.email_login_verify FROM users u LEFT JOIN user_security s ON s.user_id = u.id WHERE u.id = ?', [$id]);
if (!$x) abort(404);
$me = user();
$self = (int)$me['id'] === $id;
$st = row("SELECT (SELECT COUNT(*) FROM orders WHERE user_id = ?) orders, (SELECT COUNT(*) FROM payments WHERE user_id = ?) payments,
           (SELECT COALESCE(SUM(amount),0) FROM payments WHERE user_id = ? AND status IN ('approved','completed') AND currency = 'USD') spent,
           (SELECT enabled FROM user_2fa WHERE user_id = ?) twofa, (SELECT COUNT(*) FROM user_passkeys WHERE user_id = ?) passkeys", [$id, $id, $id, $id, $id]);
$payments = rows('SELECT p.*, o.code FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.user_id = ? ORDER BY p.id DESC LIMIT 10', [$id]);
$orders = rows('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 10', [$id]);
$balance = rows('SELECT b.*, a.name AS admin FROM balance_transactions b LEFT JOIN users a ON a.id = b.admin_id WHERE b.user_id = ? ORDER BY b.id DESC LIMIT 10', [$id]);
$logins = rows('SELECT * FROM login_history WHERE user_id = ? ORDER BY id DESC LIMIT 15', [$id]);
$sessions = rows('SELECT * FROM user_sessions WHERE user_id = ? AND revoked_at IS NULL ORDER BY last_active DESC', [$id]);
$activity = rows('SELECT a.*, u.name AS admin FROM audit_logs a LEFT JOIN users u ON u.id = a.admin_id WHERE (a.target_type = "user" AND a.target_id = ?) OR a.admin_id = ? ORDER BY a.id DESC LIMIT 15', [$id, $id]);
$api = fn(string $a) => url('/api/admin?action=' . $a);
$p = fn(array $extra = []) => e(json_encode(['id' => $id] + $extra));
?>
<div class="page" data-tabs>
  <a class="btn btn-sm btn-ghost mb-2" href="<?= e(url('/admin/users')) ?>"><i class="fa-solid fa-arrow-left"></i>All users</a>
  <section class="card card-pad-lg mb-2">
    <div class="row wrap">
      <span class="avatar lg"><?php if ($x['avatar']): ?><img src="<?= e(media_url($x['avatar'])) ?>" alt=""><?php else: ?><?= e(mb_strtoupper(mb_substr($x['name'], 0, 1))) ?><?php endif ?></span>
      <div class="grow" style="min-width:200px">
        <h1 style="font-size:1.25rem;margin:0"><?= e($x['name']) ?> <?= $x['is_vip'] ? '<span class="badge vip"><i class="fa-solid fa-crown"></i>VIP</span>' : '' ?></h1>
        <div class="muted small"><?= e($x['email']) ?> · ID <?= $id ?> · <?= e($x['role']) ?></div>
        <div class="row wrap mt-1"><?= $statusBadge($x['status']) ?>
          <span class="badge <?= $x['email_verified_at'] ? 'success' : 'warning' ?>"><?= $x['email_verified_at'] ? 'Email verified' : 'Email unverified' ?></span>
          <span class="badge <?= $st['twofa'] ? 'success' : 'muted' ?>">2FA <?= $st['twofa'] ? 'on' : 'off' ?></span>
          <span class="badge muted"><?= (int)$st['passkeys'] ?> passkey(s)</span>
          <?php if ($x['google_id']): ?><span class="badge muted"><i class="fa-brands fa-google"></i>Google</span><?php endif ?></div>
        <?php if ($x['status_reason'] || $x['suspended_until']): ?><p class="small mt-1 mb-0"><b>Reason:</b> <?= e($x['status_reason'] ?: '—') ?><?= $x['suspended_until'] ? ' · until ' . e($x['suspended_until']) : '' ?></p><?php endif ?>
      </div>
      <dl class="kv" style="min-width:220px">
        <dt>Balance</dt><dd><b>$<?= number_format((float)$x['balance'], 2) ?></b></dd>
        <dt>Orders</dt><dd><?= (int)$st['orders'] ?></dd><dt>Spent</dt><dd>$<?= number_format((float)$st['spent'], 2) ?></dd>
        <dt>Joined</dt><dd><?= e(date('M j, Y', strtotime($x['created_at']))) ?></dd><dt>Last seen</dt><dd><?= $x['last_seen_at'] ? e(time_ago($x['last_seen_at'])) : '—' ?></dd>
      </dl>
    </div>
    <div class="row wrap mt-2">
      <?php if (!$self): ?>
        <?php if ($x['status'] === 'active'): ?>
          <button class="btn btn-sm btn-ghost" data-action="user-suspend" data-id="<?= $id ?>"><i class="fa-solid fa-user-clock"></i>Suspend</button>
          <button class="btn btn-sm btn-danger" data-action="post" data-url="<?= e($api('user_status')) ?>" data-params='<?= $p(['status' => 'banned']) ?>' data-confirm="Ban this user? They will be logged out everywhere." data-input="Reason (optional)" data-input-name="reason" data-danger="1"><i class="fa-solid fa-ban"></i>Ban</button>
        <?php elseif ($x['status'] !== 'deleted'): ?>
          <button class="btn btn-sm btn-success" data-action="post" data-url="<?= e($api('user_status')) ?>" data-params='<?= $p(['status' => 'active']) ?>' data-confirm="Re-activate this account?"><i class="fa-solid fa-user-check"></i>Activate</button>
        <?php endif ?>
        <?php if ($x['status'] === 'deleted'): ?>
          <button class="btn btn-sm btn-success" data-action="post" data-url="<?= e($api('user_restore')) ?>" data-params='<?= $p() ?>' data-confirm="Restore this account?"><i class="fa-solid fa-rotate-left"></i>Restore</button>
        <?php else: ?>
          <button class="btn btn-sm btn-ghost" style="color:var(--danger)" data-action="post" data-url="<?= e($api('user_delete')) ?>" data-params='<?= $p() ?>' data-confirm="Delete this account? It can be restored later." data-danger="1"><i class="fa-regular fa-trash-can"></i>Delete</button>
        <?php endif ?>
      <?php endif ?>
      <button class="btn btn-sm btn-soft" data-action="user-balance" data-id="<?= $id ?>"><i class="fa-solid fa-wallet"></i>Balance</button>
      <button class="btn btn-sm btn-soft" data-action="user-message" data-id="<?= $id ?>" data-kind="notify"><i class="fa-solid fa-bell"></i>Notify</button>
      <button class="btn btn-sm btn-soft" data-action="user-message" data-id="<?= $id ?>" data-kind="email"><i class="fa-solid fa-envelope"></i>Email</button>
      <?php if (!$x['email_verified_at']): ?><button class="btn btn-sm btn-ghost" data-action="post" data-url="<?= e($api('user_verify')) ?>" data-params='<?= $p() ?>' data-confirm="Mark email as verified?"><i class="fa-solid fa-circle-check"></i>Verify email</button><?php endif ?>
      <button class="btn btn-sm btn-ghost" data-action="post" data-url="<?= e($api('user_reset_password')) ?>" data-params='<?= $p() ?>' data-confirm="Send a password reset link to <?= e($x['email']) ?>?"><i class="fa-solid fa-key"></i>Reset password</button>
      <button class="btn btn-sm btn-ghost" data-action="post" data-url="<?= e($api('user_logout_all')) ?>" data-params='<?= $p() ?>' data-confirm="Log this user out of all devices?"><i class="fa-solid fa-right-from-bracket"></i>Logout all</button>
    </div>
  </section>

  <div class="tabs">
    <?php foreach (['edit' => 'Edit', 'payments' => 'Payments', 'orders' => 'Orders', 'balance' => 'Balance history', 'security' => 'Login & IP', 'activity' => 'Activity'] as $k => $l): ?>
      <button class="tab <?= $k === 'edit' ? 'active' : '' ?>" data-action="local-tab" data-tab-btn="<?= $k ?>"><?= $l ?></button>
    <?php endforeach ?>
  </div>

  <div data-tab-panel="edit">
    <form class="card card-pad-lg" method="post" action="<?= e($api('user_update')) ?>" data-ajax novalidate>
      <input type="hidden" name="id" value="<?= $id ?>">
      <div class="form-grid">
        <div class="form-group"><label class="label">Name</label><input class="input" name="name" value="<?= e($x['name']) ?>" required maxlength="120"></div>
        <div class="form-group"><label class="label">Email</label><input class="input" type="email" name="email" value="<?= e($x['email']) ?>" required maxlength="191"></div>
        <div class="form-group"><label class="label">Phone</label><input class="input" name="phone" value="<?= e($x['phone']) ?>" maxlength="40"></div>
        <div class="form-group"><label class="label">Role</label><select class="select" name="role" <?= is_admin() && !$self ? '' : 'disabled' ?>><?php foreach (['user' => 'User', 'support' => 'Support agent', 'editor' => 'Editor', 'admin' => 'Administrator'] as $k => $l): ?><option value="<?= $k ?>" <?= $x['role'] === $k ? 'selected' : '' ?>><?= $l ?></option><?php endforeach ?></select>
          <p class="hint"><?= $self ? 'You cannot change your own role.' : 'Editors: news, media, team, services. Support: payments, orders, support chat.' ?></p></div>
        <div class="form-group"><label class="check switch-row"><span class="switch"><input type="checkbox" name="is_vip" value="1" <?= $x['is_vip'] ? 'checked' : '' ?>><span></span></span><span>VIP user</span></label></div>
      </div>
      <div class="form-actions"><button class="btn" type="submit"><i class="fa-solid fa-floppy-disk"></i>Save user</button></div>
    </form>
  </div>

  <div data-tab-panel="payments" hidden>
    <table class="dtable"><thead><tr><th>Order</th><th>Method</th><th>Amount</th><th>TXID</th><th>Status</th><th>Date</th></tr></thead><tbody>
      <?php foreach ($payments as $py): ?><tr><td data-label="Order">#<?= e($py['code']) ?></td><td data-label="Method"><?= e($py['method']) ?></td><td data-label="Amount"><?= e(money($py['amount'], $py['currency'])) ?></td>
        <td data-label="TXID"><a href="<?= e(url('/admin/payments?q=' . rawurlencode($py['txid']))) ?>"><code class="small"><?= e(mb_strimwidth($py['txid'], 0, 24, '…')) ?></code></a></td><td data-label="Status"><span class="status status-<?= e($py['status']) ?>"><?= e($py['status']) ?></span></td><td data-label="Date"><?= e(date('M j, Y H:i', strtotime($py['created_at']))) ?></td></tr><?php endforeach ?>
    </tbody></table><?php if (!$payments): ?><p class="muted small">No payments.</p><?php endif ?>
  </div>
  <div data-tab-panel="orders" hidden>
    <table class="dtable"><thead><tr><th>Order</th><th>Product</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead><tbody>
      <?php foreach ($orders as $o): ?><tr><td data-label="Order"><a href="<?= e(url('/admin/orders?q=' . $o['code'])) ?>">#<?= e($o['code']) ?></a></td><td data-label="Product"><?= e($o['product_name']) ?></td><td data-label="Amount">$<?= number_format((float)$o['amount_usd'], 2) ?></td>
        <td data-label="Status"><span class="status status-<?= e($o['status']) ?>"><?= e(str_replace('_', ' ', $o['status'])) ?></span></td><td data-label="Date"><?= e(date('M j, Y', strtotime($o['created_at']))) ?></td></tr><?php endforeach ?>
    </tbody></table><?php if (!$orders): ?><p class="muted small">No orders.</p><?php endif ?>
  </div>
  <div data-tab-panel="balance" hidden>
    <table class="dtable"><thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Balance after</th><th>Reason</th><th>By</th></tr></thead><tbody>
      <?php foreach ($balance as $b): ?><tr><td data-label="Date"><?= e(date('M j, Y H:i', strtotime($b['created_at']))) ?></td><td data-label="Type"><span class="badge <?= $b['type'] === 'credit' ? 'success' : 'danger' ?>"><?= e($b['type']) ?></span></td>
        <td data-label="Amount">$<?= number_format((float)$b['amount'], 2) ?></td><td data-label="Balance after">$<?= number_format((float)$b['balance_after'], 2) ?></td><td data-label="Reason"><?= e($b['reason']) ?></td><td data-label="By"><?= e($b['admin'] ?: 'System') ?></td></tr><?php endforeach ?>
    </tbody></table><?php if (!$balance): ?><p class="muted small">No balance changes.</p><?php endif ?>
  </div>
  <div data-tab-panel="security" hidden>
    <h3 style="font-size:.95rem">Active sessions (<?= count($sessions) ?>)</h3>
    <div class="list mb-2"><?php foreach ($sessions as $s): ?><div class="list-row"><i class="fa-solid fa-laptop muted"></i><span class="grow small"><?= e($s['device']) ?> · <?= e($s['ip']) ?></span><span class="tiny muted"><?= e(time_ago($s['last_active'])) ?></span></div><?php endforeach ?><?php if (!$sessions): ?><div class="list-row muted small">None</div><?php endif ?></div>
    <h3 style="font-size:.95rem">Login history</h3>
    <table class="dtable"><thead><tr><th>Date</th><th>Result</th><th>Method</th><th>IP</th><th>Device</th></tr></thead><tbody>
      <?php foreach ($logins as $l): ?><tr><td data-label="Date"><?= e(date('M j, Y H:i', strtotime($l['created_at']))) ?></td><td data-label="Result"><span class="badge <?= $l['success'] ? 'success' : 'danger' ?>"><?= $l['success'] ? 'Success' : e($l['reason'] ?: 'Failed') ?></span></td>
        <td data-label="Method"><?= e($l['method']) ?></td><td data-label="IP"><?= e($l['ip']) ?></td><td data-label="Device"><?= e($l['device']) ?></td></tr><?php endforeach ?>
    </tbody></table>
  </div>
  <div data-tab-panel="activity" hidden>
    <div class="list"><?php foreach ($activity as $a): ?><div class="list-row"><span class="icon-box sm"><i class="fa-solid fa-clock-rotate-left"></i></span><span class="grow"><strong style="font-size:.86rem"><?= e($a['action']) ?></strong> <span class="tiny muted">by <?= e($a['admin'] ?: 'system') ?></span><br><span class="tiny muted"><?= e($a['description']) ?></span></span><span class="tiny muted"><?= e(time_ago($a['created_at'])) ?></span></div><?php endforeach ?>
      <?php if (!$activity): ?><div class="list-row muted small">No recorded activity.</div><?php endif ?></div>
  </div>
</div>
