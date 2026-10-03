<?php
/**
 * Single front controller. Apache rewrites every clean URL here
 * (see .htaccess); no other PHP file is reachable directly.
 */

// Local development: `php -S localhost:8000 index.php` serves real static files directly.
if (PHP_SAPI === 'cli-server') {
    $__p = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';
    if ($__p !== '/' && is_file(__DIR__ . $__p) && !str_ends_with($__p, '.php')
        && preg_match('~^/(assets/(?!uploads/.*\.(php|phtml))|sw\.js$|index\.html$|processor\.png$)~', $__p)) {
        return false;
    }
}

require __DIR__ . '/config/config.php';

$path = request_path();

// ---------------------------------------------------------------------
// First run: installer
// ---------------------------------------------------------------------
if (!INSTALLED) {
    if ($path === '/install') {
        require ROOT . '/database/install.php';
        exit;
    }
    if (str_starts_with($path, '/assets/')) { http_response_code(404); exit; }
    redirect('/install');
}

start_session();

// ---------------------------------------------------------------------
// Special (non-page) routes
// ---------------------------------------------------------------------
if (preg_match('~^/api/([a-z]+)$~', $path, $m)) {
    define('API_REQUEST', true);
    $apis = ['navigation', 'auth', 'payment', 'notification', 'upload', 'ai', 'analytics', 'search', 'support', 'contact', 'admin', 'prices'];
    if (!in_array($m[1], $apis, true)) render_error(404);
    send_security_headers();
    // every state-changing API call must carry the CSRF token
    if (is_post() && $m[1] !== 'analytics') csrf_check();
    require ROOT . '/api/' . $m[1] . '.php';
    exit;
}

switch (true) {
    case in_array($path, ['/manifest.json', '/robots.txt', '/sitemap.xml'], true):
        match ($path) { '/manifest.json' => seo_manifest(), '/robots.txt' => seo_robots(), '/sitemap.xml' => seo_sitemap() };
        exit;
    case $path === '/auth/google' || $path === '/auth/google/callback':
        require_once ROOT . '/core/google.php';
        $path === '/auth/google' ? google_start() : google_callback();
        exit;
    case (bool)preg_match('~^/file/(payment|contact)/(\d+)$~', $path, $m):
        require_once ROOT . '/core/upload.php';
        serve_private_file($m[1], (int)$m[2]);
        exit;
    case (bool)preg_match('~^/cron/([a-f0-9]{32})$~', $path, $m):
        require_once ROOT . '/core/cron.php';
        run_cron($m[1]);
        exit;
    case $path === '/install':
        render_error(404);
        exit;
}

// ---------------------------------------------------------------------
// Pages (full HTML document)
// ---------------------------------------------------------------------
send_page(render_route($path));
