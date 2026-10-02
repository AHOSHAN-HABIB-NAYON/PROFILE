<?php
/**
 * Front controller. Every customer/admin URL is routed here by .htaccess (no .php URLs are customer-facing).
 */
// Friendly message instead of a blank page on old PHP versions (this check must stay PHP 5 compatible).
if (PHP_VERSION_ID < 80100) {
    http_response_code(500);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div style="font-family:sans-serif;max-width:440px;margin:60px auto;padding:20px;border:1px solid #ddd;border-radius:12px;text-align:center">'
        . '<h2>PHP ভার্সন আপডেট করুন</h2><p>এই শপ চালাতে PHP 8.1 বা নতুন ভার্সন প্রয়োজন। আপনার সার্ভারে আছে PHP ' . htmlspecialchars(PHP_VERSION) . '।</p>'
        . '<p>hPanel/cPanel → PHP Configuration / Select PHP Version থেকে 8.2 বা 8.3 নির্বাচন করুন।</p></div>';
    exit;
}

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
