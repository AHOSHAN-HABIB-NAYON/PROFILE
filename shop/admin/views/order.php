<?php
/** @var array $o */
$shipment = ['name' => $o['customer_name'], 'phone' => $o['phone'], 'address' => $o['address'], 'district' => $o['district'], 'amount' => (float) $o['total'], 'note' => $o['note'] ?? ''];
?>
<div class="page-a" data-page="order" data-order-id="<?= (int) $o['id'] ?>">
  <div class="order-head card">
    <div>
      <a href="/admin/orders" class="small muted"><i class="fa fa-angle-left"></i> সব অর্ডার</a>
      <h2 class="order-code"><?= e($o['order_code']) ?> <button type="button" class="icon-btn" data-copy="<?= e($o['order_code']) ?>" aria-label="কপি"><i class="fa fa-clone"></i></button></h2>
      <p class="small muted"><?= date('d M Y, h:i A', strtotime($o['created_at'])) ?> · ক্যাশ অন ডেলিভারি</p>
    </div>
    <div class="order-head-right">
      <?php View::partial('admin/views/partials/status-badge', ['status' => $o['status']]); ?>
      <?php View::partial('admin/views/partials/risk-badge', ['risk' => $o['risk_level']]); ?>
      <b class="order-total"><?= money($o['total']) ?></b>
    </div>
  </div>

  <div class="action-bar">
    <?php if ($o['status'] === 'pending'): ?><button type="button" class="btn btn-primary btn-sm" data-post="/admin/api/orders/<?= (int) $o['id'] ?>/status" data-body='{"status":"confirmed"}' data-reload><i class="fa fa-check"></i> কনফার্ম</button><?php endif; ?>
    <?php if ($couriers && !in_array($o['status'], ['delivered', 'cancelled', 'returned', 'failed'], true)): ?><button type="button" class="btn btn-soft btn-sm" data-modal="tpl-courier" data-title="কুরিয়ারে পাঠান" data-auto-open="courier"><i class="fa fa-paper-plane"></i> কুরিয়ারে পাঠান</button><?php endif; ?>
    <button type="button" class="btn btn-soft btn-sm btn-check" data-post="/admin/api/orders/<?= (int) $o['id'] ?>/fraud" data-reload><i class="fa fa-shield"></i> Courier History / Fraud Check</button>
    <button type="button" class="btn btn-ghost btn-sm" data-modal="tpl-order-edit" data-title="অর্ডার সম্পাদনা" data-auto-open="edit"><i class="fa fa-pencil"></i> এডিট</button>
    <a href="tel:<?= e($o['phone']) ?>" class="btn btn-ghost btn-sm" data-no-spa><i class="fa fa-phone"></i> কল</a>
  </div>

  <div class="order-layout">
    <div class="stack">
      <section class="card">
        <h3 class="card-title">স্ট্যাটাস পরিবর্তন</h3>
        <form data-api="/admin/api/orders/<?= (int) $o['id'] ?>/status" data-reload class="status-form">
          <div class="status-pills">
            <?php foreach (Order::STATUSES as $s): ?>
              <label class="status-pill s-<?= $s ?>"><input type="radio" name="status" value="<?= $s ?>"<?= $o['status'] === $s ? ' checked' : '' ?>><span><?= order_status_label($s) ?></span></label>
            <?php endforeach; ?>
          </div>
          <div class="row-btns mt-8"><input type="text" name="note" placeholder="নোট (ঐচ্ছিক)" class="input grow" maxlength="400"><button class="btn btn-primary btn-sm">আপডেট</button></div>
          <p class="tiny muted mt-8">বাতিল/রিটার্ন/ব্যর্থ করলে স্টক স্বয়ংক্রিয়ভাবে ফেরত যাবে।</p>
        </form>
      </section>

      <section class="card">
        <div class="card-head"><h3 class="card-title">অর্ডারকৃত পণ্য</h3></div>
        <ul class="mini-lines">
          <?php foreach ($items as $it): ?>
          <li><img src="<?= e(img_url($it['image'], 'sm')) ?>" alt="" width="44" height="44" loading="lazy">
            <div class="grow"><span class="mini-name"><?= e($it['name']) ?><?= $it['item_type'] === 'combo' ? ' <span class="tag tag-soft">কম্বো</span>' : '' ?></span>
              <span class="small muted"><?= $it['size'] ? 'সাইজ: <b>' . e($it['size']) . '</b> · ' : '' ?><?= bn_num($it['quantity']) ?> × <?= money($it['unit_price']) ?></span></div>
            <strong><?= money($it['line_total']) ?></strong></li>
          <?php endforeach; ?>
        </ul>
        <dl class="totals">
          <div><dt>সাবটোটাল</dt><dd><?= money($o['subtotal']) ?></dd></div>
          <div><dt>ডেলিভারি চার্জ (<?= $o['delivery_zone'] === 'inside' ? 'ঢাকার ভিতরে' : ($o['delivery_zone'] === 'free' ? 'ফ্রি' : 'ঢাকার বাইরে') ?>)</dt><dd><?= money($o['delivery_charge']) ?></dd></div>
          <?php if ((float) $o['discount'] > 0): ?><div class="ok"><dt>ডিসকাউন্ট<?= $o['coupon_code'] ? ' (' . e($o['coupon_code']) . ')' : '' ?></dt><dd>-<?= money($o['discount']) ?></dd></div><?php endif; ?>
          <div class="grand"><dt>সর্বমোট (COD)</dt><dd><?= money($o['total']) ?></dd></div>
        </dl>
      </section>

      <section class="card">
        <div class="card-head"><h3 class="card-title">কাস্টমার তথ্য</h3><button type="button" class="btn btn-soft btn-xs" data-modal="tpl-order-edit" data-title="অর্ডার সম্পাদনা"><i class="fa fa-pencil"></i> সম্পাদনা</button></div>
        <dl class="spec">
          <div><dt>নাম</dt><dd><?= e($o['customer_name']) ?></dd></div>
          <div><dt>ফোন</dt><dd><a href="tel:<?= e($o['phone']) ?>" data-no-spa><?= e($o['phone']) ?></a> · <a href="https://wa.me/88<?= e($o['phone']) ?>" target="_blank" rel="noopener" class="ok"><i class="fa fa-whatsapp"></i></a></dd></div>
          <div><dt>জেলা</dt><dd><?= e($o['district']) ?></dd></div>
          <div><dt>ঠিকানা</dt><dd><?= e($o['address']) ?></dd></div>
          <?php if ($o['note']): ?><div><dt>কাস্টমার নোট</dt><dd><?= e($o['note']) ?></dd></div><?php endif; ?>
          <?php if ($o['admin_note']): ?><div><dt>অ্যাডমিন নোট</dt><dd><?= e($o['admin_note']) ?></dd></div><?php endif; ?>
        </dl>
        <?php if ($otherOrders): ?>
          <p class="small strong mt-12">এই নম্বরের অন্যান্য অর্ডার</p>
          <div class="list"><?php foreach ($otherOrders as $x): ?>
            <a class="list-row" href="/admin/orders/<?= (int) $x['id'] ?>"><span class="grow"><?= e($x['order_code']) ?> <span class="small muted"><?= date('d/m/y', strtotime($x['created_at'])) ?></span></span><?php View::partial('admin/views/partials/status-badge', ['status' => $x['status']]); ?><b class="small"><?= money($x['total']) ?></b></a>
          <?php endforeach; ?></div>
        <?php endif; ?>
      </section>
    </div>

    <div class="stack">
      <section class="card">
        <div class="card-head"><h3 class="card-title"><i class="fa fa-truck"></i> কুরিয়ার</h3></div>
        <?php foreach ($courierOrders as $co): ?>
          <div class="courier-row">
            <div class="grow"><b><?= e($co['courier_name'] ?: $co['courier_code']) ?></b>
              <span class="small">CID: <b><?= e($co['consignment_id']) ?></b><?= $co['tracking_code'] && $co['tracking_code'] !== $co['consignment_id'] ? ' · ট্র্যাকিং: <b>' . e($co['tracking_code']) . '</b>' : '' ?></span>
              <span class="small muted">স্ট্যাটাস: <?= e($co['status'] ?: '—') ?> · COD <?= money($co['cod_amount']) ?><?= $co['last_synced_at'] ? ' · ' . time_ago($co['last_synced_at']) : '' ?></span></div>
            <button type="button" class="btn btn-soft btn-xs" data-post="/admin/api/courier-orders/<?= (int) $co['id'] ?>/sync" data-reload><i class="fa fa-refresh"></i> সিঙ্ক</button>
          </div>
        <?php endforeach; ?>
        <?php if ($couriers): ?>
          <button type="button" class="btn btn-primary btn-block btn-sm" data-modal="tpl-courier" data-title="কুরিয়ারে পাঠান"><i class="fa fa-paper-plane"></i> কুরিয়ারে পাঠান</button>
        <?php else: ?>
          <p class="small muted">কোনো কুরিয়ার চালু নেই। <a href="/admin/couriers">কুরিয়ার সেটআপ করুন</a></p>
        <?php endif; ?>
      </section>

      <section class="card">
        <div class="card-head"><h3 class="card-title"><i class="fa fa-shield"></i> কুরিয়ার হিস্ট্রি / ফ্রড চেক</h3>
          <button type="button" class="btn btn-soft btn-xs" data-post="/admin/api/orders/<?= (int) $o['id'] ?>/fraud" data-reload><i class="fa fa-search"></i> Courier History Check</button></div>
        <?php if ($courierCheck || $fraud): ?>
          <?php
          $r = [
              'risk' => $fraud['risk_level'] ?? 'new', 'risk_label' => risk_label($fraud['risk_level'] ?? 'new'), 'reason' => $fraud['reason'] ?? '',
              'local' => $local, 'courier_error' => null, 'cached' => false,
              'courier' => $courierCheck ? ['total' => (int) $courierCheck['total'], 'delivered' => (int) $courierCheck['delivered'], 'cancelled' => (int) $courierCheck['cancelled'],
                  'returned' => (int) $courierCheck['returned'], 'success_rate' => (float) $courierCheck['success_rate'], 'couriers' => json_decode((string) $courierCheck['couriers'], true) ?: []] : null,
          ];
          View::partial('admin/views/partials/fraud-result', ['r' => $r, 'phone' => $o['phone']]);
          ?>
          <?php if ($courierCheck): ?><p class="tiny muted">শেষ চেক: <?= time_ago($courierCheck['checked_at']) ?></p><?php endif; ?>
        <?php else: ?>
          <p class="small muted">এখনো চেক করা হয়নি। এই শপে এই নম্বরে মোট <?= bn_num($local['total']) ?>টি অর্ডার।</p>
        <?php endif; ?>
      </section>

      <section class="card">
        <div class="card-head"><h3 class="card-title"><i class="fa fa-globe"></i> ডিভাইস ও লোকেশন</h3>
          <button type="button" class="btn btn-soft btn-xs" data-post="/admin/api/orders/<?= (int) $o['id'] ?>/geo" data-reload><i class="fa fa-map-marker"></i> লোকেশন দেখুন</button></div>
        <dl class="spec">
          <div><dt>IP</dt><dd><?= e($o['ip'] ?: '—') ?> <?= $blocked ? '<span class="pill pill-red">ব্লকড</span>' : '' ?></dd></div>
          <div><dt>ডিভাইস</dt><dd><?= e(trim($o['device'] . ' · ' . $o['os'] . ' · ' . $o['browser'], ' ·')) ?></dd></div>
          <?php if ($geo && !empty($geo['ok'])): ?>
            <div><dt>দেশ</dt><dd><?= e($geo['country'] ?? '—') ?></dd></div>
            <div><dt>অঞ্চল / শহর</dt><dd><?= e(trim(($geo['region'] ?? '') . ', ' . ($geo['city'] ?? ''), ', ')) ?></dd></div>
            <div><dt>ISP</dt><dd><?= e($geo['isp'] ?? '—') ?></dd></div>
            <?php if (!empty($geo['lat'])): ?><div><dt>আনুমানিক অবস্থান</dt><dd><a href="https://www.google.com/maps?q=<?= e($geo['lat'] . ',' . $geo['lng']) ?>" target="_blank" rel="noopener"><?= e(round((float) $geo['lat'], 3) . ', ' . round((float) $geo['lng'], 3)) ?></a> <span class="tiny muted">(IP-ভিত্তিক, আনুমানিক)</span></dd></div><?php endif; ?>
          <?php elseif ($geo): ?>
            <div><dt>লোকেশন</dt><dd class="muted small"><?= e($geo['note'] ?? '—') ?></dd></div>
          <?php endif; ?>
          <div><dt>User agent</dt><dd class="tiny muted break"><?= e($o['user_agent']) ?></dd></div>
        </dl>
        <?php if ($o['ip'] && !$blocked): ?>
          <div class="row-btns mt-8">
            <button type="button" class="btn btn-ghost btn-xs" data-post="/admin/api/orders/<?= (int) $o['id'] ?>/block-ip" data-body='{"type":"temporary","hours":72}' data-confirm="এই IP ৭২ ঘণ্টার জন্য ব্লক করবেন?" data-reload><i class="fa fa-ban"></i> সাময়িক ব্লক</button>
            <button type="button" class="btn btn-ghost btn-xs danger-text" data-post="/admin/api/orders/<?= (int) $o['id'] ?>/block-ip" data-body='{"type":"lifetime"}' data-confirm="এই IP স্থায়ীভাবে ব্লক করবেন?" data-reload><i class="fa fa-ban"></i> স্থায়ী ব্লক</button>
          </div>
        <?php endif; ?>
      </section>

      <section class="card">
        <h3 class="card-title"><i class="fa fa-history"></i> স্ট্যাটাস হিস্ট্রি</h3>
        <ol class="timeline">
          <?php foreach ($history as $h): ?>
            <li><span class="status s-<?= e($h['status']) ?> dot"></span><div><b><?= e(order_status_label($h['status'])) ?></b> <span class="tiny muted"><?= date('d/m/y h:i A', strtotime($h['created_at'])) ?><?= $h['admin_name'] ? ' · ' . e($h['admin_name']) : '' ?></span><?php if ($h['note']): ?><br><span class="small"><?= e($h['note']) ?></span><?php endif; ?></div></li>
          <?php endforeach; ?>
        </ol>
      </section>
      <button type="button" class="btn btn-ghost btn-sm danger-text" data-post="/admin/api/orders/<?= (int) $o['id'] ?>/trash" data-confirm="অর্ডারটি ট্র্যাশে পাঠাবেন? ট্র্যাশ থেকে ফিরিয়ে আনা যাবে।"><i class="fa fa-trash"></i> ট্র্যাশে পাঠান</button>
    </div>
  </div>

  <template id="tpl-order-edit">
    <form data-api="/admin/api/orders/<?= (int) $o['id'] ?>/update" data-reload data-close>
      <div class="field"><label>নাম</label><input name="customer_name" value="<?= e($o['customer_name']) ?>" required></div>
      <div class="field"><label>ফোন</label><input name="phone" value="<?= e($o['phone']) ?>" required></div>
      <div class="field"><label>জেলা</label><input name="district" value="<?= e($o['district']) ?>"></div>
      <div class="field"><label>ঠিকানা</label><textarea name="address" rows="2"><?= e($o['address']) ?></textarea></div>
      <div class="grid-2">
        <div class="field"><label>ডেলিভারি চার্জ (৳)</label><input name="delivery_charge" value="<?= e((float) $o['delivery_charge']) ?>" inputmode="decimal"></div>
        <div class="field"><label>ডিসকাউন্ট (৳)</label><input name="discount" value="<?= e((float) $o['discount']) ?>" inputmode="decimal"></div>
      </div>
      <p class="tiny muted">সর্বমোট = সাবটোটাল (<?= money($o['subtotal']) ?>) − ডিসকাউন্ট + ডেলিভারি</p>
      <div class="field"><label>কাস্টমার নোট</label><textarea name="note" rows="2"><?= e($o['note']) ?></textarea></div>
      <div class="field"><label>অ্যাডমিন নোট</label><textarea name="admin_note" rows="2"><?= e($o['admin_note']) ?></textarea></div>
      <button class="btn btn-primary btn-block">সংরক্ষণ করুন</button>
    </form>
  </template>

  <template id="tpl-courier">
    <form data-api="/admin/api/orders/<?= (int) $o['id'] ?>/courier" data-reload data-close>
      <div class="field"><label>কুরিয়ার</label>
        <select name="courier"><?php foreach ($couriers as $c): ?><option value="<?= e($c['code']) ?>"<?= $c['is_default'] ? ' selected' : '' ?>><?= e($c['name']) ?></option><?php endforeach; ?></select></div>
      <p class="tiny muted">পাঠানোর আগে তথ্য যাচাই/সম্পাদনা করুন:</p>
      <div class="field"><label>কাস্টমারের নাম</label><input name="name" value="<?= e($shipment['name']) ?>" required></div>
      <div class="field"><label>ফোন</label><input name="phone" value="<?= e($shipment['phone']) ?>" required></div>
      <div class="field"><label>ঠিকানা</label><textarea name="address" rows="2"><?= e($shipment['address']) ?></textarea></div>
      <div class="grid-2">
        <div class="field"><label>জেলা</label><input name="district" value="<?= e($shipment['district']) ?>"></div>
        <div class="field"><label>COD পরিমাণ (৳)</label><input name="amount" value="<?= e($shipment['amount']) ?>" inputmode="decimal"></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>ওজন (কেজি)</label><input name="weight" value="0.5" inputmode="decimal"></div>
        <div class="field"><label>নোট</label><input name="note" value="<?= e($shipment['note']) ?>"></div>
      </div>
      <button class="btn btn-primary btn-block"><i class="fa fa-paper-plane"></i> কুরিয়ারে পাঠান</button>
    </form>
  </template>
</div>
