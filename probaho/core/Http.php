<?php
/**
 * Minimal cURL client used for Google OAuth, Binance Pay, AI providers,
 * Web Push and CAPTCHA verification.
 */
declare(strict_types=1);

final class Http
{
    /**
     * @param array|string $body  array => form/json encoded, string => raw
     * @return array{status:int, body:string, json:?array, error:string, headers:array}
     */
    public static function request(string $method, string $url, $body = null, array $headers = [], bool $json = true, int $timeout = 20): array
    {
        $ch = curl_init($url);
        $respHeaders = [];
        $opts = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST  => $method,
            CURLOPT_TIMEOUT        => $timeout,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_HEADERFUNCTION => static function ($ch, $line) use (&$respHeaders) {
                $parts = explode(':', $line, 2);
                if (count($parts) === 2) {
                    $respHeaders[strtolower(trim($parts[0]))] = trim($parts[1]);
                }
                return strlen($line);
            },
        ];
        if ($body !== null) {
            if (is_array($body)) {
                if ($json) {
                    $body = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                    $headers[] = 'Content-Type: application/json';
                } else {
                    $body = http_build_query($body);
                    $headers[] = 'Content-Type: application/x-www-form-urlencoded';
                }
            }
            $opts[CURLOPT_POSTFIELDS] = $body;
        }
        $opts[CURLOPT_HTTPHEADER] = $headers;
        curl_setopt_array($ch, $opts);
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error = $raw === false ? curl_error($ch) : '';
        curl_close($ch);
        $raw = $raw === false ? '' : (string) $raw;
        $decoded = json_decode($raw, true);
        return ['status' => $status, 'body' => $raw, 'json' => is_array($decoded) ? $decoded : null, 'error' => $error, 'headers' => $respHeaders];
    }

    public static function post(string $url, $body, array $headers = [], bool $json = true, int $timeout = 20): array
    {
        return self::request('POST', $url, $body, $headers, $json, $timeout);
    }

    public static function get(string $url, array $headers = [], int $timeout = 15): array
    {
        return self::request('GET', $url, null, $headers, true, $timeout);
    }
}
