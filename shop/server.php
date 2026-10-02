<?php
// Development router for `php -S localhost:8000 server.php` (mimics .htaccess). Not used on Apache.
$uri = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/');
$file = __DIR__ . $uri;
if ($uri !== '/' && is_file($file) && preg_match('#^/(assets|uploads)/#', $uri) && !preg_match('/\.php$/i', $uri)) {
    return false;
}
if (preg_match('#^/(config|core|controllers|models|services|routes|views|storage|database|pwa)(/|$)|/\.#', $uri)) {
    http_response_code(403);
    exit('Forbidden');
}
require __DIR__ . '/index.php';
