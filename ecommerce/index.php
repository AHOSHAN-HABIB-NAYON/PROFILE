<?php
/**
 * Front controller — every public URL is routed here by .htaccess.
 */

require __DIR__ . '/app/bootstrap.php';

// Local development: `php -S localhost:8000 index.php` (mirrors the .htaccess rewrites).
if (PHP_SAPI === 'cli-server') {
    $devPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $static = match (true) {
        str_starts_with($devPath, '/assets/')  => __DIR__ . '/public' . $devPath,
        str_starts_with($devPath, '/uploads/') => __DIR__ . '/public' . $devPath,
        str_starts_with($devPath, '/admin/assets/'), $devPath === '/sw.js' => __DIR__ . $devPath,
        default => null,
    };
    if ($static !== null) {
        $real = realpath($static);
        if ($real && str_starts_with($real, __DIR__) && is_file($real) && !preg_match('/\.php\d?$/i', $real)) {
            $types = ['css' => 'text/css', 'js' => 'application/javascript', 'svg' => 'image/svg+xml', 'webp' => 'image/webp',
                'png' => 'image/png', 'jpg' => 'image/jpeg', 'gif' => 'image/gif', 'ico' => 'image/x-icon', 'json' => 'application/json', 'woff2' => 'font/woff2'];
            header('Content-Type: ' . ($types[strtolower(pathinfo($real, PATHINFO_EXTENSION))] ?? 'application/octet-stream'));
            header('Cache-Control: public, max-age=31536000, immutable');
            readfile($real);
            return true;
        }
        http_response_code(404);
        return true;
    }
}

$request = Request::current();
SecurityHeaders::send($request);

$router = new Router();
require APP_PATH . '/config/routes.php';
require ROOT_PATH . '/api/routes.php';
require ADMIN_PATH . '/routes.php';

try {
    if ($request->method === 'POST' && empty($_POST) && empty($_FILES) && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0
        && !str_contains((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) {
        // Body larger than post_max_size: PHP silently dropped it.
        throw new HttpException(413, 'ফাইল/ডেটার আকার অনেক বড়। ছোট ফাইল দিয়ে আবার চেষ্টা করুন।');
    }
    $response = Maintenance::check($request) ?? $router->dispatch($request);
} catch (HttpException $e) {
    $isPage = $request->method === 'GET' && !str_starts_with($request->path, '/api/') && (!$request->expectsJson() || $request->isSpa());
    if (!$isPage) {
        throw $e;
    }
    $layout = str_starts_with($request->path, '/admin') && AdminAuth::user() ? 'admin' : 'store';
    $response = View::page($layout === 'admin' ? 'admin:pages/error' : 'pages/error', [
        'status' => $e->getStatus(), 'message' => $e->getMessage(),
    ], ['title' => $e->getStatus() === 404 ? 'পেজটি পাওয়া যায়নি' : 'সমস্যা হয়েছে', 'status' => $e->getStatus(), 'robots' => 'noindex', 'cacheable' => false], $layout);
}

$response->send();
Deferred::run();
