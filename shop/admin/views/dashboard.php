<?php
$cards = [
    ['আজকের অর্ডার', bn_num($stats['today_orders']), 'shopping-bag', 'c-blue', '/admin/orders'],
    ['আজকের বিক্রি', money($stats['today_revenue']), 'money', 'c-green', '/admin/orders'],
    ['পেন্ডিং', bn_num($stats['pending']), 'clock-o', 'c-amber', '/admin/orders?status=pending'],
    ['কনফার্মড/প্রসেসিং', bn_num($stats['confirmed']), 'check', 'c-indigo', '/admin/orders?status=confirmed'],
    ['কুরিয়ারে', bn_num($stats['courier']), 'truck', 'c-cyan', '/admin/orders?status=courier_sent'],
    ['ডেলিভারড', bn_num($stats['delivered']), 'check-circle', 'c-green', '/admin/orders?status=delivered'],
    ['বাতিল', bn_num($stats['cancelled']), 'times-circle', 'c-red', '/admin/orders?status=cancelled'],
    ['মোট রেভিনিউ (ডেলিভারড)', money($stats['revenue']), 'line-chart', 'c-green', '/admin/analytics'],
    ['এ মাসের বিক্রি', money($stats['month_revenue']), 'calendar', 'c-indigo', '/admin/analytics'],
    ['মোট পণ্য', bn_num($stats['products']), 'cube', 'c-blue', '/admin/products'],
    ['লো স্টক', bn_num($stats['low_stock']), 'exclamation-triangle', 'c-amber', '/admin/stock?filter=low'],
    ['ফ্রড অ্যালার্ট', bn_num($stats['fraud']), 'shield', 'c-red', '/admin/fraud'],
    ['ব্লকড IP', bn_num($stats['blocked']), 'ban', 'c-red', '/admin/blocked-ips'],
    ['আজকের ভিজিটর', bn_num($stats['visitors']), 'users', 'c-cyan', '/admin/analytics?days=1'],
];
?>
<div class="page-a" data-page="dashboard">
  <div class="stat-grid">
    <?php foreach ($cards as [$label, $value, $icon, $color, $href]): ?>
      <a class="stat <?= $color ?>" href="<?= $href ?>"><i class="fa fa-<?= $icon ?>"></i><span class="stat-v"><?= $value ?></span><span class="stat-l"><?= $label ?></span></a>
    <?php endforeach; ?>
  </div>

  <div class="grid-2 mt-16">
    <section class="card">
      <h2 class="card-title">দৈনিক বিক্রি (১৪ দিন)</h2>
      <div class="chart" data-chart='<?= e(json_encode(['type' => 'bar', 'labels' => array_column($days, 'label'), 'values' => array_column($days, 'revenue'), 'money' => true], JSON_UNESCAPED_UNICODE)) ?>'></div>
    </section>
    <section class="card">
      <h2 class="card-title">দৈনিক অর্ডার</h2>
      <div class="chart" data-chart='<?= e(json_encode(['type' => 'line', 'labels' => array_column($days, 'label'), 'values' => array_column($days, 'orders')], JSON_UNESCAPED_UNICODE)) ?>'></div>
    </section>
    <section class="card">
      <h2 class="card-title">মাসিক বিক্রি</h2>
      <?php if ($monthly): ?>
      <div class="chart" data-chart='<?= e(json_encode(['type' => 'bar', 'labels' => array_map(static fn ($m) => date('M y', strtotime($m['m'] . '-01')), $monthly), 'values' => array_map(static fn ($m) => (float) $m['revenue'], $monthly), 'money' => true], JSON_UNESCAPED_UNICODE)) ?>'></div>
      <?php else: ?><p class="muted small">এখনো কোনো ডেটা নেই।</p><?php endif; ?>
    </section>
    <section class="card">
      <h2 class="card-title">শীর্ষ পণ্য (৩০ দিন)</h2>
      <?php if ($topProducts): $max = max(array_column($topProducts, 'qty')); ?>
        <ul class="bar-list">
          <?php foreach ($topProducts as $t): ?>
          <li><span class="bl-name"><?= e(str_limit($t['name'], 36)) ?></span><span class="bl-bar"><i style="width:<?= round($t['qty'] / max(1, $max) * 100) ?>%"></i></span><b><?= bn_num($t['qty']) ?></b></li>
          <?php endforeach; ?>
        </ul>
      <?php else: ?><p class="muted small">এখনো কোনো বিক্রি নেই।</p><?php endif; ?>
    </section>
  </div>

  <div class="grid-2 mt-16">
    <section class="card">
      <div class="card-head"><h2 class="card-title">সাম্প্রতিক অর্ডার</h2><a href="/admin/orders" class="see-all">সব দেখুন</a></div>
      <?php if ($recent): ?>
      <div class="list">
        <?php foreach ($recent as $o): ?>
        <a class="list-row" href="/admin/orders/<?= (int) $o['id'] ?>">
          <div class="grow"><b><?= e($o['order_code']) ?></b> <?php View::partial('admin/views/partials/risk-badge', ['risk' => $o['risk_level']]); ?><br><span class="small muted"><?= e($o['customer_name']) ?> · <?= e($o['phone']) ?> · <?= time_ago($o['created_at']) ?></span></div>
          <div class="right"><b><?= money($o['total']) ?></b><br><?php View::partial('admin/views/partials/status-badge', ['status' => $o['status']]); ?></div>
        </a>
        <?php endforeach; ?>
      </div>
      <?php else: ?><p class="muted small">এখনো কোনো অর্ডার আসেনি।</p><?php endif; ?>
    </section>
    <div class="stack">
      <section class="card">
        <div class="card-head"><h2 class="card-title">লো স্টক</h2><a href="/admin/stock?filter=low" class="see-all">স্টক</a></div>
        <?php if ($lowStock): ?>
          <div class="list"><?php foreach ($lowStock as $p): ?>
            <a class="list-row" href="/admin/stock?q=<?= rawurlencode($p['name']) ?>"><span class="grow"><?= e($p['name']) ?></span><span class="pill <?= $p['stock'] <= 0 ? 'pill-red' : 'pill-amber' ?>"><?= bn_num($p['stock']) ?></span></a>
          <?php endforeach; ?></div>
        <?php else: ?><p class="muted small"><i class="fa fa-check-circle ok"></i> সব পণ্যের পর্যাপ্ত স্টক আছে।</p><?php endif; ?>
      </section>
      <section class="card">
        <div class="card-head"><h2 class="card-title">কুরিয়ার স্ট্যাটাস</h2><a href="/admin/couriers" class="see-all">ম্যানেজ</a></div>
        <?php if ($couriers): ?>
          <div class="list"><?php foreach ($couriers as $c): ?>
            <div class="list-row"><span class="grow"><?= e($c['name']) ?></span>
              <span class="pill <?= $c['last_test_status'] === 'success' ? 'pill-green' : ($c['last_test_status'] === 'error' ? 'pill-red' : '') ?>"><?= $c['last_test_status'] === 'success' ? 'সংযুক্ত' : ($c['last_test_status'] === 'error' ? 'ত্রুটি' : 'পরীক্ষা হয়নি') ?></span></div>
          <?php endforeach; ?></div>
        <?php else: ?><p class="muted small">কোনো কুরিয়ার চালু নেই। <a href="/admin/couriers">সেটআপ করুন</a></p><?php endif; ?>
      </section>
    </div>
  </div>
</div>
