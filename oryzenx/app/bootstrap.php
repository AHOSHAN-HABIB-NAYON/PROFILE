<?php
declare(strict_types=1);

use OryzenX\Core\Config;

// Composer autoloader when present (PHPMailer); a PSR-4 fallback keeps the app working without it.
$base = dirname(__DIR__);
if (is_file($base . '/vendor/autoload.php')) {
    require $base . '/vendor/autoload.php';
} else {
    spl_autoload_register(function (string $class) use ($base) {
        if (str_starts_with($class, 'OryzenX\\')) {
            $file = $base . '/app/' . str_replace('\\', '/', substr($class, 8)) . '.php';
            if (is_file($file)) {
                require $file;
            }
        }
    });
}

$configFile = getenv('ORYZENX_CONFIG') ?: $base . '/config/config.php';
Config::load($configFile);

date_default_timezone_set('UTC');
mb_internal_encoding('UTF-8');
ini_set('default_charset', 'UTF-8');
error_reporting(E_ALL);
ini_set('display_errors', Config::isDebug() ? '1' : '0');
ini_set('log_errors', '1');
ini_set('error_log', Config::storagePath('logs/php-error.log'));

set_error_handler(function (int $severity, string $message, string $file, int $line) {
    if (!(error_reporting() & $severity)) {
        return false;
    }
    throw new ErrorException($message, 0, $severity, $file, $line);
});
