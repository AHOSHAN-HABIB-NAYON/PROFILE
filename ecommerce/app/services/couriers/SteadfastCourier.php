<?php
/**
 * Steadfast Courier (Packzy merchant API v1).
 * API docs are available in the Steadfast merchant panel → API section.
 */
final class SteadfastCourier extends AbstractCourier
{
    public function slug(): string
    {
        return 'steadfast';
    }

    public function name(): string
    {
        return 'Steadfast';
    }

    public function icon(): string
    {
        return 'fa-solid fa-truck-fast';
    }

    public function description(): string
    {
        return 'Create parcels, check delivery status and balance with Steadfast Courier.';
    }

    public function capabilities(): array
    {
        return [self::CAP_CREATE, self::CAP_STATUS, self::CAP_TRACK, self::CAP_BALANCE];
    }

    public function credentialFields(): array
    {
        return [
            'api_key'    => ['label' => 'API Key', 'placeholder' => 'Api-Key'],
            'secret_key' => ['label' => 'Secret Key', 'placeholder' => 'Secret-Key'],
        ];
    }

    public function settingFields(): array
    {
        return ['base_url' => ['label' => 'API Base URL', 'placeholder' => 'https://portal.packzy.com/api/v1', 'default' => 'https://portal.packzy.com/api/v1']];
    }

    private function headers(): array
    {
        return ['Api-Key: ' . $this->cred('api_key'), 'Secret-Key: ' . $this->cred('secret_key')];
    }

    private function endpoint(string $path): string
    {
        return rtrim($this->opt('base_url'), '/') . $path;
    }

    public function testConnection(): CourierResult
    {
        $r = $this->balance();
        return $r->ok ? CourierResult::ok('Connected. ' . $r->message, $r->data) : $r;
    }

    public function createOrder(array $parcel): CourierResult
    {
        if ($missing = $this->requireCreds(['api_key', 'secret_key'])) {
            return $missing;
        }
        $res = $this->http('POST', $this->endpoint('/create_order'), [
            'headers' => $this->headers(),
            'json' => [
                'invoice'           => $parcel['invoice'],
                'recipient_name'    => $parcel['name'],
                'recipient_phone'   => $parcel['phone'],
                'recipient_address' => mb_substr($parcel['address'] . ', ' . $parcel['district'], 0, 250),
                'cod_amount'        => (float)$parcel['amount'],
                'note'              => mb_substr((string)$parcel['note'], 0, 250),
                'item_description'  => mb_substr((string)$parcel['description'], 0, 250),
            ],
        ]);
        $j = $res['json'] ?? [];
        $c = $j['consignment'] ?? null;
        if ($res['status'] !== 200 || (int)($j['status'] ?? 0) !== 200 || !is_array($c)) {
            return CourierResult::fail('Steadfast: ' . $this->apiError($res), $j);
        }
        return CourierResult::ok('Parcel created on Steadfast.', [
            'consignment_id' => (string)($c['consignment_id'] ?? ''),
            'tracking_code'  => (string)($c['tracking_code'] ?? ''),
            'status'         => (string)($c['status'] ?? 'in_review'),
        ], $j);
    }

    public function checkStatus(array $courierOrder): CourierResult
    {
        if ($missing = $this->requireCreds(['api_key', 'secret_key'])) {
            return $missing;
        }
        $path = $courierOrder['consignment_id']
            ? '/status_by_cid/' . rawurlencode($courierOrder['consignment_id'])
            : '/status_by_trackingcode/' . rawurlencode((string)$courierOrder['tracking_code']);
        $res = $this->http('GET', $this->endpoint($path), ['headers' => $this->headers()]);
        $j = $res['json'] ?? [];
        if ($res['status'] !== 200 || !isset($j['delivery_status'])) {
            return CourierResult::fail('Steadfast: ' . $this->apiError($res), $j);
        }
        return CourierResult::ok('Status updated.', ['status' => (string)$j['delivery_status']], $j);
    }

    public function trackingUrl(array $courierOrder): ?string
    {
        return $courierOrder['tracking_code'] ? 'https://steadfast.com.bd/t/' . rawurlencode($courierOrder['tracking_code']) : null;
    }

    public function balance(): CourierResult
    {
        if ($missing = $this->requireCreds(['api_key', 'secret_key'])) {
            return $missing;
        }
        $res = $this->http('GET', $this->endpoint('/get_balance'), ['headers' => $this->headers(), 'timeout' => 15]);
        $j = $res['json'] ?? [];
        if ($res['status'] !== 200 || !isset($j['current_balance'])) {
            return CourierResult::fail('Steadfast: ' . $this->apiError($res), $j);
        }
        return CourierResult::ok('Balance: ৳' . $j['current_balance'], ['balance' => (float)$j['current_balance']]);
    }
}
