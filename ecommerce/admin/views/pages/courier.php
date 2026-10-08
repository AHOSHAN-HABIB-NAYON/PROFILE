<?php
/**
 * @var array $parcels @var array $waiting @var array $couriers
 */
?>
<div class="a-page">
  <div class="page-head">
    <div><h1 class="a-title">Courier</h1><p class="muted small">Parcels, live statuses and orders ready to ship</p></div>
    <button type="button" class="btn btn-outline btn-sm" data-action="post" data-url="<?= e(url('/api/admin/courier/sync-all')) ?>"><i class="fa-solid fa-rotate" aria-hidden="true"></i> Sync all statuses</button>
  </div>

  <div class="courier-cards">
    <?php foreach ($couriers as $c): ?>
      <div class="a-card courier-mini">
        <span class="plugin-icon"><i class="<?= e($c['icon']) ?>" aria-hidden="true"></i></span>
        <div><strong><?= e($c['name']) ?></strong><?= $c['default'] ? ' <span class="badge badge-primary">Default</span>' : '' ?>
          <span class="small d-block"><?= $c['enabled'] ? ($c['connected'] ? '<span class="text-success">● Connected</span>' : '<span class="muted">● Enabled, not tested</span>') : '<span class="muted">● Disabled</span>' ?></span>
          <?php if ($c['enabled'] && $c['balance']): ?><button type="button" class="link small" data-action="courier-balance" data-url="<?= e(url('/api/admin/courier/balance/' . $c['slug'])) ?>">Check balance</button><?php endif; ?>
        </div>
        <a class="icon-btn icon-btn-sm" href="<?= e(url('/admin/plugins/' . $c['slug'])) ?>" aria-label="Settings"><i class="fa-solid fa-gear" aria-hidden="true"></i></a>
      </div>
    <?php endforeach; ?>
  </div>

  <section class="a-card">
    <h2 class="a-card-title"><i class="fa-solid fa-hourglass-half" aria-hidden="true"></i> Waiting for courier (<?= count($waiting) ?>)</h2>
    <?php if (!$waiting): ?><p class="muted small">No confirmed orders waiting. Confirm orders first, then send them from the order page.</p><?php else: ?>
    <div class="list">
      <?php foreach ($waiting as $o): ?>
        <a class="list-row" href="<?= e(url('/admin/orders/' . $o['id'])) ?>"><span class="list-main"><strong>#<?= e($o['order_number']) ?></strong> · <?= e($o['customer_name']) ?><span class="muted small d-block"><?= e($o['district']) ?> · <?= e(time_ago($o['created_at'])) ?></span></span><span class="list-side"><?= status_badge($o['status']) ?><strong><?= money_en($o['total']) ?></strong></span></a>
      <?php endforeach; ?>
    </div>
    <?php endif; ?>
  </section>

  <section class="a-card a-table-card">
    <h2 class="a-card-title"><i class="fa-solid fa-box" aria-hidden="true"></i> Recent parcels</h2>
    <?php if (!$parcels): ?><p class="muted small">No parcels sent yet.</p><?php else: ?>
    <table class="a-table">
      <thead><tr><th>Order</th><th>Courier</th><th>Tracking</th><th>COD</th><th>Courier status</th><th>Sent</th></tr></thead>
      <tbody>
      <?php foreach ($parcels as $p): ?>
        <tr>
          <td data-label="Order"><a class="strong" href="<?= e(url('/admin/orders/' . $p['order_id'])) ?>">#<?= e($p['order_number']) ?></a><span class="muted small d-block"><?= e($p['customer_name']) ?></span></td>
          <td data-label="Courier"><?= e(ucfirst($p['courier_slug'])) ?></td>
          <td data-label="Tracking" class="mono small"><?= e($p['tracking_code'] ?: $p['consignment_id']) ?></td>
          <td data-label="COD"><?= money_en($p['cod_amount']) ?></td>
          <td data-label="Status"><span class="badge badge-info"><?= e($p['status'] ?: '—') ?></span> <?= status_badge($p['order_status']) ?></td>
          <td data-label="Sent" class="small muted"><?= e(time_ago($p['created_at'])) ?></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
    <?php endif; ?>
  </section>
</div>
