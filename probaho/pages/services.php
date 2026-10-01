<?php
/** Service grid (admin-controlled), grouped by category. */
View::$meta['title'] = 'সার্ভিস';
View::$meta['description'] = 'SIM Biometric, NID, সরকারি সেবা, MFS, BTRC, IMEI, মোবাইল রিচার্জ, বিল পেমেন্ট, Binance Pay সহ সব সার্ভিস।';
$cats = db()->all('SELECT * FROM service_categories WHERE is_active = 1 ORDER BY sort_order, id');
$services = db()->all('SELECT * FROM services WHERE is_active = 1 ORDER BY sort_order, id');
$byCat = [];
foreach ($services as $s) {
    $byCat[(int) $s['category_id']][] = $s;
}
$cat = (string) ($_GET['c'] ?? '');
$public = !$user;
?>
<?php if ($public): ?><div class="container public-page"><div class="section-head"><span class="eyebrow">সার্ভিস</span><h1 style="font-size:28px">আমাদের সার্ভিসসমূহ</h1><p>প্রয়োজনীয় সব ডিজিটাল সেবা এক জায়গায়।</p></div><?php endif; ?>
<div class="chips" style="margin-bottom:14px">
  <a href="<?= e(url('/services')) ?>" class="chip <?= $cat === '' ? 'active' : '' ?>" data-link>সব</a>
  <?php foreach ($cats as $c): if (empty($byCat[(int) $c['id']])) continue; ?>
    <a href="<?= e(url('/services?c=' . $c['slug'])) ?>" class="chip <?= $cat === $c['slug'] ? 'active' : '' ?>" data-link><?= e($c['name']) ?></a>
  <?php endforeach; ?>
</div>
<?php if (!$services): ?>
  <div class="card"><?= empty_state('grid', 'এখনো কোনো সার্ভিস যোগ করা হয়নি') ?></div>
<?php elseif ($cat === ''): ?>
  <div class="service-grid wide"><?php foreach ($services as $s) echo service_tile($s); ?></div>
<?php else: ?>
  <?php foreach ($cats as $c): if ($c['slug'] !== $cat) continue; ?>
    <div class="service-grid wide"><?php foreach ($byCat[(int) $c['id']] ?? [] as $s) echo service_tile($s); ?></div>
  <?php endforeach; ?>
<?php endif; ?>
<?php if ($public): ?></div><?php endif; ?>
