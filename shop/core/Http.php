<?php
/** Minimal cURL client for server-side integrations (courier, Meta CAPI, geo). */
final class Http
{
    public static function request(string $method, string $url, array $headers = [], mixed $body = null, int $timeout = 15): array
    {
        $ch = curl_init($url);
        $h = [];
        foreach ($headers as $k => $v) {
            $h[] = $k . ': ' . $v;
        }
        if (is_array($body)) {
            $body = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            if (!isset($headers['Content-Type'])) {
                $h[] = 'Content-Type: application/json';
            }
        }
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST  => strtoupper($method),
            CURLOPT_HTTPHEADER     => array_merge(['Accept: application/json'], $h),
            CURLOPT_TIMEOUT        => $timeout,
            CURLOPT_CONNECTTIMEOUT => min(5, $timeout),
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_USERAGENT      => 'ShopServer/' . APP_VERSION,
        ]);
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        $json = is_string($raw) ? json_decode($raw, true) : null;
        return ['ok' => $raw !== false && $status >= 200 && $status < 300, 'status' => $status, 'body' => is_string($raw) ? $raw : '', 'json' => is_array($json) ? $json : null, 'error' => $err];
    }

    public static function get(string $url, array $headers = [], int $timeout = 15): array
    {
        return self::request('GET', $url, $headers, null, $timeout);
    }

    public static function post(string $url, mixed $body, array $headers = [], int $timeout = 15): array
    {
        return self::request('POST', $url, $headers, $body, $timeout);
    }
}
