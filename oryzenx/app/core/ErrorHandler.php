<?php
/** Central error handling: logs details server-side, shows friendly bilingual messages. */
final class ErrorHandler
{
    public static function register(): void
    {
        set_error_handler(function (int $no, string $str, string $file, int $line): bool {
            if (!(error_reporting() & $no)) return false;
            throw new ErrorException($str, 0, $no, $file, $line);
        });
        set_exception_handler([self::class, 'handle']);
        register_shutdown_function(function (): void {
            $e = error_get_last();
            if ($e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
                self::handle(new ErrorException($e['message'], 0, $e['type'], $e['file'], $e['line']));
            }
        });
    }

    public static function log(string $level, string $message, array $context = []): void
    {
        $dir = STORAGE . '/logs';
        if (!is_dir($dir)) @mkdir($dir, 0775, true);
        $line = sprintf("[%s] %s: %s %s\n", date('Y-m-d H:i:s'), strtoupper($level), $message,
            $context ? json_encode($context, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : '');
        @file_put_contents($dir . '/app-' . date('Y-m-d') . '.log', $line, FILE_APPEND | LOCK_EX);
    }

    public static function handle(Throwable $e): void
    {
        $code = $e instanceof HttpException ? $e->getCode() : 500;
        if ($code >= 500) {
            self::log('error', $e->getMessage(), [
                'file' => $e->getFile() . ':' . $e->getLine(),
                'url' => $_SERVER['REQUEST_URI'] ?? '',
                'trace' => array_slice(explode("\n", $e->getTraceAsString()), 0, 8),
            ]);
        }
        while (ob_get_level() > 0) ob_end_clean();
        if (!headers_sent()) http_response_code($code);

        $msg = $e instanceof HttpException ? $e->getMessage() : '';
        if (DEBUG && !($e instanceof HttpException)) {
            $msg = $e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine();
        }
        try {
            if (is_json_request() && !is_spa()) {
                json_out(['ok' => false, 'message' => $msg ?: t('error.generic'), 'code' => $code], $code);
            }
            View::errorPage($code, $msg);
        } catch (Throwable $inner) {
            // Last-resort output that cannot fail.
            if (!headers_sent()) header('Content-Type: text/html; charset=utf-8');
            echo '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
               . '<div style="font-family:system-ui,sans-serif;max-width:420px;margin:15vh auto;padding:24px;text-align:center">'
               . '<h2 style="font-size:20px">দুঃখিত, কিছু সমস্যা হয়েছে।</h2><p>আবার চেষ্টা করুন।</p>'
               . '<h2 style="font-size:20px">Something went wrong.</h2><p>Please try again.</p>'
               . '<a href="javascript:location.reload()">Retry</a></div>';
        }
        exit;
    }
}

final class HttpException extends RuntimeException {}
