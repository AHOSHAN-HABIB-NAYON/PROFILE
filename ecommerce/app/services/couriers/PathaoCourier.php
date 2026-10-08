<?php
/**
 * Pathao Courier merchant API (Aladdin v1). OAuth password grant; the access
 * token is cached encrypted on disk until shortly before expiry.
 */
final class PathaoCourier extends AbstractCourier
{
    public function slug(): string
    {
        return 'pathao';
    }

    public function name(): string
    {
        return 'Pathao';
    }

    public function icon(): string
    {
        return 'fa-solid fa-motorcycle';
    }

    public function description(): string
    {
        return 'Create Pathao parcels and track delivery status.';
    }

    public function capabilities(): array
    {
        return [self::CAP_CREATE, self::CAP_STATUS, self::CAP_TRACK];
    }

    public function credentialFields(): array
    {
        return [
            'client_id'     => ['label' => 'Client ID', 'placeholder' => ''],
            'client_secret' => ['label' => 'Client Secret', 'placeholder' => ''],
            'username'      => ['label' => 'Merchant Email', 'placeholder' => 'you@example.com'],
            'password'      => ['label' => 'Merchant Password', 'placeholder' => ''],
        ];
    }

    public function settingFields(): array
    {
        return [
            'base_url'  => ['label' => 'API Base URL', 'placeholder' => 'https://api-hermes.pathao.com', 'default' => 'https://api-hermes.pathao.com'],
            'store_id'  => ['label' => 'Store ID', 'placeholder' => '12345', 'default' => ''],
            'city_id'   => ['label' => 'Default City ID (optional)', 'placeholder' => '', 'default' => ''],
            'zone_id'   => ['label' => 'Default Zone ID (optional)', 'placeholder' => '', 'default' => ''],
        ];
    }

    private function endpoint(string $path): string
    {
        return rtrim($this->opt('base_url'), '/') . $path;
    }

    private function token(bool $fresh = false): ?string
    {
        $cacheKey = 'courier:pathao-token:' . md5($this->cred('client_id') . $this->cred('username'));
        if (!$fresh && ($enc = Cache::get($cacheKey))) {
            $t = Crypto::decrypt($enc);
            if ($t !== '') {
                return $t;
            }
        }
        $res = $this->http('POST', $this->endpoint('/aladdin/api/v1/issue-token'), ['json' => [
            'client_id' => $this->cred('client_id'), 'client_secret' => $this->cred('client_secret'),
            'username' => $this->cred('username'), 'password' => $this->cred('password'), 'grant_type' => 'password',
        ], 'timeout' => 15]);
        $token = $res['json']['access_token'] ?? null;
        if (!$token) {
            return null;
        }
        Cache::set($cacheKey, Crypto::encrypt($token), max(300, (int)($res['json']['expires_in'] ?? 3600) - 600));
        return $token;
    }

    public function testConnection(): CourierResult
    {
        if ($missing = $this->requireCreds(['client_id', 'client_secret', 'username', 'password'])) {
            return $missing;
        }
        return $this->token(true) ? CourierResult::ok('Connected — access token issued.') : CourierResult::fail('Pathao rejected the credentials.');
    }

    public function createOrder(array $parcel): CourierResult
    {
        if ($missing = $this->requireCreds(['client_id', 'client_secret', 'username', 'password'])) {
            return $missing;
        }
        if ($this->opt('store_id') === '') {
            return CourierResult::fail('Pathao Store ID is not configured.');
        }
        $token = $this->token();
        if (!$token) {
            return CourierResult::fail('Pathao authentication failed.');
        }
        $body = array_filter([
            'store_id'            => (int)$this->opt('store_id'),
            'merchant_order_id'   => $parcel['invoice'],
            'recipient_name'      => $parcel['name'],
            'recipient_phone'     => $parcel['phone'],
            'recipient_address'   => mb_substr($parcel['address'] . ', ' . $parcel['district'], 0, 220),
            'recipient_city'      => $this->opt('city_id') !== '' ? (int)$this->opt('city_id') : null,
            'recipient_zone'      => $this->opt('zone_id') !== '' ? (int)$this->opt('zone_id') : null,
            'delivery_type'       => 48,
            'item_type'           => 2,
            'special_instruction' => mb_substr((string)$parcel['note'], 0, 200),
            'item_quantity'       => max(1, (int)$parcel['quantity']),
            'item_weight'         => max(0.5, (float)$parcel['weight_kg']),
            'amount_to_collect'   => (int)round($parcel['amount']),
            'item_description'    => mb_substr((string)$parcel['description'], 0, 200),
        ], static fn($v) => $v !== null && $v !== '');
        $res = $this->http('POST', $this->endpoint('/aladdin/api/v1/orders'), ['headers' => ['Authorization: Bearer ' . $token], 'json' => $body]);
        $j = $res['json'] ?? [];
        if (!in_array($res['status'], [200, 201], true) || empty($j['data']['consignment_id'])) {
            return CourierResult::fail('Pathao: ' . $this->apiError($res), $j);
        }
        return CourierResult::ok('Parcel created on Pathao.', [
            'consignment_id' => (string)$j['data']['consignment_id'],
            'tracking_code'  => (string)$j['data']['consignment_id'],
            'status'         => (string)($j['data']['order_status'] ?? 'Pending'),
        ], $j);
    }

    public function checkStatus(array $courierOrder): CourierResult
    {
        $token = $this->token();
        if (!$token) {
            return CourierResult::fail('Pathao authentication failed.');
        }
        $res = $this->http('GET', $this->endpoint('/aladdin/api/v1/orders/' . rawurlencode((string)$courierOrder['consignment_id']) . '/info'), ['headers' => ['Authorization: Bearer ' . $token]]);
        $j = $res['json'] ?? [];
        $status = $j['data']['order_status'] ?? null;
        if ($res['status'] !== 200 || $status === null) {
            return CourierResult::fail('Pathao: ' . $this->apiError($res), $j);
        }
        return CourierResult::ok('Status updated.', ['status' => (string)$status], $j);
    }

    public function trackingUrl(array $courierOrder): ?string
    {
        return $courierOrder['consignment_id'] ? 'https://merchant.pathao.com/tracking?consignment_id=' . rawurlencode($courierOrder['consignment_id']) : null;
    }
}
