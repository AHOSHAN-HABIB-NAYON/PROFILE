<?php /** @var int $range @var array $series @var array $totals @var array $pages @var array $refs @var array $devices @var array $browsers @var array $os @var array $countries @var array $bd @var array $cities @var array $services @var array $hours @var bool $geo */
$bars = function (array $rows, callable $label) {
    if (!$rows) return '<div class="empty-sm">' . e(t('common.empty')) . '</div>';
    $max = max(1, ...array_column($rows, 'c'));
    $h = '';
    foreach ($rows as $r) $h .= '<div class="bar-row"><span class="truncate">' . $label($r) . '</span><span class="bar"><i style="width:' . round($r['c'] / $max * 100) . '%"></i></span><b>' . num($r['c']) . '</b></div>';
    return $h;
};
$hourly = array_fill(0, 24, 0);
foreach ($hours as $h) $hourly[(int)$h['h']] = (int)$h['c'];
?>
<div class="admin-head">
    <div><h1><i class="fa-solid fa-chart-line text-primary"></i> <?= e(t('admin.analytics')) ?></h1><p class="muted small mb-0"><?= e(t('admin.privacy_note')) ?></p></div>
    <nav class="chips mb-0"><?php foreach ([7, 30, 90, 365] as $d): ?><a class="chip<?= $range === $d ? ' active' : '' ?>" href="<?= e(url('/admin/analytics?days=' . $d)) ?>"><?= num($d) ?> <?= e(t('js.days')) ?></a><?php endforeach; ?></nav>
</div>
<div class="stat-grid stat-grid-3">
    <div class="stat"><span class="label"><i class="fa-solid fa-eye"></i> <?= e(t('admin.page_views')) ?></span><span class="value"><?= num($totals['views']) ?></span></div>
    <div class="stat"><span class="label"><i class="fa-solid fa-user-check"></i> <?= e(t('admin.unique_visitors')) ?></span><span class="value"><?= num($totals['uniques']) ?></span></div>
    <div class="stat"><span class="label"><i class="fa-solid fa-file"></i> <?= e(t('admin.pages')) ?></span><span class="value"><?= num($totals['pages']) ?></span></div>
</div>
<section class="card mt-2">
    <h2 class="card-title mb-1"><?= e(t('admin.traffic')) ?></h2>
    <div class="chart" data-component="chart" data-type="area" data-series='<?= e(json_encode(['labels' => array_column($series, 'label'), 'sets' => [['name' => t('admin.page_views'), 'data' => array_column($series, 'views')], ['name' => t('admin.unique_visitors'), 'data' => array_column($series, 'uniques')], ['name' => t('admin.signups'), 'data' => array_column($series, 'signups')]]])) ?>'></div>
</section>
<div class="admin-grid mt-2">
    <section class="card"><h2 class="card-title mb-1"><?= e(t('admin.top_pages')) ?></h2><?= $bars($pages, fn($r) => e($r['k'])) ?></section>
    <section class="card"><h2 class="card-title mb-1"><?= e(t('admin.top_services')) ?></h2><?= $bars($services, fn($r) => e($r['title'])) ?></section>
    <section class="card"><h2 class="card-title mb-1"><?= e(t('admin.referrers')) ?></h2><?= $bars($refs, fn($r) => e($r['k'])) ?></section>
    <section class="card"><h2 class="card-title mb-1"><?= e(t('admin.countries')) ?></h2><?= $bars($countries, fn($r) => country_flag($r['k'] === '??' ? null : $r['k']) . ' ' . e($r['k'] === '??' ? t('admin.unknown') : $r['k'])) ?></section>
    <section class="card"><h2 class="card-title mb-1">🇧🇩 <?= e(t('admin.bd_divisions')) ?></h2><?= $geo ? $bars($bd, fn($r) => e($r['k'])) : '<p class="xs muted">' . e(t('admin.geo_off')) . '</p>' ?></section>
    <section class="card"><h2 class="card-title mb-1"><?= e(t('admin.cities')) ?></h2><?= $geo ? $bars($cities, fn($r) => e($r['k'])) : '<p class="xs muted">' . e(t('admin.geo_off')) . '</p>' ?></section>
    <section class="card"><h2 class="card-title mb-1"><?= e(t('admin.devices')) ?></h2><?= $bars($devices, fn($r) => '<i class="fa-solid fa-' . ($r['k'] === 'mobile' ? 'mobile-screen' : ($r['k'] === 'tablet' ? 'tablet-screen-button' : 'desktop')) . '"></i> ' . e(ucfirst((string)$r['k']))) ?></section>
    <section class="card"><h2 class="card-title mb-1"><?= e(t('admin.browsers')) ?></h2><?= $bars($browsers, fn($r) => e($r['k'])) ?></section>
    <section class="card"><h2 class="card-title mb-1"><?= e(t('admin.os')) ?></h2><?= $bars($os, fn($r) => e($r['k'])) ?></section>
    <section class="card"><h2 class="card-title mb-1"><?= e(t('admin.by_hour')) ?></h2>
        <div class="chart chart-sm" data-component="chart" data-type="bars" data-series='<?= e(json_encode(['labels' => array_map(fn($h) => sprintf('%02d', $h), range(0, 23)), 'sets' => [['name' => t('admin.page_views'), 'data' => $hourly]]])) ?>'></div></section>
</div>
