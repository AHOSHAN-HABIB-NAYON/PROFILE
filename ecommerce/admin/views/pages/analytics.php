<?php
/**
 * @var array $report @var string $range
 */
$rp = $report;
$ranges = ['today' => 'Today', '7d' => '7 days', '30d' => '30 days', 'custom' => 'Custom'];
$statusLabels = config('order_statuses');
?>
<div class="a-page">
  <div class="page-head">
    <div><h1 class="a-title">Analytics</h1><p class="muted small"><?= e(date('d M Y', strtotime($rp['from']))) ?> — <?= e(date('d M Y', strtotime($rp['to']))) ?> · Asia/Dhaka</p></div>
  </div>
  <form class="toolbar" method="get" action="<?= e(url('/admin/analytics')) ?>">
    <div class="segmented">
      <?php foreach ($ranges as $k => $l): ?><label><input type="radio" name="range" value="<?= e($k) ?>"<?= $range === $k ? ' checked' : '' ?> data-autosubmit><span><?= e($l) ?></span></label><?php endforeach; ?>
    </div>
    <label class="sr-only" for="an-from">From</label><input id="an-from" class="input input-sm" type="date" name="from" value="<?= e($rp['from']) ?>">
    <label class="sr-only" for="an-to">To</label><input id="an-to" class="input input-sm" type="date" name="to" value="<?= e($rp['to']) ?>">
    <button class="btn btn-sm btn-outline" type="submit" name="range" value="custom">Apply</button>
  </form>

  <div class="kpi-grid">
    <?= View::render('admin:partials/kpi', ['label' => 'Orders', 'value' => number_format($rp['orders']), 'icon' => 'fa-solid fa-bag-shopping', 'tone' => 'primary', 'href' => null]) ?>
    <?= View::render('admin:partials/kpi', ['label' => 'Sales (incl. delivery)', 'value' => money_en($rp['sales']), 'icon' => 'fa-solid fa-sack-dollar', 'tone' => 'success', 'href' => null]) ?>
    <?= View::render('admin:partials/kpi', ['label' => 'Revenue (products − discounts)', 'value' => money_en($rp['revenue']), 'icon' => 'fa-solid fa-coins', 'tone' => 'info', 'href' => null]) ?>
    <?= View::render('admin:partials/kpi', ['label' => 'Average order value', 'value' => money_en($rp['aov']), 'icon' => 'fa-solid fa-scale-balanced', 'tone' => 'primary', 'href' => null]) ?>
    <?= View::render('admin:partials/kpi', ['label' => 'Products sold', 'value' => number_format($rp['products_sold']), 'icon' => 'fa-solid fa-boxes-stacked', 'tone' => 'warning', 'href' => null]) ?>
    <?= View::render('admin:partials/kpi', ['label' => 'Conversion rate', 'value' => $rp['conversion_rate'] !== null ? $rp['conversion_rate'] . '%' : 'n/a', 'icon' => 'fa-solid fa-percent', 'tone' => 'success', 'href' => null]) ?>
  </div>

  <div class="a-grid-2">
    <section class="a-card"><div class="a-card-head"><h2>Sales</h2></div><div class="chart" data-chart="area" data-key="sales" data-money="1"><script type="application/json"><?= json_attr($rp['series']) ?></script></div></section>
    <section class="a-card"><div class="a-card-head"><h2>Orders</h2></div><div class="chart" data-chart="bar" data-key="orders"><script type="application/json"><?= json_attr($rp['series']) ?></script></div></section>
  </div>

  <div class="a-grid-3">
    <section class="a-card">
      <h2 class="a-card-title">Order status</h2>
      <?php foreach (['pending', 'confirmed', 'processing', 'sent_to_courier', 'shipped', 'delivered', 'cancelled', 'returned', 'fraud'] as $s): ?>
        <div class="bar-row"><span><?= e($statusLabels[$s]['label']) ?></span><span class="bar"><i style="width: <?= $rp['orders'] || array_sum($rp['statuses']) ? round(($rp['statuses'][$s] ?? 0) / max(1, array_sum($rp['statuses'])) * 100) : 0 ?>%"></i></span><strong><?= (int)($rp['statuses'][$s] ?? 0) ?></strong></div>
      <?php endforeach; ?>
    </section>
    <section class="a-card">
      <h2 class="a-card-title">Conversion funnel</h2>
      <?php foreach (['visitors' => 'Visitors', 'product_views' => 'Product views', 'add_to_cart' => 'Add to cart', 'checkout' => 'Checkout', 'orders' => 'Orders'] as $k => $l): ?>
        <div class="bar-row"><span><?= e($l) ?></span><span class="bar"><i style="width: <?= round(min(100, $rp['funnel'][$k] / max(1, $rp['funnel']['visitors'], $rp['funnel']['product_views']) * 100)) ?>%"></i></span><strong><?= number_format($rp['funnel'][$k]) ?></strong></div>
      <?php endforeach; ?>
      <p class="muted small">First-party counts (bots excluded). Page views: <?= number_format($rp['funnel']['page_views']) ?>.</p>
    </section>
    <section class="a-card">
      <h2 class="a-card-title">Top districts</h2>
      <?php if (!$rp['districts']): ?><p class="muted small">No data.</p><?php endif; ?>
      <?php foreach ($rp['districts'] as $d): ?><div class="bar-row"><span><?= e($d['name']) ?></span><span class="bar"><i style="width: <?= round($d['orders'] / max(1, $rp['districts'][0]['orders']) * 100) ?>%"></i></span><strong><?= (int)$d['orders'] ?></strong></div><?php endforeach; ?>
    </section>
  </div>

  <div class="a-grid-2">
    <section class="a-card a-table-card">
      <h2 class="a-card-title">Top products</h2>
      <?php if (!$rp['top_products']): ?><p class="muted small">No sales in this period.</p><?php else: ?>
      <table class="a-table"><thead><tr><th>Product</th><th>Qty</th><th class="t-right">Amount</th></tr></thead><tbody>
        <?php foreach ($rp['top_products'] as $t): ?><tr><td><?= e(str_limit($t['name'], 50)) ?></td><td><?= (int)$t['qty'] ?></td><td class="t-right"><?= money_en($t['amount']) ?></td></tr><?php endforeach; ?>
      </tbody></table>
      <?php endif; ?>
    </section>
    <section class="a-card a-table-card">
      <h2 class="a-card-title">Top categories</h2>
      <?php if (!$rp['top_categories']): ?><p class="muted small">No sales in this period.</p><?php else: ?>
      <table class="a-table"><thead><tr><th>Category</th><th>Qty</th><th class="t-right">Amount</th></tr></thead><tbody>
        <?php foreach ($rp['top_categories'] as $t): ?><tr><td><?= e($t['name']) ?></td><td><?= (int)$t['qty'] ?></td><td class="t-right"><?= money_en($t['amount']) ?></td></tr><?php endforeach; ?>
      </tbody></table>
      <?php endif; ?>
    </section>
  </div>
</div>
