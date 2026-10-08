<?php
/**
 * Converts every PHP error into a logged exception and shows customers a
 * friendly Bengali message — never warnings, SQL errors, paths or traces.
 */
final class ErrorHandler
{
    public const FRIENDLY = 'দুঃখিত, সাময়িকভাবে সমস্যাটি হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।';

    public static function register(): void
    {
        set_error_handler([self::class, 'handleError']);
        set_exception_handler([self::class, 'handleException']);
        register_shutdown_function([self::class, 'handleShutdown']);
    }

    public static function handleError(int $severity, string $message, string $file = '', int $line = 0): bool
    {
        if (!(error_reporting() & $severity)) {
            return false;
        }
        throw new ErrorException($message, 0, $severity, $file, $line);
    }

    public static function handleException(Throwable $e): void
    {
        if ($e instanceof HttpException) {
            self::respond($e->getStatus(), $e->getMessage(), $e instanceof ValidationException ? $e->errors() : []);
            return;
        }
        Logger::error(get_class($e) . ': ' . $e->getMessage(), [
            'file' => $e->getFile() . ':' . $e->getLine(),
            'uri'  => $_SERVER['REQUEST_URI'] ?? '',
            'trace'=> APP_DEBUG ? $e->getTraceAsString() : substr($e->getTraceAsString(), 0, 1500),
        ]);
        self::respond(500, APP_DEBUG ? $e->getMessage() : self::FRIENDLY);
    }

    public static function handleShutdown(): void
    {
        $err = error_get_last();
        if ($err && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
            Logger::error('Fatal: ' . $err['message'], ['file' => $err['file'] . ':' . $err['line']]);
            self::respond(500, self::FRIENDLY);
        }
    }

    private static function respond(int $status, string $message, array $errors = []): void
    {
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        if (headers_sent()) {
            return;
        }
        http_response_code($status);
        $wantsJson = Request::current()->expectsJson();
        if ($wantsJson) {
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['success' => false, 'message' => $message] + ($errors ? ['errors' => $errors] : []), JSON_UNESCAPED_UNICODE);
            return;
        }
        header('Content-Type: text/html; charset=utf-8');
        try {
            echo View::render('pages/error', ['status' => $status, 'message' => $message], 'minimal');
        } catch (Throwable $inner) {
            echo '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
                . '<div style="font-family:sans-serif;max-width:480px;margin:15vh auto;padding:24px;text-align:center">'
                . '<h2>' . htmlspecialchars($message, ENT_QUOTES, 'UTF-8') . '</h2><p><a href="/">হোমে ফিরে যান</a></p></div>';
        }
    }
}
