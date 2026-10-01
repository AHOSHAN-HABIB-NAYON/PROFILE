<?php
/** XML sitemap of public pages, services and products. */
header('Content-Type: application/xml; charset=utf-8');
$urls = [['/', date('Y-m-d'), '1.0'], ['/services', null, '0.8'], ['/products', null, '0.8'], ['/support', null, '0.6'], ['/faq', null, '0.6'],
    ['/about', null, '0.5'], ['/contact', null, '0.5'], ['/privacy', null, '0.3'], ['/terms', null, '0.3'], ['/register', null, '0.5'], ['/login', null, '0.4']];
foreach (db()->all('SELECT slug, updated_at FROM services WHERE is_active = 1') as $s) {
    $urls[] = ['/services/' . $s['slug'], substr((string) $s['updated_at'], 0, 10), '0.6'];
}
foreach (db()->all("SELECT slug, updated_at FROM products WHERE status = 'published'") as $p) {
    $urls[] = ['/products/' . $p['slug'], substr((string) $p['updated_at'], 0, 10), '0.7'];
}
echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
foreach ($urls as [$loc, $mod, $prio]) {
    echo '  <url><loc>' . e(abs_url($loc)) . '</loc>' . ($mod ? '<lastmod>' . e($mod) . '</lastmod>' : '') . '<priority>' . $prio . "</priority></url>\n";
}
echo "</urlset>\n";
