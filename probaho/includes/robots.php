<?php
header('Content-Type: text/plain; charset=utf-8');
echo "User-agent: *\n";
foreach (['/v2admin', '/api/', '/dashboard', '/wallet', '/transactions', '/transaction/', '/profile', '/settings', '/notifications', '/payment/', '/qr', '/report', '/install'] as $p) {
    echo 'Disallow: ' . url($p) . "\n";
}
echo "\nSitemap: " . abs_url('/sitemap.xml') . "\n";
