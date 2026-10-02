<?php
/** Meta Conversions API (server-side). The access token never leaves the server. */
final class MetaCapi
{
    private const GRAPH = 'https://graph.facebook.com/v21.0/';

    public static function enabled(): bool
    {
        return Settings::on('meta_enabled') && Settings::on('meta_capi_enabled') && setting('meta_pixel_id') && setting('meta_access_token');
    }

    private static function hash(?string $v): ?string
    {
        $v = $v !== null ? mb_strtolower(trim($v)) : '';
        return $v === '' ? null : hash('sha256', $v);
    }

    public static function userData(array $extra = []): array
    {
        $d = [
            'client_ip_address' => Request::ip(),
            'client_user_agent' => Request::userAgent(),
            'fbp' => is_string($_COOKIE['_fbp'] ?? null) ? $_COOKIE['_fbp'] : null,
            'fbc' => is_string($_COOKIE['_fbc'] ?? null) ? $_COOKIE['_fbc'] : null,
            'external_id' => isset($_COOKIE['vid']) && is_string($_COOKIE['vid']) ? self::hash($_COOKIE['vid']) : null,
        ];
        return array_filter($d + $extra);
    }

    /** Queue an event to be sent after the response (no customer-facing latency). */
    public static function queue(string $event, string $eventId, array $custom = [], array $userExtra = []): void
    {
        if (!self::enabled() || ($_SERVER['HTTP_X_PREFETCH'] ?? '') === '1') {
            return;
        }
        $user = self::userData($userExtra);
        $url = abs_url(ltrim(Request::fullUrl(), '/'));
        if (Request::isSpa() || Request::wantsJson()) {
            $url = $_SERVER['HTTP_REFERER'] ?? $url;
        }
        Deferred::add(static fn () => self::send($event, $eventId, $custom, $user, $url));
    }

    public static function send(string $event, string $eventId, array $custom, array $user, string $url): bool
    {
        if (!self::enabled()) {
            return false;
        }
        $payload = ['data' => [[
            'event_name' => $event, 'event_time' => time(), 'event_id' => $eventId,
            'action_source' => 'website', 'event_source_url' => $url,
            'user_data' => $user, 'custom_data' => (object) $custom,
        ]]];
        if ($code = setting('meta_test_code')) {
            $payload['test_event_code'] = $code;
        }
        $res = Http::post(self::GRAPH . rawurlencode((string) setting('meta_pixel_id')) . '/events?access_token=' . rawurlencode((string) setting('meta_access_token')), $payload, [], 8);
        if ($res['ok']) {
            Settings::setMany(['meta_status' => 'success', 'meta_status_message' => $event . ' — ' . date('d M H:i')]);
            return true;
        }
        $msg = $res['json']['error']['message'] ?? ($res['error'] ?: 'HTTP ' . $res['status']);
        Settings::setMany(['meta_status' => 'error', 'meta_status_message' => mb_substr($msg, 0, 200)]);
        Logger::api('Meta CAPI failed', ['event' => $event, 'status' => $res['status'], 'message' => $msg]);
        if (random_int(1, 5) === 1) {
            Notifier::add('meta_error', 'Meta CAPI ত্রুটি', mb_substr($msg, 0, 300), '/admin/settings#tracking');
        }
        return false;
    }

    public static function purchase(array $order, array $items): void
    {
        if (!self::enabled()) {
            return;
        }
        $names = preg_split('/\s+/u', trim($order['customer_name']));
        $custom = [
            'currency' => 'BDT', 'value' => (float) $order['total'], 'order_id' => $order['order_code'],
            'content_type' => 'product',
            'content_ids' => array_values(array_filter(array_map(static fn ($i) => $i['product_id'] ? (string) $i['product_id'] : ($i['combo_id'] ? 'combo-' . $i['combo_id'] : null), $items))),
            'num_items' => array_sum(array_column($items, 'quantity')),
        ];
        $user = array_filter([
            'client_ip_address' => $order['ip'], 'client_user_agent' => $order['user_agent'],
            'ph' => self::hash('88' . $order['phone']), 'fn' => self::hash($names[0] ?? null),
            'ln' => self::hash(count($names) > 1 ? end($names) : null), 'ct' => self::hash($order['district']), 'country' => self::hash('bd'),
            'fbp' => is_string($_COOKIE['_fbp'] ?? null) ? $_COOKIE['_fbp'] : null,
            'fbc' => is_string($_COOKIE['_fbc'] ?? null) ? $_COOKIE['_fbc'] : null,
        ]);
        self::send('Purchase', $order['order_code'], $custom, $user, abs_url('order-success/' . $order['order_code']));
    }

    public static function test(): array
    {
        if (!setting('meta_pixel_id') || !setting('meta_access_token')) {
            Settings::setMany(['meta_status' => 'not_configured', 'meta_status_message' => '']);
            return ['ok' => false, 'message' => 'Pixel ID এবং Access Token দিন।'];
        }
        $res = Http::get(self::GRAPH . rawurlencode((string) setting('meta_pixel_id')) . '?fields=id,name&access_token=' . rawurlencode((string) setting('meta_access_token')), [], 8);
        if ($res['ok']) {
            Settings::setMany(['meta_status' => 'success', 'meta_status_message' => 'সংযোগ সফল: ' . ($res['json']['name'] ?? '')]);
            return ['ok' => true, 'message' => 'সংযোগ সফল হয়েছে।'];
        }
        $msg = $res['json']['error']['message'] ?? ($res['error'] ?: 'HTTP ' . $res['status']);
        Settings::setMany(['meta_status' => 'error', 'meta_status_message' => mb_substr($msg, 0, 200)]);
        return ['ok' => false, 'message' => 'সংযোগ ব্যর্থ: ' . $msg];
    }
}
