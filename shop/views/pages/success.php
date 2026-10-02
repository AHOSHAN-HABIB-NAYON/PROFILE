<?php /** @var array $order @var array $items @var bool $mine */ ?>
<div class="page container narrow" data-page="success" data-order="<?= e($order['order_code']) ?>" data-value="<?= e($order['total']) ?>">
  <section class="success-hero">
    <div class="success-check" aria-hidden="true"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-15"/></svg></div>
    <h1>অর্ডার নিশ্চিত হয়েছে</h1>
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
      <div><dt>ঠিকানা</dt><dd><?= e($order['address']) ?>, <?= e($order['district']) ?></dd></div>
    </dl>
    <ul class="mini-lines mt-12">
      <?php foreach ($items as $it): ?>
      <li><img src="<?= e(img_url($it['image'], 'sm')) ?>" alt="" width="44" height="44" loading="lazy">
        <div class="grow"><span class="mini-name"><?= e($it['name']) ?></span>
          <span class="small muted"><?= $it['size'] ? 'সাইজ: ' . e($it['size']) . ' · ' : '' ?>পরিমাণ: <?= bn_num($it['quantity']) ?></span></div>
        <strong><?= money($it['line_total']) ?></strong></li>
      <?php endforeach; ?>
    </ul>
    <dl class="totals">
      <div><dt>সাবটোটাল</dt><dd><?= money($order['subtotal']) ?></dd></div>
      <div><dt>ডেলিভারি চার্জ</dt><dd><?= (float) $order['delivery_charge'] > 0 ? money($order['delivery_charge']) : 'ফ্রি' ?></dd></div>
      <?php if ((float) $order['discount'] > 0): ?><div class="ok"><dt>ডিসকাউন্ট</dt><dd>-<?= money($order['discount']) ?></dd></div><?php endif; ?>
      <div class="grand"><dt>সর্বমোট</dt><dd><?= money($order['total']) ?></dd></div>
      <div><dt>পেমেন্ট মেথড</dt><dd>ক্যাশ অন ডেলিভারি</dd></div>
    </dl>
  </section>
  <?php endif; ?>

  <div class="success-actions">
    <a href="/products" class="btn btn-primary"><i class="fa fa-shopping-bag"></i> শপিং চালিয়ে যান</a>
    <?php if (Settings::on('whatsapp_enabled')): ?>
    <a href="#" class="btn btn-wa" data-whatsapp-order="<?= e($order['order_code']) ?>" data-no-spa target="_blank" rel="noopener"><i class="fa fa-whatsapp"></i> Support-এ যোগাযোগ করুন</a>
    <?php else: ?>
    <a href="/contact" class="btn btn-soft"><i class="fa fa-headphones"></i> Support-এ যোগাযোগ করুন</a>
    <?php endif; ?>
  </div>
</div>
