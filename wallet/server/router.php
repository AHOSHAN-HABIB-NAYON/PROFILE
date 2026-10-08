<?php
// Router for PHP's built-in server (php -S localhost:8080 router.php), mirroring .htaccess.
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($path === '/.well-known/assetlinks.json' || str_starts_with($path, '/api/')) {
    $_GET['route'] = $path === '/.well-known/assetlinks.json' ? $path : substr($path, 4);
    require __DIR__ . '/api.php';
    return true;
}
if (preg_match('#^/(app|database|tests)/|^/config#', $path)) {
    http_response_code(403);
    return true;
}
return false;
