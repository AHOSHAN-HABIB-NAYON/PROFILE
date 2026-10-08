<?php
/**
 * Meta Pixel + Conversions API + Google Tag/Ads.
 *
 * Browser and server events share the same event_id so Meta deduplicates them.
 * The CAPI access token is read server-side only and never rendered.
 */
final class Tracking
{
    private const GRAPH = 'https://graph.facebook.com/v21.0/';

    /** Per-event toggles from tracking_settings (cached). */
    public static function eventToggles(): array
    {
        return Cache::remember('settings:tracking', 3600, static function () {
            $out = [];
            foreach (DB::all('SELECT provider, event_name, browser_enabled, server_enabled FROM tracking_settings') as $r) {
                $out[$r['provider']][$r['event_name']] = ['browser' => (bool)$r['browser_enabled'], 'server' => (bool)$r['server_enabled']];
            }
            return $out;
        });
    }

    private static function allowed(string $provider, string $event, string $side): bool
    {
        $t = self::eventToggles()[$provider][$event] ?? null;
        return $t === null ? true : $t[$side];
    }

    public static function pixelId(): string
    {
        $id = PluginManager::enabled('meta_pixel') ? (PluginManager::config('meta_pixel')['pixel_id'] ?? '') : '';
        return preg_match('/^\d{5,20}$/', $id) ? $id : '';
    }

    /** Public, browser-safe configuration. */
    public static function browserConfig(): array
    {
        $gtm = PluginManager::enabled('google_tag') ? (PluginManager::config('google_tag')['gtm_id'] ?? '') : '';
        $ads = PluginManager::enabled('google_ads') ? PluginManager::config('google_ads') : [];
        $metaEvents = [];
        foreach (['PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'Purchase'] as $ev) {
            $metaEvents[$ev] = self::allowed('meta', $ev, 'browser');
        }
        return [
            'pixel'    => self::pixelId(),
            'meta'     => $metaEvents,
            'gtm'      => preg_match('/^GTM-[A-Z0-9]{4,12}$/', $gtm) ? $gtm : '',
            'ads_id'   => preg_match('/^AW-\d{5,15}$/', $ads['conversion_id'] ?? '') ? $ads['conversion_id'] : '',
            'ads_label'=> preg_replace('/[^A-Za-z0-9_-]/', '', $ads['conversion_label'] ?? ''),
            'currency' => setting('currency', 'BDT'),
        ];
    }

    public static function eventId(string $prefix): string
    {
        return strtolower($prefix) . '_' . Crypto::token(8);
    }

    /**
     * Build a browser event descriptor and queue the matching CAPI event.
     * Returned array is placed in the page "track" list.
     */
    public static function event(string $name, array $custom = [], array $user = []): array
    {
        $eventId = self::eventId($name);
        self::server($name, $eventId, $custom, $user);
        return ['name' => $name, 'event_id' => $eventId, 'data' => $custom];
    }

    /** Queue a server-side CAPI event (sent after the response). */
    public static function server(string $name, string $eventId, array $custom = [], array $user = [], ?string $sourceUrl = null): void
    {
        if (!self::allowed('meta', $name, 'server') || !PluginManager::enabled('meta_capi')) {
            return;
        }
        $pixel = self::pixelId();
        $capi = PluginManager::config('meta_capi');
        if ($pixel === '' || ($capi['access_token'] ?? '') === '') {
            return;
        }
        $r = Request::current();
        $userData = array_filter([
            'client_ip_address' => $r->ip(),
            'client_user_agent' => $r->userAgent(),
            'fbp'               => self::cookie('_fbp'),
            'fbc'               => self::cookie('_fbc'),
            'external_id'       => [hash('sha256', device_id())],
            'country'           => [hash('sha256', 'bd')],
        ] + self::hashUser($user));
        $event = [
            'event_name'       => $name,
            'event_time'       => time(),
            'event_id'         => $eventId,
            'action_source'    => 'website',
            'event_source_url' => $sourceUrl ?? $r->fullUrl(),
            'user_data'        => $userData,
        ];
        if ($custom) {
            $event['custom_data'] = $custom;
        }
        $payload = ['data' => [$event], 'access_token' => $capi['access_token']];
        if (!empty($capi['test_event_code'])) {
            $payload['test_event_code'] = $capi['test_event_code'];
        }
        Deferred::add(static function () use ($pixel, $payload, $name) {
            $res = HttpClient::post(self::GRAPH . $pixel . '/events', ['json' => $payload, 'timeout' => 6]);
            if ($res['status'] !== 200) {
                Logger::warning('Meta CAPI ' . $name . ' failed', ['status' => $res['status'], 'error' => $res['json']['error']['message'] ?? $res['error']]);
            }
        });
    }

    /** Purchase event for a placed order (event_id stored on the order for dedup). */
    public static function serverPurchase(array $order): void
    {
        self::server('Purchase', (string)$order['event_id'], self::purchaseData($order), [
            'phone' => $order['phone'], 'name' => $order['customer_name'],
        ], absolute_url('/order/success/' . $order['order_number']));
    }

    public static function purchaseData(array $order): array
    {
        return [
            'value'        => (float)$order['total'],
            'currency'     => setting('currency', 'BDT'),
            'content_type' => 'product',
            'content_ids'  => array_values(array_map(static fn($i) => (string)$i['product_id'], $order['items'])),
            'contents'     => array_values(array_map(static fn($i) => [
                'id' => (string)$i['product_id'], 'quantity' => (int)$i['quantity'], 'item_price' => (float)$i['unit_price'],
            ], $order['items'])),
            'num_items'    => array_sum(array_map(static fn($i) => (int)$i['quantity'], $order['items'])),
            'order_id'     => $order['order_number'],
        ];
    }

    /** Test the CAPI credentials (admin). */
    public static function testConnection(): array
    {
        $pixel = self::pixelId();
        $capi = PluginManager::config('meta_capi');
        if ($pixel === '' || empty($capi['access_token'])) {
            return ['ok' => false, 'message' => 'Pixel ID and Access Token are required (and Meta Pixel must be enabled).'];
        }
        $res = HttpClient::get(self::GRAPH . $pixel . '?fields=id,name&access_token=' . rawurlencode($capi['access_token']), ['timeout' => 10]);
        if ($res['status'] === 200 && isset($res['json']['id'])) {
            return ['ok' => true, 'message' => 'Connected to pixel: ' . ($res['json']['name'] ?? $pixel)];
        }
        return ['ok' => false, 'message' => 'Meta API: ' . ($res['json']['error']['message'] ?? ($res['error'] ?: 'HTTP ' . $res['status']))];
    }

    private static function hashUser(array $user): array
    {
        $out = [];
        if (!empty($user['phone']) && ($p = normalize_phone((string)$user['phone']))) {
            $out['ph'] = [hash('sha256', '88' . $p)];
        }
        if (!empty($user['name'])) {
            $parts = preg_split('/\s+/u', mb_strtolower(trim((string)$user['name'])));
            $out['fn'] = [hash('sha256', $parts[0])];
            if (count($parts) > 1) {
                $out['ln'] = [hash('sha256', end($parts))];
            }
        }
        return $out;
    }

    private static function cookie(string $name): ?string
    {
        $v = $_COOKIE[$name] ?? null;
        return is_string($v) && preg_match('/^fb\.\d\.\d+\.[A-Za-z0-9_.-]+$/', $v) ? $v : null;
    }
}
