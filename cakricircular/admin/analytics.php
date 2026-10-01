<?php
/* ================= অ্যানালিটিকস ================= */
admin_start('অ্যানালিটিকস');
need('analytics');

$days = (int)($_GET['days'] ?? 30);
if (!in_array($days, [7, 30, 90, 365], true)) $days = 30;

$uniqTotal = (int)col("SELECT COUNT(*) FROM visitors");
$uniqRange = (int)col("SELECT COUNT(DISTINCT vid) FROM visits WHERE day >= DATE_SUB(CURDATE(), INTERVAL ? DAY)", [$days]);
$pvRange   = (int)col("SELECT COUNT(*) FROM visits WHERE day >= DATE_SUB(CURDATE(), INTERVAL ? DAY)", [$days]);
$pvTotal   = (int)col("SELECT COUNT(*) FROM visits");
$today     = (int)col("SELECT COUNT(DISTINCT vid) FROM visits WHERE day = CURDATE()");

$daily = all("SELECT day, COUNT(*) AS pv, COUNT(DISTINCT vid) AS uv FROM visits
              WHERE day >= DATE_SUB(CURDATE(), INTERVAL ? DAY) GROUP BY day ORDER BY day DESC LIMIT 14", [$days]);
$topPages = all("SELECT path, COUNT(*) AS n FROM visits
                 WHERE day >= DATE_SUB(CURDATE(), INTERVAL ? DAY) GROUP BY path ORDER BY n DESC LIMIT 15", [$days]);
$regions  = all("SELECT COALESCE(NULLIF(region,''),'অজানা') AS r, country, COUNT(*) AS n
                 FROM visitors GROUP BY r, country ORDER BY n DESC LIMIT 15");
$devices  = all("SELECT COALESCE(NULLIF(device,''),'unknown') AS d, COUNT(*) AS n FROM visitors GROUP BY d ORDER BY n DESC");
$topPosts = all("SELECT p.title, p.slug, COUNT(v.vid) AS n FROM post_views v
                 JOIN posts p ON p.id = v.post_id
                 WHERE v.day >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
                 GROUP BY p.id ORDER BY n DESC LIMIT 12", [$days]);
$topSearch = all("SELECT term, hits FROM searches ORDER BY hits DESC LIMIT 12");

$maxDaily = 1; foreach ($daily as $d) $maxDaily = max($maxDaily, (int)$d['pv']);
$devLabel = ['mobile' => 'মোবাইল', 'desktop' => 'কম্পিউটার', 'tablet' => 'ট্যাবলেট', 'unknown' => 'অজানা'];
show_flash();
?>
<div class="a-card" style="display:flex;gap:9px;flex-wrap:wrap;align-items:center">
  <b style="font-size:.9rem">সময়সীমা:</b>
  <?php foreach ([7 => '৭ দিন', 30 => '৩০ দিন', 90 => '৯০ দিন', 365 => '১ বছর'] as $k => $v): ?>
    <a class="btn sm <?= $days === $k ? '' : 'sec' ?>" href="<?= e(au('analytics?days=' . $k)) ?>"><?= e($v) ?></a>
  <?php endforeach; ?>
</div>

<div class="grid g4 stats" style="margin-bottom:16px">
  <div class="stat"><span class="si b"><i class="fa fa-users"></i></span>
    <span class="sx"><span class="sl">ইউনিক ভিজিটর (ডিভাইস)</span><b><?= bn($uniqTotal) ?></b><span>এই সময়ে <?= bn($uniqRange) ?></span></span></div>
  <div class="stat"><span class="si p"><i class="fa fa-eye"></i></span>
    <span class="sx"><span class="sl">মোট পেজ ভিউ</span><b><?= bn($pvTotal) ?></b><span>এই সময়ে <?= bn($pvRange) ?></span></span></div>
  <div class="stat"><span class="si g"><i class="fa fa-calendar-day"></i></span>
    <span class="sx"><span class="sl">আজকের ভিজিটর</span><b><?= bn($today) ?></b><span>ইউনিক</span></span></div>
  <div class="stat"><span class="si y"><i class="fa fa-signal"></i></span>
    <span class="sx"><span class="sl">এই সময়ে ভিউ</span><b><?= bn($pvRange) ?></b><span>গত <?= bn($days) ?> দিন</span></span></div>
</div>

<div class="a-card">
  <h2><i class="fa fa-chart-column"></i>দৈনিক ভিজিট (শেষ ১৪ দিন) · মোট পেজ ভিউ <?= bn($pvTotal) ?></h2>
  <div class="tbl-wrap"><table>
    <tr><th style="width:120px">তারিখ</th><th style="width:90px">ভিজিটর</th><th style="width:90px">পেজ ভিউ</th><th>গ্রাফ</th></tr>
    <?php foreach ($daily as $d): ?>
      <tr>
        <td><?= e(bn(date('d/m/Y', strtotime($d['day'])))) ?></td>
        <td><?= bn($d['uv']) ?></td>
        <td><?= bn($d['pv']) ?></td>
        <td><div class="bar"><i style="width:<?= (int)round($d['pv'] / $maxDaily * 100) ?>%"></i></div></td>
      </tr>
    <?php endforeach; ?>
    <?php if (!$daily): ?><tr><td colspan="4" style="text-align:center;color:var(--muted);padding:22px">এখনো ডেটা নেই।</td></tr><?php endif; ?>
  </table></div>
</div>

<div class="grid g2">
  <div class="a-card">
    <h2><i class="fa fa-file-lines"></i>সবচেয়ে বেশি দেখা পেজ</h2>
    <?php $mxP = $topPages ? max(array_map(fn($x) => (int)$x['n'], $topPages)) : 1; ?>
    <div class="plist-bar">
      <?php foreach ($topPages as $p): ?>
        <div class="pbar">
          <span class="fill" style="width:<?= (int)round($p['n'] / max(1, $mxP) * 100) ?>%"></span>
          <span class="nm"><?= e($p['path']) ?></span>
          <span class="vl"><?= bn($p['n']) ?></span>
        </div>
      <?php endforeach; ?>
      <?php if (!$topPages): ?><p class="hint" style="text-align:center;padding:14px">এখনো ডেটা নেই।</p><?php endif; ?>
    </div>
  </div>

  <div class="a-card">
    <h2><i class="fa fa-location-dot"></i>কোথা থেকে দেখছে</h2>
    <div class="tbl-wrap"><table>
      <tr><th>বিভাগ / অঞ্চল</th><th style="width:110px">দেশ</th><th style="width:70px">সংখ্যা</th></tr>
      <?php foreach ($regions as $r): ?>
        <tr><td><?= e($r['r']) ?></td><td><?= e($r['country'] ?: '—') ?></td><td><?= bn($r['n']) ?></td></tr>
      <?php endforeach; ?>
      <?php if (!$regions): ?><tr><td colspan="3" style="text-align:center;color:var(--muted);padding:22px">এখনো ডেটা নেই।</td></tr><?php endif; ?>
    </table></div>
    <p class="hint">লোকেশন পেতে সেটিংসে “লোকেশন সনাক্তকরণ” চালু থাকতে হবে।</p>
  </div>

  <div class="a-card">
    <h2><i class="fa fa-mobile-screen"></i>ডিভাইস</h2>
    <?php $mxD = $devices ? max(array_map(fn($x) => (int)$x['n'], $devices)) : 1; ?>
    <div class="plist-bar">
      <?php foreach ($devices as $d): ?>
        <div class="pbar">
          <span class="fill" style="width:<?= (int)round($d['n'] / max(1, $mxD) * 100) ?>%"></span>
          <span class="nm"><?= e($devLabel[$d['d']] ?? $d['d']) ?></span>
          <span class="vl"><?= bn($d['n']) ?></span>
        </div>
      <?php endforeach; ?>
    </div>
  </div>

  <div class="a-card">
    <h2><i class="fa fa-fire"></i>টপ পোস্ট (এই সময়ে)</h2>
    <div class="tbl-wrap"><table>
      <tr><th>শিরোনাম</th><th style="width:70px">ভিউ</th></tr>
      <?php foreach ($topPosts as $p): ?>
        <tr><td><a href="<?= e(url('post/' . $p['slug'])) ?>" target="_blank"><?= e($p['title']) ?></a></td><td><?= bn($p['n']) ?></td></tr>
      <?php endforeach; ?>
      <?php if (!$topPosts): ?><tr><td colspan="2" style="text-align:center;color:var(--muted);padding:22px">এখনো ডেটা নেই।</td></tr><?php endif; ?>
    </table></div>
  </div>

  <div class="a-card">
    <h2><i class="fa fa-magnifying-glass"></i>টপ সার্চ কিওয়ার্ড</h2>
    <div class="tbl-wrap"><table>
      <tr><th>কিওয়ার্ড</th><th style="width:80px">বার</th></tr>
      <?php foreach ($topSearch as $s): ?>
        <tr><td><?= e($s['term']) ?></td><td><?= bn($s['hits']) ?></td></tr>
      <?php endforeach; ?>
      <?php if (!$topSearch): ?><tr><td colspan="2" style="text-align:center;color:var(--muted);padding:22px">এখনো ডেটা নেই।</td></tr><?php endif; ?>
    </table></div>
  </div>
</div>
<?php admin_end(); ?>
