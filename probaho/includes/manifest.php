<?php
/** Dynamic Web App Manifest built from Admin → PWA settings. */
$icon = (string) setting('pwa_icon');
$icons = $icon !== ''
    ? [['src' => upload_url($icon), 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'any']]
    : [
        ['src' => url('assets/icons/icon-192.png'), 'sizes' => '192x192', 'type' => 'image/png', 'purpose' => 'any'],
        ['src' => url('assets/icons/icon-512.png'), 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'any'],
        ['src' => url('assets/icons/maskable-512.png'), 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'maskable'],
    ];
$manifest = [
    'id' => url('/'),
    'name' => (string) setting('pwa_app_name', setting('site_name')),
    'short_name' => (string) setting('pwa_short_name', setting('site_name')),
    'description' => (string) setting('pwa_description'),
    'lang' => 'bn',
    'dir' => 'ltr',
    'start_url' => url('/dashboard') . '?source=pwa',
    'scope' => url('/'),
    'display' => 'standalone',
    'display_override' => ['standalone', 'minimal-ui'],
    'orientation' => 'portrait',
    'theme_color' => (string) setting('theme_color', '#5b4bff'),
    'background_color' => (string) setting('pwa_background_color', '#ffffff'),
    'categories' => ['finance', 'business', 'utilities'],
    'icons' => $icons,
    'shortcuts' => [
        ['name' => 'QR পেমেন্ট', 'url' => url('/qr'), 'icons' => [['src' => url('assets/icons/icon-192.png'), 'sizes' => '192x192']]],
        ['name' => 'ওয়ালেট', 'url' => url('/wallet'), 'icons' => [['src' => url('assets/icons/icon-192.png'), 'sizes' => '192x192']]],
        ['name' => 'Binance Pay', 'url' => url('/payment/binance-pay'), 'icons' => [['src' => url('assets/icons/icon-192.png'), 'sizes' => '192x192']]],
    ],
];
header('Content-Type: application/manifest+json; charset=utf-8');
header('Cache-Control: public, max-age=3600');
echo json_encode($manifest, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
