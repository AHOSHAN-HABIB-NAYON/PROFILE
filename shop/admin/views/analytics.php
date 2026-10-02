<?php
$funnel = [
    ['ভিজিটর', $visitors], ['পেজ ভিউ', (int) ($ev['page_view'] ?? 0)], ['প্রোডাক্ট ভিউ', (int) ($ev['product_view'] ?? 0)],
    ['প্রোডাক্ট ক্লিক', (int) ($ev['product_click'] ?? 0)], ['কার্টে যোগ', (int) ($ev['add_to_cart'] ?? 0)],
    ['চেকআউট', (int) ($ev['checkout'] ?? 0)], ['অর্ডার', $orders],
];
$metaLabels = ['success' => ['সফল', 'pill-green'], 'error' => ['ত্রুটি', 'pill-red'], 'not_configured' => ['কনফিগার করা হয়নি', '']];
[$mLabel, $mClass] = $metaLabels[$metaStatus] ?? $metaLabels['not_configured'];
?>
<div class="page-a" data-page="analytics">
  <div class="tabs-scroll">
    <?php foreach ([1 => 'আজ', 7 => '৭ দিন', 30 => '৩০ দিন', 90 => '৯০ দিন'] as $d => $l): ?><a href="/admin/analytics?days=<?= $d ?>" class="chip<?= $days === $d ? ' active' : '' ?>"><?= $l ?></a><?php endforeach; ?>
  </div>
  <div class="stat-grid">
    <?php foreach ($funnel as [$l, $n]): ?><div class="stat c-blue"><span class="stat-v"><?= bn_num($n) ?></span><span class="stat-l"><?= $l ?></span></div><?php endforeach; ?>
    <div class="stat c-green"><span class="stat-v"><?= bn_num($conversion) ?>%</span><span class="stat-l">কনভার্শন রেট</span></div>
    <div class="stat c-indigo"><span class="stat-v"><?= money($revenue) ?></span><span class="stat-l">বিক্রি</span></div>
    <div class="stat c-cyan"><span class="stat-v"><?= bn_num($newVisitors) ?></span><span class="stat-l">নতুন ভিজিটর</span></div>
  </div>

  <div class="grid-2 mt-16">
    <section class="card"><h3 class="card-title">দৈনিক ট্রাফিক</h3>
      <?php if ($daily): ?><div class="chart" data-chart='<?= e(json_encode(['type' => 'line', 'labels' => array_map(static fn ($d) => date('d/m', strtotime($d['d'])), $daily), 'values' => array_map(static fn ($d) => (int) $d['views'], $daily), 'values2' => array_map(static fn ($d) => (int) $d['visitors'], $daily), 'legend' => ['পেজ ভিউ', 'ভিজিটর']], JSON_UNESCAPED_UNICODE)) ?>'></div>
      <?php else: ?><p class="small muted">এই সময়ে কোনো ট্রাফিক নেই।</p><?php endif; ?></section>
    <section class="card"><h3 class="card-title">কনভার্শন ফানেল</h3>
      <?php View::partial('admin/views/partials/bars', ['rows' => array_map(static fn ($f) => ['label' => $f[0], 'n' => $f[1]], array_slice($funnel, 1))]); ?></section>
    <section class="card"><h3 class="card-title">ডিভাইস</h3><?php View::partial('admin/views/partials/bars', ['rows' => $devices]); ?></section>
    <section class="card"><h3 class="card-title">ব্রাউজার</h3><?php View::partial('admin/views/partials/bars', ['rows' => $browsers]); ?></section>
    <section class="card"><h3 class="card-title">অপারেটিং সিস্টেম</h3><?php View::partial('admin/views/partials/bars', ['rows' => $oses]); ?></section>
    <section class="card"><h3 class="card-title">ট্রাফিক সোর্স</h3><?php View::partial('admin/views/partials/bars', ['rows' => $sources]); ?></section>
    <section class="card"><h3 class="card-title">লোকেশন (অর্ডারের জেলা)</h3><?php View::partial('admin/views/partials/bars', ['rows' => $districts]); ?>
      <?php if ($locations): ?><p class="small strong mt-12">IP-ভিত্তিক আনুমানিক শহর</p><?php View::partial('admin/views/partials/bars', ['rows' => array_map(static fn ($l) => ['label' => trim(($l['city'] ?? '') . ', ' . ($l['region'] ?? ''), ', '), 'n' => $l['n']], $locations)]); ?><?php endif; ?>
      <?php $cc = array_filter($countries, static fn ($c) => $c['label'] !== 'অজানা'); if ($cc): ?><p class="small strong mt-12">দেশ (CDN হেডার)</p><?php View::partial('admin/views/partials/bars', ['rows' => $cc]); ?><?php endif; ?>
    </section>
    <section class="card"><h3 class="card-title">ট্র্যাকিং স্ট্যাটাস</h3>
      <dl class="spec">
        <div><dt>Meta Pixel / CAPI</dt><dd><span class="pill <?= $mClass ?>"><?= $mLabel ?></span><?php if ($metaMessage): ?><br><span class="tiny muted"><?= e($metaMessage) ?></span><?php endif; ?></dd></div>
        <div><dt>Google Tag</dt><dd><span class="pill <?= $gtagOn ? 'pill-green' : '' ?>"><?= $gtagOn ? 'চালু' : 'কনফিগার করা হয়নি' ?></span></dd></div>
        <div><dt>অভ্যন্তরীণ অ্যানালিটিক্স</dt><dd><span class="pill <?= Settings::on('analytics_enabled') ? 'pill-green' : '' ?>"><?= Settings::on('analytics_enabled') ? 'চালু' : 'বন্ধ' ?></span></dd></div>
      </dl>
      <a href="/admin/settings#tracking" class="btn btn-soft btn-sm mt-8">ট্র্যাকিং সেটিংস</a>
    </section>
  </div>
  <section class="card mt-16"><h3 class="card-title">পণ্যের পারফরম্যান্স</h3>
    <?php if ($topProducts): ?>
    <div class="table-wrap"><table class="table compact"><thead><tr><th>পণ্য</th><th>ভিউ</th><th>ক্লিক</th><th>কার্টে যোগ</th></tr></thead><tbody>
      <?php foreach ($topProducts as $t): ?><tr><td data-label="পণ্য"><?= e($t['name']) ?></td><td data-label="ভিউ"><?= bn_num($t['views']) ?></td><td data-label="ক্লিক"><?= bn_num($t['clicks']) ?></td><td data-label="কার্ট"><?= bn_num($t['carts']) ?></td></tr><?php endforeach; ?>
    </tbody></table></div>
    <?php else: ?><p class="small muted">ডেটা নেই।</p><?php endif; ?>
  </section>
</div>
