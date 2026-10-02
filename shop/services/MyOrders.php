<?php
/**
 * "আমার অর্ডার" without customer accounts: the order codes placed from this device are kept in a
 * signed HttpOnly cookie (tamper-proof), so a device only ever sees its own orders.
 */
final class MyOrders
{
    private const COOKIE = 'my_orders';
    private const MAX = 20;

    private static function sign(string $payload): string
    {
        return hash_hmac('sha256', $payload, (string) Config::get('key') . '|my_orders');
    }

    public static function codes(): array
    {
        $raw = $_COOKIE[self::COOKIE] ?? '';
        $codes = [];
        if (is_string($raw) && str_contains($raw, '.')) {
            [$payload, $sig] = explode('.', $raw, 2);
            if (hash_equals(self::sign($payload), $sig)) {
                $decoded = json_decode((string) base64_decode(strtr($payload, '-_', '+/'), true), true);
                $codes = is_array($decoded) ? array_values(array_filter($decoded, static fn ($c) => is_string($c) && preg_match('/^ORD-\d{8}-[A-Z0-9]{5}$/', $c))) : [];
            }
        }
        return array_values(array_unique(array_merge($codes, (array) Session::get('my_orders', []))));
    }

    public static function add(string $code): void
    {
        $codes = array_slice(array_values(array_unique(array_merge(self::codes(), [$code]))), -self::MAX);
        Session::set('my_orders', $codes);
        $payload = rtrim(strtr(base64_encode(json_encode($codes)), '+/', '-_'), '=');
        setcookie(self::COOKIE, $payload . '.' . self::sign($payload), [
            'expires' => time() + 86400 * 365, 'path' => '/', 'secure' => Request::isHttps(), 'httponly' => true, 'samesite' => 'Lax',
        ]);
    }

    public static function owns(string $code): bool
    {
        return in_array($code, self::codes(), true);
    }

    public static function orders(): array
    {
        $codes = self::codes();
        if (!$codes) {
            return [];
        }
        return DB::all('SELECT o.id, o.order_code, o.total, o.status, o.created_at,
            (SELECT SUM(quantity) FROM order_items WHERE order_id = o.id) qty,
            (SELECT image FROM order_items WHERE order_id = o.id ORDER BY id LIMIT 1) image,
            (SELECT name FROM order_items WHERE order_id = o.id ORDER BY id LIMIT 1) first_item
            FROM orders o WHERE o.order_code IN (' . DB::in($codes) . ') AND o.deleted_at IS NULL ORDER BY o.id DESC', $codes);
    }
}
