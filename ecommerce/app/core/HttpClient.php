<?php
/**
 * Small cURL wrapper for server-to-server calls (couriers, Meta CAPI, GeoIP, Google).
 * Never logs request headers (they may contain tokens).
 */
final class HttpClient
{
    /**
     * @return array{status:int, body:string, json:?array, error:?string}
     */
    public static function request(string $method, string $url, array $options = []): array
    {
        $ch = curl_init();
        $headers = $options['headers'] ?? [];
        $body = null;
        if (isset($options['json'])) {
            $body = json_encode($options['json'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            $headers[] = 'Content-Type: application/json';
        } elseif (isset($options['form'])) {
            $body = http_build_query($options['form']);
            $headers[] = 'Content-Type: application/x-www-form-urlencoded';
        }
        $headers[] = 'Accept: application/json';
        curl_setopt_array($ch, [
            CURLOPT_URL            => $url,
            CURLOPT_CUSTOMREQUEST  => strtoupper($method),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => $options['timeout'] ?? 20,
            CURLOPT_CONNECTTIMEOUT => min(8, $options['timeout'] ?? 20),
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_USERAGENT      => 'NovaShop/1.0 (+core-php)',
        ]);
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }
        $response = curl_exec($ch);
        $error = $response === false ? curl_error($ch) : null;
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        $text = is_string($response) ? $response : '';
        $json = json_decode($text, true);
        return ['status' => $status, 'body' => $text, 'json' => is_array($json) ? $json : null, 'error' => $error];
    }

    public static function get(string $url, array $options = []): array
    {
        return self::request('GET', $url, $options);
    }

    public static function post(string $url, array $options = []): array
    {
        return self::request('POST', $url, $options);
    }
}
