<?php
declare(strict_types=1);

define('ROOT', dirname(__DIR__));
define('APP', ROOT . '/app');
define('VIEWS', ROOT . '/views');
define('STORAGE', ROOT . '/storage');
define('PUBLIC_UPLOADS', ROOT . '/assets/uploads');
define('OZX_VERSION', '1.0.0');

mb_internal_encoding('UTF-8');
ini_set('default_charset', 'UTF-8');
date_default_timezone_set('Asia/Dhaka');

$configFile = APP . '/config/config.php';
$GLOBALS['config'] = is_file($configFile) ? require $configFile : [];
define('INSTALLED', !empty($GLOBALS['config']['db']['name']));
define('DEBUG', (bool)($GLOBALS['config']['debug'] ?? false));
if (!empty($GLOBALS['config']['timezone'])) date_default_timezone_set($GLOBALS['config']['timezone']);

// Production: never print PHP errors to visitors; log them instead.
error_reporting(E_ALL);
ini_set('display_errors', DEBUG ? '1' : '0');
ini_set('log_errors', '1');
ini_set('error_log', STORAGE . '/logs/php-error.log');

spl_autoload_register(function (string $class): void {
    foreach (['core', 'controllers', 'services'] as $dir) {
        $f = APP . "/$dir/$class.php";
        if (is_file($f)) { require $f; return; }
    }
});
require APP . '/helpers.php';

ErrorHandler::register();
