<?php
declare(strict_types=1);

namespace OryzenX\Services;

/** Small outbound HTTP client (cURL, with a stream fallback for hosts without ext-curl). */
final class HttpClient
{
    /** Test hook: callable(string $method, string $url, array $headers, ?string $body): array{status:int,body:string} */
    public static $fake = null;

    public static function get(string $url, array $headers = [], int $timeout = 10): array
    {
        return self::request('GET', $url, $headers, null, $timeout);
    }

    public static function post(string $url, string $body, array $headers = [], int $timeout = 10): array
    {
        return self::request('POST', $url, $headers, $body, $timeout);
    }

    /** @return array{status:int, body:string, error:?string} */
    public static function request(string $method, string $url, array $headers, ?string $body, int $timeout): array
    {
        if (self::$fake !== null) {
            return (self::$fake)($method, $url, $headers, $body) + ['error' => null];
        }
        if (!preg_match('#^https://#i', $url)) {
            return ['status' => 0, 'body' => '', 'error' => 'Only HTTPS URLs are allowed'];
        }
        $hdrs = [];
        foreach ($headers as $k => $v) {
            $hdrs[] = is_int($k) ? $v : "$k: $v";
        }
        $hdrs[] = 'User-Agent: OryzenX/1.0 (+server)';
        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_CUSTOMREQUEST => $method,
                CURLOPT_HTTPHEADER => $hdrs,
                CURLOPT_TIMEOUT => $timeout,
                CURLOPT_CONNECTTIMEOUT => min(5, $timeout),
                CURLOPT_FOLLOWLOCATION => false,
                CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
                CURLOPT_SSL_VERIFYPEER => true,
                CURLOPT_SSL_VERIFYHOST => 2,
                CURLOPT_ENCODING => '',
            ]);
            if ($body !== null) {
                curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
            }
            $resp = curl_exec($ch);
            $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            $err = $resp === false ? curl_error($ch) : null;
            curl_close($ch);
            return ['status' => $status, 'body' => $resp === false ? '' : (string) $resp, 'error' => $err];
        }
        $ctx = stream_context_create([
            'http' => ['method' => $method, 'header' => implode("\r\n", $hdrs), 'content' => $body ?? '', 'timeout' => $timeout, 'ignore_errors' => true],
            'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
        ]);
        $resp = @file_get_contents($url, false, $ctx);
        $status = 0;
        foreach ($http_response_header ?? [] as $h) {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', $h, $m)) {
                $status = (int) $m[1];
            }
        }
        return ['status' => $status, 'body' => $resp === false ? '' : $resp, 'error' => $resp === false ? 'Request failed' : null];
    }
}
