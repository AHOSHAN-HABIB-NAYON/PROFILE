<?php
/** Oryzenx front controller. Every clean URL is routed through here (see .htaccess). */
require __DIR__ . '/app/bootstrap.php';

Session::start();
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
if (is_https()) header('Strict-Transport-Security: max-age=31536000');

$path = current_path();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if (!INSTALLED && !str_starts_with($path, '/install')) {
    header('Location: ' . url('/install'));
    exit;
}

if (INSTALLED) Migrations::run();

// Maintenance mode: admins and the sign-in flow keep working.
if (INSTALLED && setting('maintenance_enabled') === '1' && !Auth::isAdmin()
    && !preg_match('#^/(admin|login|logout|manifest\.json|sw\.js|icon-\d+\.png|offline|lang/)#', $path)) {
    MaintenanceController::show();
}

$router = new Router();
require APP . '/routes.php';
$router->dispatch($method, $path);
