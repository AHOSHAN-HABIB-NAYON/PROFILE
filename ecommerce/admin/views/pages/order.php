<?php
/**
 * Order details.
 * @var array $o @var array $history @var array $phoneHistory @var array $geo @var array $statuses @var array $districts
 * @var bool $locked @var array $courierOptions @var ?string $trackingUrl @var bool $fraudEnabled @var bool $autoFraud @var ?array $customer
 */
$co = $o['courier'];
?>
<div class="a-page order-page" data-order-id="<?= (int)$o['id'] ?>">
  <div class="page-head">
    <div>
      <a href="<?= e(url('/admin/orders')) ?>" class="back-link"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Orders</a>
      <h1 class="a-title">Order #<?= e($o['order_number']) ?> <?= status_badge($o['status']) ?></h1>
      <p class="muted small">Placed <?= e(date('d M Y, h:i A', strtotime($o['created_at']))) ?> · Cash on Delivery</p>
    </div>
    <div class="head-actions">
      <a class="btn btn-ghost btn-sm" href="<?= e(url('/admin/orders/' . $o['id'] . '/print')) ?>" target="_blank" rel="noopener" data-no-spa><i class="fa-solid fa-print" aria-hidden="true"></i> Print</a>
      <button type="button" class="btn btn-ghost btn-sm danger" data-action="post" data-url="<?= e(url('/admin/orders/' . $o['id'] . '/delete')) ?>" data-confirm="Move order #<?= e($o['order_number']) ?> to trash?"><i class="fa-solid fa-trash" aria-hidden="true"></i> Delete</button>
    </div>
  </div>

  <div class="order-layout">
    <div class="order-main">
      <section class="a-card">
        <h2 class="a-card-title"><i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i> Status</h2>
        <form class="status-form" method="post" action="<?= e(url('/admin/orders/' . $o['id'] . '/status')) ?>" data-ajax data-no-spa>
          <label class="sr-only" for="os-status">Status</label>
          <select id="os-status" class="input" name="status">
            <?php foreach ($statuses as $k => $s): ?><option value="<?= e($k) ?>"<?= $o['status'] === $k ? ' selected' : '' ?>><?= e($s['label']) ?> — <?= e($s['bn']) ?></option><?php endforeach; ?>
          </select>
          <label class="sr-only" for="os-note">Note</label>
          <input id="os-note" class="input" name="note" placeholder="Note (optional)" maxlength="200">
          <label class="check small"><input type="checkbox" name="block_customer" value="1"> Also block this customer from ordering</label>
          <button class="btn btn-primary" type="submit">Update status</button>
        </form>
        <p class="muted small">Cancelled / returned / fraud / blocked orders return their items to stock automatically.</p>
      </section>

      <section class="a-card">
        <div class="a-card-head">
          <h2 class="a-card-title"><i class="fa-solid fa-user" aria-hidden="true"></i> Customer &amp; items</h2>
          <?php if ($locked): ?><span class="badge badge-muted"><i class="fa-solid fa-lock" aria-hidden="true"></i> Locked (with courier)</span><?php endif; ?>
        </div>
        <form method="post" action="<?= e(url('/admin/orders/' . $o['id'] . '/update')) ?>" data-ajax data-no-spa>
          <fieldset<?= $locked ? ' disabled' : '' ?>>
          <div class="grid-2">
            <div class="field"><label class="label" for="oe-name">Name</label><input id="oe-name" class="input" name="customer_name" value="<?= e($o['customer_name']) ?>" required></div>
            <div class="field"><label class="label" for="oe-phone">Phone</label><div class="input-group"><input id="oe-phone" class="input" name="phone" value="<?= e($o['phone']) ?>" required><a class="icon-btn" href="tel:<?= e($o['phone']) ?>" aria-label="Call"><i class="fa-solid fa-phone" aria-hidden="true"></i></a></div></div>
          </div>
          <div class="grid-2">
            <div class="field"><label class="label" for="oe-district">District</label><select id="oe-district" class="input" name="district"><?php foreach ($districts as $d): ?><option<?= $o['district'] === $d ? ' selected' : '' ?>><?= e($d) ?></option><?php endforeach; ?></select></div>
            <div class="field"><label class="label" for="oe-note">Customer note</label><input id="oe-note" class="input" name="note" value="<?= e($o['note']) ?>"></div>
          </div>
          <div class="field"><label class="label" for="oe-address">Address</label><textarea id="oe-address" class="input" name="address" rows="2" required><?= e($o['address']) ?></textarea></div>

          <div class="table-scroll">
            <table class="a-table items-table">
              <thead><tr><th>Product</th><th>Price</th><th>Qty</th><th class="t-right">Total</th></tr></thead>
              <tbody>
              <?php foreach ($o['items'] as $it): ?>
                <tr>
                  <td><div class="cell-product"><img src="<?= e(packed_image_url($it['image'])) ?>" alt="" width="40" height="40" class="thumb-sm"><div><strong><?= e($it['product_name']) ?></strong><span class="muted small d-block"><?= e(trim(($it['sku'] ? 'SKU ' . $it['sku'] : '') . ($it['size'] ? ' · Size ' . $it['size'] : '') . ($it['color'] ? ' · ' . $it['color'] : ''), ' ·')) ?></span></div></div></td>
                  <td><?= money_en($it['unit_price']) ?></td>
                  <td><label class="sr-only" for="qty-<?= (int)$it['id'] ?>">Quantity</label><input id="qty-<?= (int)$it['id'] ?>" class="input input-sm qty-cell" type="number" min="0" max="100" name="items[<?= (int)$it['id'] ?>]" value="<?= (int)$it['quantity'] ?>"></td>
                  <td class="t-right"><?= money_en($it['line_total']) ?></td>
                </tr>
              <?php endforeach; ?>
              </tbody>
            </table>
          </div>
          <div class="totals-edit">
            <div class="grid-2">
              <div class="field"><label class="label" for="oe-delivery">Delivery charge (৳)</label><input id="oe-delivery" class="input" type="number" step="0.01" min="0" name="delivery_charge" value="<?= e($o['delivery_charge']) ?>"></div>
              <div class="field"><label class="label" for="oe-discount">Discount (৳)<?= $o['coupon_code'] ? ' · coupon ' . e($o['coupon_code']) : '' ?></label><input id="oe-discount" class="input" type="number" step="0.01" min="0" name="discount" value="<?= e($o['discount']) ?>"></div>
            </div>
            <dl class="totals">
              <div><dt>Subtotal</dt><dd><?= money_en($o['subtotal']) ?></dd></div>
              <div><dt>Delivery (<?= $o['delivery_zone'] === 'inside' ? 'inside Dhaka' : 'outside Dhaka' ?>)</dt><dd><?= money_en($o['delivery_charge']) ?></dd></div>
              <div><dt>Discount</dt><dd>− <?= money_en($o['discount']) ?></dd></div>
              <div class="totals-grand"><dt>Total (COD)</dt><dd><?= money_en($o['total']) ?></dd></div>
            </dl>
          </div>
          <div class="field"><label class="label" for="oe-admin-note">Internal note (admins only)</label><textarea id="oe-admin-note" class="input" name="admin_note" rows="2"><?= e($o['admin_note']) ?></textarea></div>
          <p class="muted small">Set a quantity to 0 to remove an item. Totals are recalculated on the server and every change is recorded in the history.</p>
          <div class="form-actions"><button class="btn btn-primary" type="submit"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Save changes</button></div>
          </fieldset>
        </form>
      </section>

      <section class="a-card">
        <h2 class="a-card-title"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i> History</h2>
        <?php if (!$history): ?><p class="muted small">No changes yet.</p><?php else: ?>
        <ol class="history">
          <?php foreach ($history as $h): ?>
            <li><span class="history-dot"></span><div><strong><?= e(ucfirst(str_replace('_', ' ', $h['action']))) ?></strong><?= $h['field'] ? ' · ' . e($h['field']) : '' ?>
              <?php if ($h['old_value'] !== null || $h['new_value'] !== null): ?><span class="small d-block"><del class="muted"><?= e(str_limit((string)$h['old_value'], 80)) ?></del> → <?= e(str_limit((string)$h['new_value'], 80)) ?></span><?php endif; ?>
              <span class="muted small d-block"><?= e($h['admin_name'] ?: 'System') ?> · <?= e(date('d M Y, h:i A', strtotime($h['created_at']))) ?> · <?= e($h['ip']) ?></span></div></li>
          <?php endforeach; ?>
        </ol>
        <?php endif; ?>
      </section>
    </div>

    <aside class="order-side">
      <section class="a-card courier-card">
        <h2 class="a-card-title"><i class="fa-solid fa-truck-fast" aria-hidden="true"></i> Courier</h2>
        <?php if ($co): ?>
          <dl class="kv">
            <div><dt>Courier</dt><dd><?= e(ucfirst($co['courier_slug'])) ?></dd></div>
            <div><dt>Consignment ID</dt><dd class="mono"><?= e($co['consignment_id'] ?: '—') ?></dd></div>
            <div><dt>Tracking</dt><dd class="mono"><?= e($co['tracking_code'] ?: '—') ?></dd></div>
            <div><dt>Status</dt><dd><span class="badge badge-info"><?= e($co['status'] ?: 'created') ?></span></dd></div>
            <div><dt>COD amount</dt><dd><?= money_en($co['cod_amount']) ?></dd></div>
            <div><dt>Sent</dt><dd><?= e(date('d M Y, h:i A', strtotime($co['created_at']))) ?></dd></div>
          </dl>
          <div class="form-actions">
            <?php if ($trackingUrl): ?><a class="btn btn-sm btn-ghost" href="<?= e($trackingUrl) ?>" target="_blank" rel="noopener"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> Track</a><?php endif; ?>
            <button type="button" class="btn btn-sm btn-outline" data-action="post" data-url="<?= e(url('/api/admin/courier/sync/' . $o['id'])) ?>"><i class="fa-solid fa-rotate" aria-hidden="true"></i> Refresh status</button>
          </div>
        <?php elseif (!$courierOptions): ?>
          <p class="muted small">No delivery courier is enabled. <a href="<?= e(url('/admin/plugins')) ?>">Configure Steadfast, Pathao or RedX in Plugins</a>.</p>
        <?php elseif (!in_array($o['status'], ['pending', 'confirmed', 'processing'], true)): ?>
          <p class="muted small">Courier submission is available for pending, confirmed or processing orders.</p>
        <?php else: ?>
          <p class="muted small">Review the details before sending. You can edit name, phone, address and COD amount.</p>
          <button type="button" class="btn btn-primary btn-block" data-action="courier-send"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> কুরিয়ারে পাঠান</button>
          <template data-courier-form>
            <form class="courier-form" data-courier-send-form>
              <div class="field"><label class="label" for="cs-courier">Courier</label><select id="cs-courier" class="input" name="courier"><?php foreach ($courierOptions as $c): ?><option value="<?= e($c['slug']) ?>"><?= e($c['name']) ?></option><?php endforeach; ?></select></div>
              <div class="grid-2">
                <div class="field"><label class="label" for="cs-name">Recipient name</label><input id="cs-name" class="input" name="name" value="<?= e($o['customer_name']) ?>" required></div>
                <div class="field"><label class="label" for="cs-phone">Phone</label><input id="cs-phone" class="input" name="phone" value="<?= e($o['phone']) ?>" required></div>
              </div>
              <div class="field"><label class="label" for="cs-address">Address</label><textarea id="cs-address" class="input" name="address" rows="2" required><?= e($o['address']) ?></textarea><p class="field-hint small muted">District “<?= e($o['district']) ?>” is appended automatically.</p></div>
              <div class="grid-2">
                <div class="field"><label class="label" for="cs-amount">COD amount (৳)</label><input id="cs-amount" class="input" type="number" min="0" step="1" name="amount" value="<?= e((float)$o['total']) ?>" required></div>
                <div class="field"><label class="label" for="cs-note">Note for courier</label><input id="cs-note" class="input" name="note" value="<?= e($o['note']) ?>" maxlength="250"></div>
              </div>
            </form>
          </template>
        <?php endif; ?>
      </section>

      <section class="a-card">
        <h2 class="a-card-title"><i class="fa-solid fa-user-shield" aria-hidden="true"></i> Customer history &amp; fraud check</h2>
        <div class="stat-row">
          <div><strong><?= (int)($phoneHistory['total'] ?? 0) ?></strong><span>Other orders</span></div>
          <div><strong class="text-success"><?= (int)($phoneHistory['delivered'] ?? 0) ?></strong><span>Delivered</span></div>
          <div><strong class="text-danger"><?= (int)($phoneHistory['cancelled'] ?? 0) ?></strong><span>Cancelled</span></div>
          <div><strong class="text-danger"><?= (int)($phoneHistory['returned'] ?? 0) ?></strong><span>Returned</span></div>
          <div><strong class="text-danger"><?= (int)($phoneHistory['fraud'] ?? 0) ?></strong><span>Fraud/blocked</span></div>
        </div>
        <?php if ($customer): ?>
          <p class="small"><a href="<?= e(url('/admin/customers/' . $customer['id'])) ?>">View customer profile</a><?= (int)$customer['is_blocked'] === 1 ? ' · <span class="badge badge-danger">Blocked</span>' : '' ?></p>
        <?php endif; ?>
        <?php if ($fraudEnabled): ?>
          <div class="fraud-box" data-fraud data-url="<?= e(url('/api/admin/courier/fraud/' . $o['id'])) ?>"<?= $autoFraud ? ' data-auto' : '' ?>>
            <button type="button" class="btn btn-sm btn-outline" data-action="fraud-check"><i class="fa-solid fa-magnifying-glass-chart" aria-hidden="true"></i> Check courier history</button>
            <div data-fraud-result></div>
          </div>
        <?php else: ?>
          <p class="muted small">Enable BD Courier in Plugins to see this customer's parcel history across couriers.</p>
        <?php endif; ?>
        <p class="muted small">Numbers come from your own orders and the courier API. They are signals, not a fraud probability.</p>
      </section>

      <section class="a-card">
        <h2 class="a-card-title"><i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i> Device &amp; approximate location</h2>
        <dl class="kv" data-geo>
          <div><dt>IP address</dt><dd class="mono"><?= e($o['ip']) ?></dd></div>
          <div><dt>Country</dt><dd><?= e($geo['country'] ?? '—') ?></dd></div>
          <div><dt>Region / city</dt><dd><?= e(trim(($geo['region'] ?? '') . ', ' . ($geo['city'] ?? ''), ', ') ?: '—') ?></dd></div>
          <div><dt>ISP / ASN</dt><dd><?= e(trim(($geo['isp'] ?? '') . ' ' . ($geo['asn'] ?? '')) ?: '—') ?></dd></div>
          <div><dt>Device</dt><dd><?= e(ucfirst((string)$o['device_type'])) ?></dd></div>
        </dl>
        <p class="small ua"><?= e($o['user_agent']) ?></p>
        <p class="muted small"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> IP geolocation is approximate (network/ISP level) and is not the customer's exact physical location.</p>
        <button type="button" class="btn btn-sm btn-ghost" data-action="post" data-url="<?= e(url('/api/admin/orders/' . $o['id'] . '/geo')) ?>"><i class="fa-solid fa-rotate" aria-hidden="true"></i> Refresh location</button>
      </section>
    </aside>
  </div>
</div>
