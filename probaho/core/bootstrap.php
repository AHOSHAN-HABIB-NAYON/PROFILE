<?php
/**
 * Application bootstrap: constants, error handling, autoloading, session.
 * Every request enters through /index.php which requires this file.
 */
declare(strict_types=1);

define('ROOT', dirname(__DIR__));
define('APP_START', microtime(true));
define('FRIENDLY_ERROR', 'দুঃখিত, এই মুহূর্তে অনুরোধটি সম্পন্ন করা যাচ্ছে না। আবার চেষ্টা করুন।');

mb_internal_encoding('UTF-8');
ini_set('default_charset', 'UTF-8');
ini_set('display_errors', '0');
ini_set('log_errors', '1');
ini_set('error_log', ROOT . '/storage/logs/php-error.log');
error_reporting(E_ALL);

$GLOBALS['CONFIG'] = require ROOT . '/config/config.php';

spl_autoload_register(static function (string $class): void {
    $file = ROOT . '/core/' . str_replace('\\', '/', $class) . '.php';
    if (is_file($file)) {
        require $file;
    }
});

require ROOT . '/core/helpers.php';
require ROOT . '/includes/components.php';

// Turn every PHP warning/notice into an exception so nothing leaks to output.
set_error_handler(static function (int $severity, string $message, string $file = '', int $line = 0): bool {
    if (!(error_reporting() & $severity)) {
        return false;
    }
    throw new ErrorException($message, 0, $severity, $file, $line);
});

set_exception_handler(static function (Throwable $e): void {
    Logger::error($e);
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    if (!headers_sent()) {
        http_response_code(500);
    }
    if (is_api_request()) {
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode(['ok' => false, 'message' => FRIENDLY_ERROR], JSON_UNESCAPED_UNICODE);
        return;
    }
    if (!headers_sent()) {
        header('Content-Type: text/html; charset=utf-8');
    }
    echo error_page_html(FRIENDLY_ERROR);
});

register_shutdown_function(static function (): void {
    $err = error_get_last();
    if ($err && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        Logger::write('FATAL', $err['message'] . ' in ' . $err['file'] . ':' . $err['line']);
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        if (!headers_sent()) {
            http_response_code(500);
        }
        echo is_api_request()
            ? json_encode(['ok' => false, 'message' => FRIENDLY_ERROR], JSON_UNESCAPED_UNICODE)
            : error_page_html(FRIENDLY_ERROR);
    }
});

if (config('installed')) {
    date_default_timezone_set((string) (Settings::get('timezone') ?: 'Asia/Dhaka'));
    // The DB connection was opened before the timezone switch; align MySQL with PHP.
    db()->pdo->exec("SET time_zone = '" . date('P') . "'");
} else {
    date_default_timezone_set('Asia/Dhaka');
}

// ---- Session -----------------------------------------------------------
if (session_status() === PHP_SESSION_NONE && PHP_SAPI !== 'cli') {
    session_name('PBSESS');
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => base_path() . '/',
        'secure'   => is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    ini_set('session.use_strict_mode', '1');
    ini_set('session.gc_maxlifetime', '86400');
    ini_set('session.gc_probability', '1');
    ini_set('session.gc_divisor', '200');
    session_save_path(ROOT . '/storage/cache');
    session_start();
}

// ---- Security headers -------------------------------------------------
if (PHP_SAPI !== 'cli' && !headers_sent()) {
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: SAMEORIGIN');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Permissions-Policy: camera=(self), microphone=(), geolocation=(), publickey-credentials-get=(self), publickey-credentials-create=(self)');
    if (is_https()) {
        header('Strict-Transport-Security: max-age=31536000');
    }
}
