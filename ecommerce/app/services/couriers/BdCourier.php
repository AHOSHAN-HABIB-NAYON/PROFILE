<?php
/**
 * BD Courier (api.bdcourier.com) — courier history / fraud check aggregator.
 *
 * Endpoint used: POST {base}/courier-check?phone=01XXXXXXXXX
 * Header:        Authorization: Bearer <API token>
 * It returns per-courier parcel history (Pathao, Steadfast, RedX, Paperfly…)
 * and a summary with success ratio. It is a lookup service: parcel creation is
 * handled by the delivery courier plugins (Steadfast / Pathao / RedX).
 * The base URL is configurable in case the provider changes it.
 */
final class BdCourier extends AbstractCourier
{
    public function slug(): string
    {
        return 'bdcourier';
    }

    public function name(): string
    {
        return 'BD Courier';
    }

    public function icon(): string
    {
        return 'fa-solid fa-magnifying-glass-chart';
    }

    public function description(): string
    {
        return 'Customer courier history & fraud check across Bangladeshi couriers (api.bdcourier.com).';
    }

    public function capabilities(): array
    {
        return [self::CAP_FRAUD];
    }

    public function credentialFields(): array
    {
        return ['api_token' => ['label' => 'API Token', 'placeholder' => 'BDC_COURIER_API_TOKEN']];
    }

    public function settingFields(): array
    {
        return [
            'base_url'   => ['label' => 'API Base URL', 'placeholder' => 'https://api.bdcourier.com', 'default' => 'https://api.bdcourier.com'],
            'test_phone' => ['label' => 'Phone used for "Test connection"', 'placeholder' => '01XXXXXXXXX', 'default' => ''],
        ];
    }

    protected function cred(string $key): string
    {
        $v = parent::cred($key);
        if ($v === '' && $key === 'api_token' && defined('COURIER_API_TOKEN') && COURIER_API_TOKEN !== 'BDC_COURIER_API_TOKEN') {
            return (string)COURIER_API_TOKEN;
        }
        return $v;
    }

    public function testConnection(): CourierResult
    {
        $phone = normalize_phone($this->opt('test_phone')) ?? normalize_phone((string)setting('contact_phone'));
        if (!$phone) {
            return CourierResult::fail('Set a valid test phone number in the plugin settings first.');
        }
        $r = $this->fraudCheck($phone);
        return $r->ok ? CourierResult::ok('Connected. API responded with courier history.', $r->data) : $r;
    }

    public function fraudCheck(string $phone): CourierResult
    {
        if ($missing = $this->requireCreds(['api_token'])) {
            return $missing;
        }
        $phone = normalize_phone($phone);
        if (!$phone) {
            return CourierResult::fail('Invalid phone number.');
        }
        $url = rtrim($this->opt('base_url'), '/') . '/courier-check?phone=' . $phone;
        $res = $this->http('POST', $url, [
            'headers' => ['Authorization: Bearer ' . $this->cred('api_token')],
            'json' => ['phone' => $phone],
            'timeout' => 20,
        ]);
        $j = $res['json'];
        if ($res['status'] !== 200 || !is_array($j) || (isset($j['status']) && $j['status'] !== 'success' && $j['status'] !== true)) {
            return CourierResult::fail('BD Courier: ' . $this->apiError($res, 'Request failed'));
        }
        $data = $j['courierData'] ?? ($j['data'] ?? $j);
        $couriers = [];
        $summary = null;
        foreach ((array)$data as $key => $c) {
            if (!is_array($c)) {
                continue;
            }
            $row = [
                'name'      => (string)($c['name'] ?? ucfirst((string)$key)),
                'total'     => (int)($c['total_parcel'] ?? $c['total'] ?? 0),
                'success'   => (int)($c['success_parcel'] ?? $c['success'] ?? 0),
                'cancelled' => (int)($c['cancelled_parcel'] ?? $c['cancelled'] ?? 0),
                'ratio'     => isset($c['success_ratio']) ? (float)$c['success_ratio'] : null,
            ];
            if ($key === 'summary') {
                $summary = $row;
            } else {
                $couriers[] = $row;
            }
        }
        if ($summary === null) {
            $t = array_sum(array_column($couriers, 'total'));
            $s = array_sum(array_column($couriers, 'success'));
            $summary = ['name' => 'Summary', 'total' => $t, 'success' => $s, 'cancelled' => array_sum(array_column($couriers, 'cancelled')),
                'ratio' => $t > 0 ? round($s / $t * 100, 1) : null];
        }
        $reports = [];
        foreach ((array)($j['reports'] ?? []) as $rep) {
            if (is_array($rep)) {
                $reports[] = mb_substr((string)($rep['details'] ?? $rep['comment'] ?? $rep['message'] ?? ''), 0, 300);
            }
        }
        return CourierResult::ok('OK', ['summary' => $summary, 'couriers' => $couriers, 'reports' => array_filter($reports)]);
    }
}
