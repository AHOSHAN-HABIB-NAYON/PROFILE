<?php /** @var array $r @var string $phone */ $c = $r['courier']; ?>
<div class="fraud-box risk-bg-<?= e($r['risk']) ?>">
  <div class="fraud-head">
    <span class="risk r-<?= e($r['risk']) ?> lg"><i class="fa fa-shield"></i> <?= e($r['risk_label']) ?></span>
    <span class="small muted"><?= e($phone) ?><?= $r['cached'] ? ' · ক্যাশড ফলাফল' : '' ?></span>
  </div>
  <p class="small"><?= e($r['reason']) ?></p>
  <?php if ($r['courier_error']): ?><p class="small alert alert-warn"><?= e($r['courier_error']) ?></p><?php endif; ?>
  <?php if ($c): ?>
  <div class="mini-stats">
    <div><b><?= bn_num($c['total']) ?></b><span>মোট</span></div>
    <div class="ok"><b><?= bn_num($c['delivered']) ?></b><span>ডেলিভারড</span></div>
    <div class="bad"><b><?= bn_num($c['cancelled']) ?></b><span>বাতিল</span></div>
    <div><b><?= bn_num($c['returned']) ?></b><span>রিটার্ন</span></div>
    <div><b><?= bn_num($c['success_rate']) ?>%</b><span>সফলতা</span></div>
  </div>
  <?php if (!empty($c['couriers'])): ?>
  <p class="small strong mt-12 mb-8">Courier History</p>
  <div class="courier-cards">
    <?php foreach ($c['couriers'] as $row): $rate = (float) $row['success_rate']; ?>
      <div class="cc">
        <div class="cc-head"><b><?= e($row['name']) ?></b><span class="cc-rate <?= $row['total'] === 0 ? '' : ($rate >= 70 ? 'good' : ($rate >= 40 ? 'mid' : 'bad')) ?>"><?= $row['total'] ? bn_num($rate) . '%' : '—' ?></span></div>
        <div class="cc-bar"><span style="width:<?= $row['total'] ? max(3, min(100, $rate)) : 0 ?>%"></span></div>
        <div class="cc-nums"><span>মোট <b><?= bn_num($row['total']) ?></b></span><span class="ok">সফল <b><?= bn_num($row['delivered']) ?></b></span><span class="bad">বাতিল <b><?= bn_num($row['cancelled']) ?></b></span><?php if ($row['returned']): ?><span>রিটার্ন <b><?= bn_num($row['returned']) ?></b></span><?php endif; ?></div>
      </div>
    <?php endforeach; ?>
  </div>
  <?php endif; ?>
  <?php endif; ?>
  <p class="small muted mt-8">এই শপে: মোট <?= bn_num($r['local']['total']) ?>, ডেলিভারড <?= bn_num($r['local']['delivered']) ?>, বাতিল <?= bn_num($r['local']['cancelled']) ?>, রিটার্ন <?= bn_num($r['local']['returned']) ?></p>
  <p class="tiny muted">এটি শুধুমাত্র ডেলিভারি পরিসংখ্যানের সারাংশ — কোনো অভিযোগ নয়। সিদ্ধান্তের আগে কাস্টমারকে কল করে নিশ্চিত হোন।</p>
</div>
