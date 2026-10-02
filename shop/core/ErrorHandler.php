<?php
final class ErrorHandler
{
    public static function handleError(int $no, string $str, string $file, int $line): bool
    {
        if (!(error_reporting() & $no)) {
            return false;
        }
        throw new ErrorException($str, 0, $no, $file, $line);
    }

    public static function handleException(Throwable $e): void
    {
        Logger::error(get_class($e) . ': ' . $e->getMessage(), ['file' => $e->getFile() . ':' . $e->getLine()]);
        if (Config::get('debug')) {
            Logger::error($e->getTraceAsString());
        }
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        if (!headers_sent()) {
            http_response_code(500);
        }
        // Customers never see raw PHP/SQL errors.
        if (class_exists('Request', false) && Request::wantsJson()) {
            if (!headers_sent()) {
                header('Content-Type: application/json; charset=utf-8');
            }
            echo json_encode(['success' => false, 'message' => GENERIC_ERROR, 'data' => null, 'errors' => [], 'redirect' => null], JSON_UNESCAPED_UNICODE);
            return;
        }
        $debug = Config::get('debug') ? '<pre style="white-space:pre-wrap;font-size:12px">' . e($e->getMessage() . "\n" . $e->getFile() . ':' . $e->getLine()) . '</pre>' : '';
        echo '<!doctype html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>সমস্যা হয়েছে</title>'
            . '<style>body{font-family:system-ui,sans-serif;background:#f6f7fb;color:#1f2937;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;-webkit-text-size-adjust:100%}div{max-width:420px;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:24px;text-align:center;font-size:14px;line-height:1.6}a{display:inline-block;margin-top:12px;color:#fff;background:#4f46e5;padding:8px 16px;border-radius:8px;text-decoration:none;font-size:13px}</style></head>'
            . '<body><div><p>' . GENERIC_ERROR . '</p><a href="/">হোমে ফিরে যান</a>' . $debug . '</div></body></html>';
    }

    public static function handleShutdown(): void
    {
        $err = error_get_last();
        if ($err && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
            self::handleException(new ErrorException($err['message'], 0, $err['type'], $err['file'], $err['line']));
        }
    }
}
