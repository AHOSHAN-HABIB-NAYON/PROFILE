<?php
/**
 * RedX open API (v1.0.0-beta).
 */
final class RedxCourier extends AbstractCourier
{
    public function slug(): string
    {
        return 'redx';
    }

    public function name(): string
    {
        return 'RedX';
    }

    public function icon(): string
    {
        return 'fa-solid fa-box';
    }

    public function description(): string
    {
        return 'Create RedX parcels and fetch parcel status/tracking.';
    }

    public function capabilities(): array
    {
        return [self::CAP_CREATE, self::CAP_STATUS, self::CAP_TRACK];
    }

    public function credentialFields(): array
    {
        return ['api_token' => ['label' => 'API Access Token', 'placeholder' => 'eyJ…']];
    }

    public function settingFields(): array
    {
        return [
            'base_url'      => ['label' => 'API Base URL', 'placeholder' => 'https://openapi.redx.com.bd/v1.0.0-beta', 'default' => 'https://openapi.redx.com.bd/v1.0.0-beta'],
            'area_id'       => ['label' => 'Default Delivery Area ID', 'placeholder' => '1', 'default' => ''],
            'area_name'     => ['label' => 'Default Delivery Area Name', 'placeholder' => 'Mohammadpur', 'default' => ''],
            'pickup_store'  => ['label' => 'Pickup Store ID (optional)', 'placeholder' => '', 'default' => ''],
        ];
    }

    private function headers(): array
    {
        return ['API-ACCESS-TOKEN: Bearer ' . $this->cred('api_token')];
    }

    private function endpoint(string $path): string
    {
        return rtrim($this->opt('base_url'), '/') . $path;
    }

    public function testConnection(): CourierResult
    {
        if ($missing = $this->requireCreds(['api_token'])) {
            return $missing;
        }
        $res = $this->http('GET', $this->endpoint('/areas'), ['headers' => $this->headers(), 'timeout' => 15]);
        return $res['status'] === 200 ? CourierResult::ok('Connected to RedX.') : CourierResult::fail('RedX: ' . $this->apiError($res));
    }

    public function createOrder(array $parcel): CourierResult
    {
        if ($missing = $this->requireCreds(['api_token'])) {
            return $missing;
        }
        if ($this->opt('area_id') === '') {
            return CourierResult::fail('RedX default delivery area ID is not configured.');
        }
        $body = array_filter([
            'customer_name'          => $parcel['name'],
            'customer_phone'         => $parcel['phone'],
            'delivery_area'          => $this->opt('area_name') ?: $parcel['district'],
            'delivery_area_id'       => (int)$this->opt('area_id'),
            'customer_address'       => mb_substr($parcel['address'] . ', ' . $parcel['district'], 0, 250),
            'merchant_invoice_id'    => $parcel['invoice'],
            'cash_collection_amount' => (string)round($parcel['amount']),
            'parcel_weight'          => (int)round(max(0.5, (float)$parcel['weight_kg']) * 1000),
            'instruction'            => mb_substr((string)$parcel['note'], 0, 200),
            'value'                  => (int)round($parcel['amount']),
            'pickup_store_id'        => $this->opt('pickup_store') !== '' ? (int)$this->opt('pickup_store') : null,
        ], static fn($v) => $v !== null && $v !== '');
        $res = $this->http('POST', $this->endpoint('/parcel'), ['headers' => $this->headers(), 'json' => $body]);
        $j = $res['json'] ?? [];
        if (!in_array($res['status'], [200, 201], true) || empty($j['tracking_id'])) {
            return CourierResult::fail('RedX: ' . $this->apiError($res), $j);
        }
        return CourierResult::ok('Parcel created on RedX.', [
            'consignment_id' => (string)$j['tracking_id'], 'tracking_code' => (string)$j['tracking_id'], 'status' => 'pickup-pending',
        ], $j);
    }

    public function checkStatus(array $courierOrder): CourierResult
    {
        $res = $this->http('GET', $this->endpoint('/parcel/info/' . rawurlencode((string)$courierOrder['tracking_code'])), ['headers' => $this->headers()]);
        $j = $res['json'] ?? [];
        $status = $j['parcel']['status'] ?? null;
        if ($res['status'] !== 200 || $status === null) {
            return CourierResult::fail('RedX: ' . $this->apiError($res), $j);
        }
        return CourierResult::ok('Status updated.', ['status' => (string)$status], $j);
    }

    public function trackingUrl(array $courierOrder): ?string
    {
        return $courierOrder['tracking_code'] ? 'https://redx.com.bd/track-parcel/?trackingId=' . rawurlencode($courierOrder['tracking_code']) : null;
    }
}
