<?php
/** Admin: privacy-conscious visitor analytics. */
defined('APP') || exit;
require_once ROOT . '/core/analytics.php';
require_once ROOT . '/admin/_charts.php';
meta(['title' => 'Analytics']);

$ranges = ['today' => ['Today', 'CURDATE()', 24], 'week' => ['7 days', 'NOW() - INTERVAL 7 DAY', 7], 'month' => ['30 days', 'NOW() - INTERVAL 30 DAY', 30], 'year' => ['12 months', 'NOW() - INTERVAL 365 DAY', 12]];
$range = isset($ranges[input('range')]) ? input('range') : 'week';
[$rLabel, $since] = $ranges[$range];

$k = row("SELECT COUNT(*) views, COUNT(DISTINCT visitor_id) uniques FROM page_views WHERE created_at >= $since");
$returning = (int)val("SELECT COUNT(*) FROM analytics WHERE last_seen >= $since AND first_seen < $since");
$newVisitors = (int)val("SELECT COUNT(*) FROM analytics WHERE first_seen >= $since");
$online = online_count();

// time series
if ($range === 'today') {
    $raw = array_column(rows("SELECT HOUR(created_at) h, COUNT(*) c FROM page_views WHERE created_at >= CURDATE() GROUP BY HOUR(created_at)"), 'c', 'h');
    $series = []; for ($h = 0; $h < 24; $h++) $series[] = [sprintf('%02d', $h), (int)($raw[$h] ?? 0)];
} elseif ($range === 'year') {
    $raw = array_column(rows("SELECT DATE_FORMAT(created_at, '%Y-%m') m, COUNT(*) c FROM page_views WHERE created_at >= $since GROUP BY m"), 'c', 'm');
    $series = []; for ($i = 11; $i >= 0; $i--) { $m = date('Y-m', strtotime("first day of -$i month")); $series[] = [date('M', strtotime($m . '-01')), (int)($raw[$m] ?? 0)]; }
} else {
    $n = $range === 'week' ? 7 : 30;
    $raw = array_column(rows("SELECT DATE(created_at) d, COUNT(*) c FROM page_views WHERE created_at >= CURDATE() - INTERVAL " . ($n - 1) . " DAY GROUP BY d"), 'c', 'd');
    $series = []; for ($i = $n - 1; $i >= 0; $i--) { $d = date('Y-m-d', strtotime("-$i day")); $series[] = [date('M j', strtotime($d)), (int)($raw[$d] ?? 0)]; }
}
$top = fn(string $col, int $limit = 8, string $extraWhere = '') => array_map(fn($r) => [$r['k'] ?: 'Unknown', (int)$r['c']],
    rows("SELECT $col AS k, COUNT(*) c FROM page_views WHERE created_at >= $since $extraWhere GROUP BY k ORDER BY c DESC LIMIT $limit"));
$topPages = $top('path');
$sources = array_map(fn($r) => [$r[0] === 'Unknown' ? 'Direct' : $r[0], $r[1]], $top('source'));
$devices = $top('device', 4);
$visitorTop = fn(string $col, string $extra = '') => rows("SELECT $col AS k, COUNT(*) c FROM analytics WHERE last_seen >= $since $extra GROUP BY k ORDER BY c DESC LIMIT 8");
$browsers = array_map(fn($r) => [$r['k'] ?: 'Unknown', (int)$r['c']], $visitorTop('browser'));
$oses = array_map(fn($r) => [$r['k'] ?: 'Unknown', (int)$r['c']], $visitorTop('os'));
$countries = array_map(fn($r) => [$r['k'] ?: '—', (int)$r['c'], country_flag($r['k']) . ' '], $visitorTop('country'));
$divisions = array_map(fn($r) => [$r['k'] ?: 'Unknown', (int)$r['c']], $visitorTop('region', "AND country = 'BD'"));
$cities = array_map(fn($r) => [$r['k'] ?: 'Unknown', (int)$r['c']], $visitorTop('city'));
$topServices = array_map(fn($r) => [$r['t'], (int)$r['c']], rows("SELECT s.title_en t, COUNT(*) c FROM page_views v JOIN services s ON s.id = v.ref_id WHERE v.page_type = 'service' AND v.created_at >= $since GROUP BY s.id ORDER BY c DESC LIMIT 8"));
$topProducts = array_map(fn($r) => [$r['name_en'], (int)$r['views']], rows('SELECT name_en, views FROM products ORDER BY views DESC LIMIT 6'));
$topNews = array_map(fn($r) => [$r['t'], (int)$r['c']], rows("SELECT COALESCE(NULLIF(n.title_en,''), n.title_bn) t, COUNT(*) c FROM page_views v JOIN news n ON n.id = v.ref_id WHERE v.page_type = 'news' AND v.created_at >= $since GROUP BY n.id ORDER BY c DESC LIMIT 8"));
$hasGeo = (bool)val('SELECT 1 FROM analytics WHERE country IS NOT NULL LIMIT 1');
?>
<div class="page">
  <div class="adm-title"><h1>Analytics</h1>
    <nav class="seg"><?php foreach ($ranges as $key => [$label]): ?><a class="<?= $range === $key ? 'active' : '' ?>" style="padding:5px 10px;border-radius:8px;font-size:.78rem;font-weight:600;color:<?= $range === $key ? 'var(--primary)' : 'var(--muted)' ?>;<?= $range === $key ? 'background:var(--card)' : '' ?>" href="<?= e(url('/admin/analytics?range=' . $key)) ?>"><?= $label ?></a><?php endforeach ?></nav></div>
  <?php if (!setting_bool('analytics.enabled')): ?><div class="alert warning mb-2"><i class="fa-solid fa-circle-info"></i>Analytics collection is disabled in Settings → Analytics.</div><?php endif ?>
  <div class="stat-grid mb-2">
    <?php foreach ([['Page views', $k['views'], 'fa-eye', 'accent'], ['Unique visitors', $k['uniques'], 'fa-fingerprint', 'secondary'], ['New visitors', $newVisitors, 'fa-user-plus', 'success'], ['Returning visitors', $returning, 'fa-rotate', ''], ['Online now', $online, 'fa-signal', 'success'], ['Views / visitor', $k['uniques'] ? round($k['views'] / $k['uniques'], 1) : 0, 'fa-layer-group', '']] as [$l, $v, $i, $t]): ?>
      <div class="card stat-card"><span class="icon-box sm <?= $t ?>"><i class="fa-solid <?= $i ?>"></i></span><div><div class="v"><?= is_float($v) ? $v : number_format((int)$v) ?></div><div class="l"><?= $l ?> · <?= $rLabel ?></div></div></div>
    <?php endforeach ?>
  </div>
  <section class="card card-pad-lg mb-2"><h2 style="font-size:1rem">Page views · <?= $rLabel ?></h2><?= chart_bars($series, 'Page views') ?></section>
  <div class="grid-2">
    <section class="card card-pad-lg"><h2 style="font-size:1rem">Top pages</h2><?= chart_hbars($topPages) ?></section>
    <section class="card card-pad-lg"><h2 style="font-size:1rem">Traffic sources</h2><?= chart_hbars($sources) ?></section>
    <section class="card card-pad-lg"><h2 style="font-size:1rem">Top services</h2><?= chart_hbars($topServices) ?></section>
    <section class="card card-pad-lg"><h2 style="font-size:1rem">Top news</h2><?= chart_hbars($topNews) ?></section>
    <section class="card card-pad-lg"><h2 style="font-size:1rem">Most viewed products (all time)</h2><?= chart_hbars($topProducts) ?></section>
    <section class="card card-pad-lg"><h2 style="font-size:1rem">Devices</h2><?= chart_hbars($devices) ?></section>
    <section class="card card-pad-lg"><h2 style="font-size:1rem">Browsers</h2><?= chart_hbars($browsers) ?></section>
    <section class="card card-pad-lg"><h2 style="font-size:1rem">Operating systems</h2><?= chart_hbars($oses) ?></section>
    <section class="card card-pad-lg"><h2 style="font-size:1rem">Countries</h2><?= chart_hbars($countries, $hasGeo ? 'No data yet' : 'No location data — put the site behind Cloudflare (country headers) or enable geo lookup in Settings → Analytics.') ?></section>
    <section class="card card-pad-lg"><h2 style="font-size:1rem">Bangladesh divisions</h2><?= chart_hbars($divisions, 'No division data yet (needs Cloudflare region headers or geo lookup).') ?></section>
    <section class="card card-pad-lg"><h2 style="font-size:1rem">Cities</h2><?= chart_hbars($cities) ?></section>
  </div>
  <p class="tiny muted mt-2"><i class="fa-solid fa-user-shield"></i> Privacy: visitors are identified by a random first-party cookie (stored hashed); no IP addresses are stored in analytics; bots are ignored.</p>
</div>
