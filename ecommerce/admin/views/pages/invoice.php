<?php
/**
 * Printable invoice / order slip (standalone document with print CSS).
 * @var array $o
 */
$nonce = View::nonce();
$status = config('order_statuses')[$o['status']] ?? ['label' => $o['status'], 'bn' => $o['status']];
?><!doctype html>
<html lang="bn">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Invoice #<?= e($o['order_number']) ?> — <?= e(setting('store_name')) ?></title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;600;700&display=swap">
<link rel="stylesheet" href="<?= e(admin_asset('css/print.css')) ?>">
<?= View::component('theme-vars') ?>
</head>
<body>
<div class="toolbar no-print">
  <button type="button" id="print-btn">Print</button>
  <a href="<?= e(url('/admin/orders/' . $o['id'])) ?>">Back to order</a>
</div>
<main class="invoice">
  <header class="inv-head">
    <div class="inv-brand">
      <?php if (setting('logo')): ?><img src="<?= e(upload_url(setting('logo'))) ?>" alt="" class="inv-logo"><?php endif; ?>
      <div>
        <h1><?= e(setting('store_name')) ?></h1>
        <p><?= e(setting('contact_address')) ?></p>
        <p><?= e(setting('contact_phone')) ?> · <?= e(setting('contact_email')) ?></p>
      </div>
    </div>
    <div class="inv-meta">
      <h2>INVOICE</h2>
      <p><strong>Order:</strong> #<?= e($o['order_number']) ?></p>
      <p><strong>Date:</strong> <?= e(date('d M Y, h:i A', strtotime($o['created_at']))) ?></p>
      <p><strong>Status:</strong> <?= e($status['label']) ?> (<?= e($status['bn']) ?>)</p>
      <p><strong>Payment:</strong> Cash on Delivery</p>
    </div>
  </header>

  <section class="inv-party">
    <h3>Deliver to</h3>
    <p class="big"><?= e($o['customer_name']) ?></p>
    <p><?= e($o['phone']) ?></p>
    <p><?= e($o['address']) ?>, <?= e($o['district']) ?></p>
    <?php if ($o['note']): ?><p class="note">Note: <?= e($o['note']) ?></p><?php endif; ?>
    <?php if ($o['courier']): ?><p class="note">Courier: <?= e(ucfirst($o['courier']['courier_slug'])) ?> · <?= e($o['courier']['tracking_code'] ?: $o['courier']['consignment_id']) ?></p><?php endif; ?>
  </section>

  <table class="inv-table">
    <thead><tr><th>#</th><th>Product</th><th class="r">Price</th><th class="r">Qty</th><th class="r">Total</th></tr></thead>
    <tbody>
    <?php foreach ($o['items'] as $i => $it): ?>
      <tr>
        <td><?= $i + 1 ?></td>
        <td><?= e($it['product_name']) ?><?php if ($it['size'] || $it['color'] || $it['sku']): ?><small><?= e(trim(($it['sku'] ? 'SKU ' . $it['sku'] . ' ' : '') . ($it['size'] ? 'Size ' . $it['size'] . ' ' : '') . ($it['color'] ? 'Color ' . $it['color'] : ''))) ?></small><?php endif; ?></td>
        <td class="r"><?= money_en($it['unit_price']) ?></td>
        <td class="r"><?= (int)$it['quantity'] ?></td>
        <td class="r"><?= money_en($it['line_total']) ?></td>
      </tr>
    <?php endforeach; ?>
    </tbody>
  </table>

  <table class="inv-totals">
    <tr><th>Subtotal</th><td><?= money_en($o['subtotal']) ?></td></tr>
    <tr><th>Delivery charge</th><td><?= money_en($o['delivery_charge']) ?></td></tr>
    <?php if ((float)$o['discount'] > 0): ?><tr><th>Discount<?= $o['coupon_code'] ? ' (' . e($o['coupon_code']) . ')' : '' ?></th><td>− <?= money_en($o['discount']) ?></td></tr><?php endif; ?>
    <tr class="grand"><th>Total to collect</th><td><?= money_en($o['total']) ?></td></tr>
  </table>

  <footer class="inv-foot">
    <p>Thank you for shopping with <?= e(setting('store_name')) ?>! · আমাদের সাথে শপিং করার জন্য ধন্যবাদ।</p>
    <p class="muted">Please check the product in front of the delivery person before payment.</p>
  </footer>
</main>
<script nonce="<?= e($nonce) ?>">
document.getElementById('print-btn').addEventListener('click', function () { window.print(); });
window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 300); });
</script>
</body>
</html>
