<?php
/**
 * @var array $result @var array $filters @var array $counts @var array $statuses
 */
$all = array_sum($counts);
$query = array_filter(['status' => $filters['status'], 'q' => $filters['q'], 'from' => $filters['from'], 'to' => $filters['to'], 'courier' => $filters['courier']]);
?>
<div class="a-page">
  <div class="page-head"><div><h1 class="a-title">Orders</h1><p class="muted small"><?= number_format($result['total']) ?> result(s)</p></div></div>

  <nav class="status-tabs" aria-label="Order status">
    <a href="<?= e(url('/admin/orders')) ?>" class="<?= $filters['status'] === '' && $filters['courier'] === '' ? 'is-active' : '' ?>">All <span><?= (int)$all ?></span></a>
    <?php foreach ($statuses as $key => $s): ?>
      <a href="<?= e(url('/admin/orders', ['status' => $key])) ?>" class="<?= $filters['status'] === $key ? 'is-active' : '' ?>"><?= e($s['label']) ?> <span><?= (int)($counts[$key] ?? 0) ?></span></a>
    <?php endforeach; ?>
    <a href="<?= e(url('/admin/orders', ['courier' => 'pending'])) ?>" class="<?= $filters['courier'] === 'pending' ? 'is-active' : '' ?>">Courier pending</a>
  </nav>

  <form class="toolbar" method="get" action="<?= e(url('/admin/orders')) ?>">
    <?php if ($filters['status']): ?><input type="hidden" name="status" value="<?= e($filters['status']) ?>"><?php endif; ?>
    <label class="sr-only" for="o-q">Search</label>
    <input id="o-q" class="input input-sm" type="search" name="q" value="<?= e($filters['q']) ?>" placeholder="Order #, name, phone or IP">
    <label class="sr-only" for="o-from">From</label><input id="o-from" class="input input-sm" type="date" name="from" value="<?= e($filters['from']) ?>">
    <label class="sr-only" for="o-to">To</label><input id="o-to" class="input input-sm" type="date" name="to" value="<?= e($filters['to']) ?>">
    <button class="btn btn-sm btn-outline" type="submit"><i class="fa-solid fa-filter" aria-hidden="true"></i> Filter</button>
  </form>

  <?php if (!$result['items']): ?>
    <?= View::render('admin:partials/empty', ['icon' => 'fa-solid fa-bag-shopping', 'title' => 'No orders found']) ?>
  <?php else: ?>
  <form method="post" action="<?= e(url('/admin/orders/bulk-status')) ?>" data-ajax data-no-spa data-confirm-submit="Update the status of the selected orders?">
    <div class="bulk-bar" data-bulk-bar hidden>
      <span data-bulk-count>0 selected</span>
      <label class="sr-only" for="bulk-status">New status</label>
      <select id="bulk-status" class="input input-sm" name="status"><?php foreach ($statuses as $key => $s): ?><option value="<?= e($key) ?>"><?= e($s['label']) ?></option><?php endforeach; ?></select>
      <button class="btn btn-sm btn-primary" type="submit">Apply</button>
    </div>
    <div class="a-card a-table-card">
      <table class="a-table orders-table">
        <thead><tr>
          <th class="t-check"><input type="checkbox" data-check-all aria-label="Select all"></th>
          <th>Order</th><th>Customer</th><th class="hide-sm">Products</th><th>Amount</th><th>Status</th><th class="hide-md">Courier</th><th class="hide-md">IP / Device</th>
        </tr></thead>
        <tbody>
        <?php foreach ($result['items'] as $o): [$cSlug, $cRef] = array_pad(explode('|', (string)$o['courier_ref']), 2, ''); ?>
          <tr>
            <td class="t-check"><input type="checkbox" name="ids[]" value="<?= (int)$o['id'] ?>" data-check-item aria-label="Select order <?= e($o['order_number']) ?>"></td>
            <td data-label="Order"><a class="strong" href="<?= e(url('/admin/orders/' . $o['id'])) ?>">#<?= e($o['order_number']) ?></a><span class="muted small d-block"><?= e(date('d M, h:i A', strtotime($o['created_at']))) ?></span></td>
            <td data-label="Customer"><?= e($o['customer_name']) ?><span class="muted small d-block"><?= e($o['phone']) ?> · <?= e($o['district']) ?></span><span class="muted small d-block hide-sm"><?= e(str_limit($o['address'], 50)) ?></span></td>
            <td data-label="Products" class="hide-sm small"><?= e(str_limit((string)$o['products'], 70)) ?></td>
            <td data-label="Amount"><strong><?= money_en($o['total']) ?></strong><span class="muted small d-block">Delivery <?= money_en($o['delivery_charge']) ?></span></td>
            <td data-label="Status"><?= status_badge($o['status']) ?></td>
            <td data-label="Courier" class="hide-md small"><?php if ($cSlug): ?><strong><?= e(ucfirst($cSlug)) ?></strong><span class="muted d-block"><?= e($cRef) ?> · <?= e($o['courier_status'] ?: '—') ?></span><?php else: ?><span class="muted">—</span><?php endif; ?></td>
            <td data-label="IP" class="hide-md small"><span class="mono"><?= e($o['ip']) ?></span><span class="muted d-block" title="<?= e($o['user_agent']) ?>"><?= e(ucfirst((string)$o['device_type'])) ?></span></td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
    </div>
  </form>
  <?= View::render('admin:partials/pager', ['page' => $result['page'], 'pages' => $result['pages'], 'base' => '/admin/orders', 'query' => $query]) ?>
  <?php endif; ?>
</div>
