<?php
/**
 * @var array $rows @var int $total @var int $page @var int $pages @var string $q @var string $sort
 */
?>
<div class="a-page">
  <div class="page-head"><div><h1 class="a-title">Customers</h1><p class="muted small"><?= number_format($total) ?> customers · created automatically from orders</p></div></div>
  <form class="toolbar" method="get" action="<?= e(url('/admin/customers')) ?>">
    <label class="sr-only" for="cu-q">Search</label>
    <input id="cu-q" class="input input-sm" type="search" name="q" value="<?= e($q) ?>" placeholder="Name, phone or district">
    <label class="sr-only" for="cu-sort">Sort</label>
    <select id="cu-sort" class="input input-sm" name="sort" data-autosubmit>
      <option value="">Newest</option>
      <option value="orders"<?= $sort === 'orders' ? ' selected' : '' ?>>Most orders</option>
      <option value="spent"<?= $sort === 'spent' ? ' selected' : '' ?>>Top spenders</option>
      <option value="risk"<?= $sort === 'risk' ? ' selected' : '' ?>>Most cancelled/returned</option>
    </select>
    <button class="btn btn-sm btn-outline" type="submit">Search</button>
  </form>
  <?php if (!$rows): ?>
    <?= View::render('admin:partials/empty', ['icon' => 'fa-solid fa-users', 'title' => 'No customers yet']) ?>
  <?php else: ?>
  <div class="a-card a-table-card">
    <table class="a-table">
      <thead><tr><th>Customer</th><th>Orders</th><th class="hide-sm">Delivered / Cancelled / Returned</th><th>Spent</th><th class="hide-sm">Last order</th></tr></thead>
      <tbody>
      <?php foreach ($rows as $c): ?>
        <tr>
          <td data-label="Customer"><a class="strong" href="<?= e(url('/admin/customers/' . $c['id'])) ?>"><?= e($c['name']) ?></a><?= (int)$c['is_blocked'] === 1 ? ' <span class="badge badge-danger">Blocked</span>' : '' ?><span class="muted small d-block"><?= e($c['phone']) ?> · <?= e($c['district']) ?></span></td>
          <td data-label="Orders"><?= (int)$c['total_orders'] ?></td>
          <td data-label="History" class="hide-sm"><span class="text-success"><?= (int)$c['delivered_orders'] ?></span> / <span class="text-danger"><?= (int)$c['cancelled_orders'] ?></span> / <span class="text-danger"><?= (int)$c['returned_orders'] ?></span><?= (int)$c['fraud_orders'] ? ' · <span class="badge badge-danger">' . (int)$c['fraud_orders'] . ' fraud</span>' : '' ?></td>
          <td data-label="Spent"><?= money_en($c['total_spent']) ?></td>
          <td data-label="Last order" class="hide-sm small muted"><?= e(time_ago($c['last_order_at'])) ?></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>
  <?= View::render('admin:partials/pager', ['page' => $page, 'pages' => $pages, 'base' => '/admin/customers', 'query' => array_filter(['q' => $q, 'sort' => $sort])]) ?>
  <?php endif; ?>
</div>
