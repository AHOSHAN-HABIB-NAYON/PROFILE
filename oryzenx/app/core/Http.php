<?php
final class Http
{
    /** @return array{status:int, body:string, error:string} */
    public static function request(string $method, string $url, array $headers = [], string|array|null $body = null, int $timeout = 20): array
    {
        $ch = curl_init($url);
        $h = [];
        foreach ($headers as $k => $v) $h[] = is_int($k) ? $v : "$k: $v";
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => $timeout,
            CURLOPT_CONNECTTIMEOUT => min(8, $timeout), CURLOPT_HTTPHEADER => $h, CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_USERAGENT => 'Oryzenx/' . OZX_VERSION,
        ]);
        if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, is_array($body) ? http_build_query($body) : $body);
        $res = curl_exec($ch);
        $out = ['status' => (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE), 'body' => is_string($res) ? $res : '', 'error' => curl_error($ch)];
        curl_close($ch);
        return $out;
    }

    public static function json(string $method, string $url, array $payload, array $headers = [], int $timeout = 30): array
    {
        $r = self::request($method, $url, $headers + ['Content-Type' => 'application/json'], json_encode($payload, JSON_UNESCAPED_UNICODE), $timeout);
        $r['json'] = json_decode($r['body'], true) ?: [];
        return $r;
    }
}
