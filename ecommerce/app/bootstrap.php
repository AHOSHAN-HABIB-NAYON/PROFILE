<?php
/**
 * Application bootstrap: constants, configuration, autoloading, error handling.
 */

define('ROOT_PATH', dirname(__DIR__));
define('APP_PATH', ROOT_PATH . '/app');
define('VIEW_PATH', ROOT_PATH . '/views');
define('ADMIN_PATH', ROOT_PATH . '/admin');
define('STORAGE_PATH', ROOT_PATH . '/storage');
define('UPLOAD_PATH', ROOT_PATH . '/public/uploads');
define('PUBLIC_PATH', ROOT_PATH . '/public');

if (is_file(ROOT_PATH . '/config.php')) {
    require ROOT_PATH . '/config.php';
} else {
    // First run: no config.php yet → show the web installer (it disables itself once config.php exists).
    require APP_PATH . '/install/installer.php';
    exit;
}

defined('APP_DEBUG') || define('APP_DEBUG', false);
defined('APP_ENV') || define('APP_ENV', 'production');
date_default_timezone_set(defined('APP_TIMEZONE') ? APP_TIMEZONE : 'Asia/Dhaka');
mb_internal_encoding('UTF-8');

ini_set('display_errors', APP_DEBUG ? '1' : '0');
ini_set('log_errors', '1');
ini_set('error_log', STORAGE_PATH . '/logs/php-errors.log');
error_reporting(E_ALL);

spl_autoload_register(static function (string $class): void {
    static $dirs = [
        APP_PATH . '/core/',
        APP_PATH . '/models/',
        APP_PATH . '/services/',
        APP_PATH . '/services/couriers/',
        APP_PATH . '/controllers/',
        APP_PATH . '/middleware/',
        ADMIN_PATH . '/controllers/',
    ];
    if (!preg_match('/^[A-Za-z0-9_]+$/', $class)) {
        return;
    }
    foreach ($dirs as $dir) {
        $file = $dir . $class . '.php';
        if (is_file($file)) {
            require $file;
            return;
        }
    }
});

require APP_PATH . '/helpers/functions.php';

ErrorHandler::register();
