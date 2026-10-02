<?php
/**
 * Front controller. Every customer/admin URL is routed here by .htaccess (no .php URLs are customer-facing).
 */
require __DIR__ . '/core/bootstrap.php';

ob_start();
Response::securityHeaders();
$path = Request::path();

if (!Config::get('installed')) {
    Session::start();
    if ($path === '/install') {
        (new InstallController())->handle();
    } else {
        header('Location: /install', true, 302);
    }
    exit;
}

Session::start();
$router = new Router();
require BASE_PATH . '/routes/web.php';
require BASE_PATH . '/routes/api.php';
require BASE_PATH . '/routes/admin.php';

$isAdminArea = str_starts_with($path, '/admin');
$isSystem = in_array($path, ['/sw.js', '/manifest.json', '/robots.txt', '/sitemap.xml', '/offline'], true);

// Maintenance mode: customers see a friendly screen; logged-in admins keep full access.
if (!$isAdminArea && !$isSystem && Settings::on('maintenance') && !Auth::check()) {
    http_response_code(503);
    header('Retry-After: 3600');
    if (Request::wantsJson()) {
        Response::fail((string) setting('maintenance_message'), [], 503);
    }
    echo View::render('pages/maintenance');
    exit;
}

if (Request::method() === 'POST' && $path !== '/install') {
    Csrf::verify();
}

RateLimiter::gc();
$router->dispatch(Request::method(), $path);

// Send the response now and run slow integrations (Meta CAPI, fraud check) afterwards.
if (Deferred::has()) {
    if (!function_exists('fastcgi_finish_request') && !function_exists('litespeed_finish_request') && !headers_sent()) {
        header('Connection: close');
        header('Content-Length: ' . ob_get_length());
    }
    ob_end_flush();
    flush();
    Deferred::run();
}
