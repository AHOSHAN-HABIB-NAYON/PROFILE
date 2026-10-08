<?php
declare(strict_types=1);

/** An error the API reports to the client with a status code and a Bengali message. */
final class ApiError extends RuntimeException
{
    public function __construct(
        public readonly int $status,
        public readonly string $errorCode,
        string $message,
    ) {
        parent::__construct($message);
    }
}

final class Http
{
    public static function json(mixed $data, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    /** The decoded JSON request body (an empty array when there is none). */
    public static function body(): array
    {
        static $body = null;
        if ($body !== null) {
            return $body;
        }
        $raw = file_get_contents('php://input');
        if ($raw === '' || $raw === false) {
            return $body = [];
        }
        if (strlen($raw) > 64 * 1024) {
            throw new ApiError(413, 'too_large', 'অনুরোধটি অনেক বড়।');
        }
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            throw new ApiError(400, 'bad_json', 'অনুরোধের ফরম্যাট সঠিক নয়।');
        }
        return $body = $data;
    }

    public static function str(string $key, int $maxLength = 255, bool $required = true): string
    {
        $value = self::body()[$key] ?? null;
        if ($value === null || $value === '') {
            if ($required) {
                throw new ApiError(422, 'missing_field', "'{$key}' দেওয়া হয়নি।");
            }
            return '';
        }
        if (!is_string($value) && !is_int($value) && !is_float($value)) {
            throw new ApiError(422, 'invalid_field', "'{$key}' সঠিক নয়।");
        }
        $value = trim((string) $value);
        if (mb_strlen($value) > $maxLength) {
            throw new ApiError(422, 'too_long', "'{$key}' অনেক লম্বা।");
        }
        return $value;
    }

    public static function arr(string $key): array
    {
        $value = self::body()[$key] ?? null;
        if (!is_array($value)) {
            throw new ApiError(422, 'missing_field', "'{$key}' দেওয়া হয়নি।");
        }
        return $value;
    }

    public static function method(): string
    {
        return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    }

    public static function ip(): string
    {
        return substr((string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'), 0, 45);
    }

    public static function header(string $name): string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        return (string) ($_SERVER[$key] ?? '');
    }
}

function base64url_encode(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64url_decode(string $data): string
{
    $decoded = base64_decode(strtr($data, '-_', '+/') . str_repeat('=', (4 - strlen($data) % 4) % 4), true);
    if ($decoded === false) {
        throw new ApiError(400, 'bad_encoding', 'ডেটার এনকোডিং সঠিক নয়।');
    }
    return $decoded;
}
