<?php
declare(strict_types=1);

define('BASE_PATH', dirname(__DIR__));
define('APP_VERSION', '1.0.0');

spl_autoload_register(static function (string $class): void {
    static $dirs = ['core', 'models', 'services', 'services/Couriers', 'controllers', 'controllers/Admin', 'api'];
    $class = basename(str_replace('\\', '/', $class));
    foreach ($dirs as $dir) {
        $file = BASE_PATH . '/' . $dir . '/' . $class . '.php';
        if (is_file($file)) {
            require $file;
            return;
        }
    }
});

require BASE_PATH . '/core/helpers.php';

Env::load(BASE_PATH . '/.env');
$config = require BASE_PATH . '/config/app.php';
Config::set($config);

date_default_timezone_set(Config::get('timezone', 'Asia/Dhaka'));
mb_internal_encoding('UTF-8');

if (function_exists('ini_set')) {
    @ini_set('display_errors', Config::get('debug') ? '1' : '0');
    @ini_set('log_errors', '1');
}
error_reporting(E_ALL);

set_exception_handler([ErrorHandler::class, 'handleException']);
set_error_handler([ErrorHandler::class, 'handleError']);
register_shutdown_function([ErrorHandler::class, 'handleShutdown']);
