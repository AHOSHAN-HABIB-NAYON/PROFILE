<?php
/**
 * Front controller — every request (pages, SPA fragments, API, admin) enters here.
 * Clean URLs are provided by .htaccess (Apache/LiteSpeed) — no ".php" in URLs.
 */
declare(strict_types=1);

require __DIR__ . '/core/bootstrap.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = rawurldecode((string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH));
if (base_path() !== '' && str_starts_with($path, base_path())) {
    $path = substr($path, strlen(base_path()));
}
$path = '/' . trim($path, '/');
if ($path === '/index.php') {
    $path = '/';
}

// Not installed yet → web installer.
if (!config('installed')) {
    if ($path !== '/install') {
        header('Location: ' . url('/install'));
        exit;
    }
    require ROOT . '/includes/installer.php';
    exit;
}

$routes = [
    // Public
    'GET /'                         => ['page' => 'home', 'shell' => 'public', 'home' => true],
    'GET /login'                    => ['page' => 'login', 'shell' => 'public', 'guest' => true],
    'GET /register'                 => ['page' => 'register', 'shell' => 'public', 'guest' => true],
    'GET /forgot-password'          => ['page' => 'forgot', 'shell' => 'public', 'guest' => true],
    'GET /reset-password'           => ['page' => 'reset', 'shell' => 'public', 'guest' => true],
    'GET /two-factor'               => ['page' => 'two_factor', 'shell' => 'public', 'guest' => true],
    'GET /verify-email'             => ['page' => 'verify', 'shell' => 'auto'],
    'GET /services'                 => ['page' => 'services', 'shell' => 'auto', 'active' => 'services'],
    'GET /services/{slug}'          => ['page' => 'service', 'shell' => 'auto', 'active' => 'services'],
    'GET /products'                 => ['page' => 'products', 'shell' => 'auto', 'active' => 'products'],
    'GET /products/{slug}'          => ['page' => 'product', 'shell' => 'auto', 'active' => 'products'],
    'GET /support'                  => ['page' => 'support', 'shell' => 'auto', 'active' => 'support'],
    'GET /faq'                      => ['page' => 'faq', 'shell' => 'auto', 'active' => 'support'],
    'GET /privacy'                  => ['page' => 'page', 'shell' => 'auto', 'slug' => 'privacy'],
    'GET /terms'                    => ['page' => 'page', 'shell' => 'auto', 'slug' => 'terms'],
    'GET /about'                    => ['page' => 'page', 'shell' => 'auto', 'slug' => 'about'],
    'GET /contact'                  => ['page' => 'page', 'shell' => 'auto', 'slug' => 'contact'],
    'GET /offline'                  => ['page' => 'offline', 'shell' => 'public'],
    // App (login required)
    'GET /dashboard'                => ['page' => 'dashboard', 'shell' => 'app', 'auth' => true, 'active' => 'home'],
    'GET /wallet'                   => ['page' => 'wallet', 'shell' => 'app', 'auth' => true, 'active' => 'wallet'],
    'GET /wallet/deposit'           => ['page' => 'deposit', 'shell' => 'app', 'auth' => true, 'active' => 'wallet'],
    'GET /wallet/withdraw'          => ['page' => 'withdraw', 'shell' => 'app', 'auth' => true, 'active' => 'wallet'],
    'GET /wallet/transfer'          => ['page' => 'transfer', 'shell' => 'app', 'auth' => true, 'active' => 'wallet'],
    'GET /qr'                       => ['page' => 'qr', 'shell' => 'app', 'auth' => true, 'active' => 'qr'],
    'GET /qr/pay/{uid}'             => ['handler' => 'includes/qr_pay.php'],
    'GET /transactions'             => ['page' => 'transactions', 'shell' => 'app', 'auth' => true, 'active' => 'wallet'],
    'GET /transaction/{uid}'        => ['page' => 'transaction', 'shell' => 'app', 'auth' => true, 'active' => 'wallet'],
    'GET /notifications'            => ['page' => 'notifications', 'shell' => 'app', 'auth' => true, 'active' => 'home'],
    'GET /profile'                  => ['page' => 'profile', 'shell' => 'app', 'auth' => true, 'active' => 'profile'],
    'GET /settings'                 => ['page' => 'settings', 'shell' => 'app', 'auth' => true, 'active' => 'profile'],
    'GET /report'                   => ['page' => 'report', 'shell' => 'app', 'auth' => true, 'active' => 'support'],
    'GET /payment/binance-pay'      => ['page' => 'binance_pay', 'shell' => 'app', 'auth' => true, 'active' => 'wallet'],
    'POST /payment/binance-pay/webhook' => ['handler' => 'payment/binance-webhook.php'],
    'GET /payment/binance-pay/{trade}'  => ['page' => 'binance_order', 'shell' => 'app', 'auth' => true, 'active' => 'wallet'],
    // Auth handlers
    'GET /auth/google'              => ['handler' => 'auth/google.php'],
    'GET /auth/google/callback'     => ['handler' => 'auth/google.php'],
    // Machine-readable
    'GET /manifest.json'            => ['handler' => 'includes/manifest.php'],
    'GET /robots.txt'               => ['handler' => 'includes/robots.php'],
    'GET /sitemap.xml'              => ['handler' => 'includes/sitemap.php'],
    'ANY /api/{module}/{action}'    => ['api' => 'api'],
    // Admin panel
    'GET /v2admin'                  => ['admin' => 'dashboard'],
    'GET /v2admin/login'            => ['admin' => 'login'],
    'ANY /v2admin/api/{module}/{action}' => ['api' => 'v2admin/api'],
    'GET /v2admin/{section}'        => ['admin' => null],
    'GET /v2admin/{section}/{id}'   => ['admin' => null],
    'GET /install'                  => ['installed' => true],
];

[$route, $params] = Router::match($routes, $method, $path);

if (!$route) {
    http_response_code(404);
    View::render(ROOT . '/pages/404.php', [], Auth::check() ? 'app' : 'public', '404');
}

if (!empty($route['installed'])) {
    redirect('/');
}

// ---- API --------------------------------------------------------------
if (isset($route['api'])) {
    $module = $params['module'];
    $action = $params['action'];
    $file = ROOT . '/' . $route['api'] . '/' . $module . '.php';
    if (!preg_match('/^[a-z_]+$/', $module) || !is_file($file)) {
        fail('অনুরোধটি সঠিক নয়।', 404);
    }
    require $file;
    fail('অনুরোধটি সঠিক নয়।', 404);
}

// ---- Raw handlers -----------------------------------------------------
if (isset($route['handler'])) {
    require ROOT . '/' . $route['handler'];
    exit;
}

// ---- Admin panel ------------------------------------------------------
if (array_key_exists('admin', $route)) {
    require ROOT . '/v2admin/router.php';
    exit;
}

// ---- Maintenance mode (admins can still browse) -----------------------
if (setting_on('maintenance_mode') && !AdminAuth::user() && !in_array($route['page'], ['login', 'offline'], true)) {
    http_response_code(503);
    View::render(ROOT . '/pages/maintenance.php', [], 'public', 'maintenance');
}

// ---- Pages ------------------------------------------------------------
$user = Auth::user();
if (!empty($route['home']) && $user) {
    redirect('/dashboard');
}
if (!empty($route['guest']) && $user) {
    redirect('/dashboard');
}
if (!empty($route['auth']) && !$user) {
    redirect('/login?next=' . rawurlencode($path . (empty($_SERVER['QUERY_STRING']) ? '' : '?' . $_SERVER['QUERY_STRING'])));
}

$shell = $route['shell'] === 'auto' ? ($user ? 'app' : 'public') : $route['shell'];
View::render(ROOT . '/pages/' . $route['page'] . '.php', ['user' => $user, 'params' => $params, 'route' => $route], $shell, $route['page'], $route['active'] ?? '');
