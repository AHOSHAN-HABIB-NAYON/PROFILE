<?php
/**
 * @var array $c @var array $orders @var array $addresses
 */
$blocked = (int)$c['is_blocked'] === 1;
?>
<div class="a-page">
  <div class="page-head">
    <div>
      <a href="<?= e(url('/admin/customers')) ?>" class="back-link"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Customers</a>
      <h1 class="a-title"><?= e($c['name']) ?> <?= $blocked ? '<span class="badge badge-danger">Blocked</span>' : '' ?></h1>
      <p class="muted small"><?= e($c['phone']) ?> · <?= e($c['district']) ?> · customer since <?= e(date('d M Y', strtotime($c['created_at']))) ?></p>
    </div>
    <a class="btn btn-ghost btn-sm" href="tel:<?= e($c['phone']) ?>"><i class="fa-solid fa-phone" aria-hidden="true"></i> Call</a>
  </div>
  <div class="kpi-grid kpi-grid-sm">
    <?= View::render('admin:partials/kpi', ['label' => 'Orders', 'value' => (string)(int)$c['total_orders'], 'icon' => 'fa-solid fa-bag-shopping', 'tone' => 'primary', 'href' => null]) ?>
    <?= View::render('admin:partials/kpi', ['label' => 'Delivered', 'value' => (string)(int)$c['delivered_orders'], 'icon' => 'fa-solid fa-circle-check', 'tone' => 'success', 'href' => null]) ?>
    <?= View::render('admin:partials/kpi', ['label' => 'Cancelled / Returned', 'value' => (int)$c['cancelled_orders'] . ' / ' . (int)$c['returned_orders'], 'icon' => 'fa-solid fa-rotate-left', 'tone' => 'danger', 'href' => null]) ?>
    <?= View::render('admin:partials/kpi', ['label' => 'Total spent', 'value' => money_en($c['total_spent']), 'icon' => 'fa-solid fa-sack-dollar', 'tone' => 'info', 'href' => null]) ?>
  </div>
  <div class="a-grid-2">
    <section class="a-card">
      <h2 class="a-card-title">Orders</h2>
      <div class="list">
        <?php foreach ($orders as $o): ?>
          <a class="list-row" href="<?= e(url('/admin/orders/' . $o['id'])) ?>"><span class="list-main"><strong>#<?= e($o['order_number']) ?></strong><span class="muted small d-block"><?= e(date('d M Y', strtotime($o['created_at']))) ?></span></span><span class="list-side"><?= status_badge($o['status']) ?><strong><?= money_en($o['total']) ?></strong></span></a>
        <?php endforeach; ?>
      </div>
    </section>
    <section class="a-card">
      <h2 class="a-card-title">Addresses</h2>
      <?php foreach ($addresses as $a): ?><p class="small"><strong><?= e($a['district']) ?></strong> — <?= e($a['address']) ?> <span class="muted">(<?= e(time_ago($a['last_used_at'])) ?>)</span></p><?php endforeach; ?>
      <h2 class="a-card-title mt">Ordering access</h2>
      <form method="post" action="<?= e(url('/admin/customers/' . $c['id'] . '/block')) ?>" data-ajax data-no-spa>
        <div class="field"><label class="label" for="cu-notes">Internal notes</label><textarea id="cu-notes" class="input" name="notes" rows="3"><?= e($c['notes']) ?></textarea></div>
        <button class="btn <?= $blocked ? 'btn-outline' : 'btn-danger' ?>" type="submit"><i class="fa-solid <?= $blocked ? 'fa-unlock' : 'fa-ban' ?>" aria-hidden="true"></i> <?= $blocked ? 'Unblock customer' : 'Block from ordering' ?></button>
      </form>
    </section>
  </div>
</div>
