<?php
// Router for PHP's built-in development server only:  php -S 127.0.0.1:8080 -t public public/router.php
if (PHP_SAPI !== 'cli-server') { http_response_code(404); exit; }
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($path !== '/' && is_file(__DIR__ . $path) && !str_ends_with($path, '.php')) {
    return false;
}
require __DIR__ . '/index.php';
