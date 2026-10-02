<?php
/**
 * BDCourier phone history lookup (courier-wise totals / delivered / cancelled).
 * The API key lives in .env (BDCOURIER_API_KEY) or admin settings — never in the browser.
 */
final class BDCourierService
{
    public static function apiKey(): string
    {
        return (string) (setting('bdcourier_api_key') ?: Env::get('BDCOURIER_API_KEY', ''));
    }

    public static function configured(): bool
    {
        return self::apiKey() !== '';
    }

    /** @return array{ok:bool, message?:string, data?:array, cached?:bool} */
    public static function check(string $phone, bool $force = false): array
    {
        $phone = normalize_phone($phone) ?? '';
        if ($phone === '') {
            return ['ok' => false, 'message' => 'সঠিক ফোন নম্বর দিন।'];
        }
        if (!$force && ($row = DB::one('SELECT * FROM courier_checks WHERE phone = ? AND checked_at > (NOW() - INTERVAL 12 HOUR) ORDER BY id DESC LIMIT 1', [$phone]))) {
            return ['ok' => true, 'data' => self::rowToData($row), 'cached' => true];
        }
        if (!self::configured()) {
            return ['ok' => false, 'message' => 'BDCourier API key সেট করা নেই (সেটিংস → ফ্রড চেক)।'];
        }
        $endpoint = (string) setting('bdcourier_endpoint', 'https://api.bdcourier.com/courier-check');
        $res = Http::request('POST', $endpoint . (str_contains($endpoint, '?') ? '&' : '?') . 'phone=' . rawurlencode($phone), [
            'Authorization' => 'Bearer ' . self::apiKey(),
            'Content-Type'  => 'application/x-www-form-urlencoded',
        ], http_build_query(['phone' => $phone]), 15);
        if (!$res['ok'] || !$res['json']) {
            $msg = $res['json']['message'] ?? $res['json']['error'] ?? ($res['error'] ?: 'HTTP ' . $res['status']);
            Logger::courier('BDCourier check failed', ['phone' => substr($phone, 0, 5) . '******', 'status' => $res['status'], 'message' => is_string($msg) ? $msg : json_encode($msg)]);
            Notifier::add('courier_error', 'BDCourier API ত্রুটি', is_string($msg) ? mb_substr($msg, 0, 200) : 'অজানা ত্রুটি', '/admin/fraud');
            return ['ok' => false, 'message' => 'BDCourier থেকে তথ্য আনা যায়নি: ' . (is_string($msg) ? $msg : 'অজানা ত্রুটি')];
        }
        $data = self::parse($res['json']);
        $id = DB::insert('courier_checks', [
            'phone' => $phone, 'provider' => 'bdcourier', 'total' => $data['total'], 'delivered' => $data['delivered'],
            'cancelled' => $data['cancelled'], 'returned' => $data['returned'], 'success_rate' => $data['success_rate'],
            'couriers' => json_encode($data['couriers'], JSON_UNESCAPED_UNICODE),
        ]);
        $data['id'] = $id;
        $data['checked_at'] = date('Y-m-d H:i:s');
        return ['ok' => true, 'data' => $data, 'cached' => false];
    }

    private static function num(array $a, array $keys): int
    {
        foreach ($keys as $k) {
            if (isset($a[$k]) && is_numeric($a[$k])) {
                return (int) $a[$k];
            }
        }
        return 0;
    }

    /** Tolerant parser for BDCourier responses (courierData.{courier}, courierData.summary). */
    public static function parse(array $json): array
    {
        $root = $json['courierData'] ?? $json['data']['courierData'] ?? $json['data'] ?? $json;
        $couriers = [];
        $summary = null;
        if (is_array($root)) {
            foreach ($root as $key => $c) {
                if (!is_array($c)) {
                    continue;
                }
                if ($key === 'summary' || $key === 'totalSummary') {
                    $summary = $c;
                    continue;
                }
                $total = self::num($c, ['total_parcel', 'total', 'total_order', 'totalParcel']);
                $success = self::num($c, ['success_parcel', 'delivered', 'success', 'successParcel']);
                $cancel = self::num($c, ['cancelled_parcel', 'cancelled', 'cancel', 'cancelledParcel']);
                $returned = self::num($c, ['returned_parcel', 'returned', 'return']);
                $couriers[] = [
                    'name' => (string) ($c['name'] ?? ucfirst((string) $key)), 'total' => $total, 'delivered' => $success,
                    'cancelled' => $cancel, 'returned' => $returned,
                    'success_rate' => $total > 0 ? round($success / $total * 100, 1) : 0,
                ];
            }
        }
        if ($summary) {
            $total = self::num($summary, ['total_parcel', 'total']);
            $delivered = self::num($summary, ['success_parcel', 'success', 'delivered']);
            $cancelled = self::num($summary, ['cancelled_parcel', 'cancel', 'cancelled']);
            $returned = self::num($summary, ['returned_parcel', 'returned']);
        } else {
            $total = array_sum(array_column($couriers, 'total'));
            $delivered = array_sum(array_column($couriers, 'delivered'));
            $cancelled = array_sum(array_column($couriers, 'cancelled'));
            $returned = array_sum(array_column($couriers, 'returned'));
        }
        return [
            'total' => $total, 'delivered' => $delivered, 'cancelled' => $cancelled, 'returned' => $returned,
            'success_rate' => $total > 0 ? round($delivered / $total * 100, 1) : 0,
            'couriers' => array_values(array_filter($couriers, static fn ($c) => $c['total'] > 0 || $c['name'] !== '')),
        ];
    }

    private static function rowToData(array $row): array
    {
        return [
            'id' => (int) $row['id'], 'total' => (int) $row['total'], 'delivered' => (int) $row['delivered'],
            'cancelled' => (int) $row['cancelled'], 'returned' => (int) $row['returned'], 'success_rate' => (float) $row['success_rate'],
            'couriers' => json_decode((string) $row['couriers'], true) ?: [], 'checked_at' => $row['checked_at'],
        ];
    }
}
