<?php
/** @var array $order @var array $items @var bool $mine @var array $history */
$steps = [
    ['pending', 'অর্ডার নিশ্চিত', 'আপনার অর্ডার গ্রহণ করা হয়েছে'],
    ['confirmed', 'কনফার্ম করা হয়েছে', 'প্রতিনিধি কল করে নিশ্চিত করবেন'],
    ['processing', 'প্রসেসিং চলছে', 'পণ্য প্যাক করা হচ্ছে'],
    ['courier_sent', 'কুরিয়ারে পাঠানো হয়েছে', 'পণ্য ডেলিভারির পথে'],
    ['delivered', 'ডেলিভারড', 'পণ্য বুঝে নিয়ে মূল্য পরিশোধ করুন'],
];
$order_idx = array_search($order['status'], array_column($steps, 0), true);
$stopped = in_array($order['status'], ['cancelled', 'returned', 'failed'], true);
?>
<div class="page container narrow" data-page="success" data-order="<?= e($order['order_code']) ?>" data-value="<?= e($order['total']) ?>">
  <section class="success-hero card">
    <?php View::partial('components/truck-art'); ?>
    <h1><i class="fa fa-check-circle"></i> অর্ডার নিশ্চিত হয়েছে</h1>
    <p>আমাদের সাথে শপিং করার জন্য ধন্যবাদ।<br>আমাদের একজন প্রতিনিধি আপনাকে কল করবেন।</p>
    <div class="order-id-chip">অর্ডার আইডি: <b><?= e($order['order_code']) ?></b> <button type="button" class="icon-btn" data-copy="<?= e($order['order_code']) ?>" aria-label="অর্ডার আইডি কপি"><i class="fa fa-clone"></i></button></div>
  </section>

  <?php if ($mine): ?>
  <section class="card">
    <h2 class="card-title">অর্ডারের বিবরণ</h2>
    <dl class="spec">
      <div><dt>অর্ডার আইডি</dt><dd><?= e($order['order_code']) ?></dd></div>
      <div><dt>নাম</dt><dd><?= e($order['customer_name']) ?></dd></div>
      <div><dt>ফোন</dt><dd><?= e($order['phone']) ?></dd></div>
      <div><dt>ঠিকানা</dt><dd><?= e($order['address']) ?><?= mb_stripos($order['address'], $order['district']) === false ? ', ' . e($order['district']) : '' ?></dd></div>
      <div><dt>পেমেন্ট</dt><dd>ক্যাশ অন ডেলিভারি</dd></div>
    </dl>
    <ul class="mini-lines mt-12">
      <?php foreach ($items as $it): ?>
      <li><img src="<?= e(img_url($it['image'], 'sm')) ?>" alt="" width="44" height="44" loading="lazy">
        <div class="grow"><span class="mini-name"><?= e($it['name']) ?></span>
          <span class="small muted"><?= $it['size'] ? 'সাইজ: ' . e($it['size']) . ' · ' : '' ?><?= bn_num($it['quantity']) ?> × <?= money($it['unit_price']) ?></span></div>
        <strong><?= money($it['line_total']) ?></strong></li>
      <?php endforeach; ?>
    </ul>
    <dl class="totals">
      <div><dt>সাবটোটাল</dt><dd><?= money($order['subtotal']) ?></dd></div>
      <div><dt>ডেলিভারি চার্জ</dt><dd><?= (float) $order['delivery_charge'] > 0 ? money($order['delivery_charge']) : '<span class="ok">ফ্রি</span>' ?></dd></div>
      <?php if ((float) $order['discount'] > 0): ?><div class="ok"><dt>ডিসকাউন্ট</dt><dd>-<?= money($order['discount']) ?></dd></div><?php endif; ?>
      <div class="grand"><dt>সর্বমোট</dt><dd><?= money($order['total']) ?></dd></div>
    </dl>
  </section>

  <section class="card">
    <h2 class="card-title">অর্ডার স্ট্যাটাস</h2>
    <?php if ($stopped): ?>
      <p class="alert alert-warn small">এই অর্ডারটি <?= e(order_status_label($order['status'])) ?> হয়েছে। বিস্তারিত জানতে সাপোর্টে যোগাযোগ করুন।</p>
    <?php else: ?>
    <ol class="track">
      <?php foreach ($steps as $i => [$key, $label, $hint]): $done = $order_idx !== false && $i <= $order_idx; ?>
        <li class="<?= $done ? 'done' : '' ?><?= $i === $order_idx ? ' current' : '' ?>">
          <span class="dot"><?= $done ? '<i class="fa fa-check"></i>' : '' ?></span>
          <div><b><?= e($label) ?></b><span class="tiny muted"><?= isset($history[$key]) ? date('d M Y, h:i A', strtotime($history[$key])) : e($hint) ?></span></div>
        </li>
      <?php endforeach; ?>
    </ol>
    <?php endif; ?>
  </section>
  <?php endif; ?>

  <div class="success-actions">
    <a href="/products" class="btn btn-primary"><i class="fa fa-shopping-bag"></i> শপিং চালিয়ে যান</a>
    <?php if (Settings::on('whatsapp_enabled')): ?>
    <a href="#" class="btn btn-outline" data-whatsapp-order="<?= e($order['order_code']) ?>" data-no-spa target="_blank" rel="noopener"><i class="fa fa-whatsapp"></i> সাপোর্টে যোগাযোগ করুন</a>
    <?php else: ?>
    <a href="/contact" class="btn btn-outline"><i class="fa fa-headphones"></i> সাপোর্টে যোগাযোগ করুন</a>
    <?php endif; ?>
  </div>
</div>
