<?php
/**
 * Application bootstrap.
 * Loaded by index.php (the single front controller). Every other PHP file
 * refuses to run unless APP is defined, so nothing can be executed directly.
 */
declare(strict_types=1);

define('APP', true);
define('ROOT', dirname(__DIR__));
define('APP_VERSION', '1.0.0');

// ---------------------------------------------------------------------
// Never show raw PHP errors to visitors – log them privately instead.
// ---------------------------------------------------------------------
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
ini_set('log_errors', '1');
ini_set('error_log', ROOT . '/storage/logs/php-error.log');
error_reporting(E_ALL);
mb_internal_encoding('UTF-8');

// ---------------------------------------------------------------------
// Environment (written by the installer, never committed to git)
// ---------------------------------------------------------------------
$__env = is_readable(ROOT . '/config/env.php') ? require ROOT . '/config/env.php' : [];
define('ENV', is_array($__env) ? $__env : []);
unset($__env);

define('INSTALLED', !empty(ENV['db_name']) && is_file(ROOT . '/storage/installed.lock'));
date_default_timezone_set(ENV['timezone'] ?? 'Asia/Dhaka');

// Base path – supports installing in a sub-folder (e.g. example.com/app)
if (!empty(ENV['base_url'])) {
    define('BASE_URL', rtrim(ENV['base_url'], '/'));
    define('BASE_PATH', rtrim((string)parse_url(BASE_URL, PHP_URL_PATH), '/'));
} else {
    $dir = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/'));
    define('BASE_PATH', $dir === '/' || $dir === '.' ? '' : rtrim($dir, '/'));
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https') ? 'https' : 'http';
    define('BASE_URL', $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . BASE_PATH);
}
define('IS_HTTPS', str_starts_with(BASE_URL, 'https://'));

// ---------------------------------------------------------------------
// Core libraries
// ---------------------------------------------------------------------
require ROOT . '/core/helpers.php';
require ROOT . '/config/database.php';
require ROOT . '/core/settings.php';
require ROOT . '/core/i18n.php';
require ROOT . '/config/security.php';
require ROOT . '/config/auth.php';
require ROOT . '/config/mail.php';
require ROOT . '/core/notify.php';
require ROOT . '/core/router.php';
require ROOT . '/core/seo.php';

set_exception_handler('handle_uncaught');

/**
 * Last-resort handler: log technical details, show a friendly page.
 */
function handle_uncaught(Throwable $e): void
{
    if ($e instanceof HttpError) {
        render_error($e->getCode() ?: 500, $e->getMessage());
        return;
    }
    log_error($e);
    render_error(500);
}
