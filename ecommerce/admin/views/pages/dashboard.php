<?php
/**
 * @var array $kpi @var array $series @var array $recent @var array $lowStock @var int $alerts @var array $user
 */
$kpis = [
    ['আজকের অর্ডার', number_format($kpi['today_orders']), 'fa-solid fa-bag-shopping', 'primary', '/admin/orders?from=' . date('Y-m-d')],
    ['আজকের বিক্রি', money_en($kpi['today_sales']), 'fa-solid fa-sack-dollar', 'success', '/admin/analytics?range=today'],
    ['মোট অর্ডার', number_format($kpi['total_orders']), 'fa-solid fa-receipt', 'info', '/admin/orders'],
    ['Pending', number_format($kpi['pending']), 'fa-solid fa-hourglass-half', 'warning', '/admin/orders?status=pending'],
    ['Delivered', number_format($kpi['delivered']), 'fa-solid fa-circle-check', 'success', '/admin/orders?status=delivered'],
    ['Cancelled', number_format($kpi['cancelled']), 'fa-solid fa-ban', 'danger', '/admin/orders?status=cancelled'],
    ['Low Stock', number_format($kpi['low_stock']), 'fa-solid fa-box-open', 'warning', '/admin/products?filter=low_stock'],
    ['New Customers', number_format($kpi['new_customers']), 'fa-solid fa-user-plus', 'info', '/admin/customers'],
    ['Courier Pending', number_format($kpi['courier_pending']), 'fa-solid fa-truck-fast', 'primary', '/admin/orders?courier=pending'],
];
$hour = (int)date('G');
?>
<div class="a-page">
  <div class="page-head">
    <div>
      <h1 class="a-title"><?= $hour < 12 ? 'Good morning' : ($hour < 18 ? 'Good afternoon' : 'Good evening') ?>, <?= e(explode(' ', (string)$user['name'])[0]) ?></h1>
      <p class="muted small"><?= e(date('l, d F Y')) ?></p>
    </div>
  </div>

  <?php if ($alerts): ?>
    <a class="alert-strip" href="<?= e(url('/admin/security')) ?>"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> <?= (int)$alerts ?> unresolved security alert(s) — review now</a>
  <?php endif; ?>

  <div class="quick-actions">
    <a href="<?= e(url('/admin/products/create')) ?>" class="qa"><i class="fa-solid fa-plus" aria-hidden="true"></i><span>Add Product</span></a>
    <a href="<?= e(url('/admin/banners')) ?>" class="qa"><i class="fa-solid fa-image" aria-hidden="true"></i><span>Add Banner</span></a>
    <a href="<?= e(url('/admin/orders')) ?>" class="qa"><i class="fa-solid fa-bag-shopping" aria-hidden="true"></i><span>Orders</span></a>
    <a href="<?= e(url('/admin/courier')) ?>" class="qa"><i class="fa-solid fa-truck-fast" aria-hidden="true"></i><span>Courier</span></a>
    <?php if (AdminAuth::authorize('settings')): ?><a href="<?= e(url('/admin/settings')) ?>" class="qa"><i class="fa-solid fa-gear" aria-hidden="true"></i><span>Settings</span></a><?php endif; ?>
  </div>

  <div class="kpi-grid">
    <?php foreach ($kpis as [$label, $value, $icon, $tone, $href]): ?>
      <?= View::render('admin:partials/kpi', compact('label', 'value', 'icon', 'tone', 'href')) ?>
    <?php endforeach; ?>
  </div>

  <div class="a-grid-2">
    <section class="a-card">
      <div class="a-card-head"><h2>Sales — last 14 days</h2></div>
      <div class="chart" data-chart="area" data-key="sales" data-money="1"><script type="application/json"><?= json_attr($series) ?></script></div>
    </section>
    <section class="a-card">
      <div class="a-card-head"><h2>Orders — last 14 days</h2></div>
      <div class="chart" data-chart="bar" data-key="orders"><script type="application/json"><?= json_attr($series) ?></script></div>
    </section>
  </div>

  <div class="a-grid-2">
    <section class="a-card">
      <div class="a-card-head"><h2>Recent orders</h2><a href="<?= e(url('/admin/orders')) ?>" class="link">View all</a></div>
      <?php if (!$recent): ?><p class="muted small">No orders yet.</p><?php else: ?>
      <div class="list">
        <?php foreach ($recent as $o): ?>
          <a class="list-row" href="<?= e(url('/admin/orders/' . $o['id'])) ?>">
            <span class="list-main"><strong>#<?= e($o['order_number']) ?></strong> <span class="muted">· <?= e($o['customer_name']) ?></span><span class="muted small d-block"><?= e($o['phone']) ?> · <?= e(time_ago($o['created_at'])) ?></span></span>
            <span class="list-side"><?= status_badge($o['status']) ?><strong><?= money_en($o['total']) ?></strong></span>
          </a>
        <?php endforeach; ?>
      </div>
      <?php endif; ?>
    </section>
    <section class="a-card">
      <div class="a-card-head"><h2>Low stock</h2><span class="muted small">≤ <?= (int)setting('low_stock_threshold', 10) ?> units</span></div>
      <?php if (!$lowStock): ?><p class="muted small"><i class="fa-solid fa-circle-check text-success" aria-hidden="true"></i> All products are well stocked.</p><?php else: ?>
      <div class="list">
        <?php foreach ($lowStock as $p): ?>
          <form class="list-row stock-row" method="post" action="<?= e(url('/admin/products/' . $p['id'] . '/stock')) ?>" data-ajax data-no-spa>
            <img src="<?= e(packed_image_url($p['image'])) ?>" alt="" width="40" height="40" class="thumb-sm">
            <span class="list-main"><strong><?= e(str_limit($p['name'], 40)) ?></strong><span class="small d-block <?= $p['stock'] <= 0 ? 'text-danger' : 'muted' ?>"><?= $p['stock'] <= 0 ? 'Out of stock' : 'Only ' . (int)$p['stock'] . ' left' ?></span></span>
            <label class="sr-only" for="stock-<?= (int)$p['id'] ?>">New stock</label>
            <input id="stock-<?= (int)$p['id'] ?>" class="input input-sm stock-input" type="number" name="stock" min="0" value="<?= max(0, (int)$p['stock']) ?>">
            <button class="btn btn-sm btn-primary" type="submit">Update</button>
          </form>
        <?php endforeach; ?>
      </div>
      <?php endif; ?>
    </section>
  </div>
</div>
