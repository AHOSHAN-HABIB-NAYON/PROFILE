<?php
/** RedX OpenAPI. api_key = access token; extra: delivery_area, delivery_area_id, pickup_store_id? */
final class RedxCourier extends BaseCourier
{
    private function url(string $path): string
    {
        return $this->base('https://openapi.redx.com.bd/v1.0.0-beta') . $path;
    }

    private function headers(): array
    {
        return ['API-ACCESS-TOKEN' => 'Bearer ' . $this->account['api_key'], 'Content-Type' => 'application/json'];
    }

    public function test(): array
    {
        $res = Http::get($this->url('/areas'), $this->headers(), 10);
        return $res['ok'] ? ['ok' => true, 'message' => 'সংযোগ সফল।'] : ['ok' => false, 'message' => 'সংযোগ ব্যর্থ: ' . $this->errorFrom($res)];
    }

    public function send(array $s): array
    {
        $body = array_filter([
            'customer_name' => $s['name'], 'customer_phone' => $s['phone'],
            'delivery_area' => (string) ($this->extra['delivery_area'] ?? $s['district']),
            'delivery_area_id' => !empty($this->extra['delivery_area_id']) ? (int) $this->extra['delivery_area_id'] : null,
            'customer_address' => mb_substr($s['address'] . ', ' . $s['district'], 0, 250),
            'merchant_invoice_id' => $s['invoice'], 'cash_collection_amount' => (string) round($s['amount']),
            'parcel_weight' => (int) (($s['weight'] ?? 0.5) * 1000), 'instruction' => mb_substr((string) $s['note'], 0, 200),
            'value' => (string) round($s['amount']), 'is_closed_box' => false,
            'pickup_store_id' => !empty($this->extra['pickup_store_id']) ? (int) $this->extra['pickup_store_id'] : null,
            'parcel_details_json' => [],
        ], static fn ($v) => $v !== null && $v !== '');
        $res = Http::post($this->url('/parcel'), $body, $this->headers(), 20);
        $tid = $res['json']['tracking_id'] ?? null;
        if ($res['ok'] && $tid) {
            return ['ok' => true, 'message' => 'RedX-এ পাঠানো হয়েছে।', 'consignment_id' => (string) $tid, 'tracking_code' => (string) $tid,
                'reference' => $s['invoice'], 'status' => 'pickup-pending', 'raw' => $res['json']];
        }
        return ['ok' => false, 'message' => 'RedX: ' . $this->errorFrom($res), 'raw' => $res['json'] ?? []];
    }

    public function status(array $co): array
    {
        $res = Http::get($this->url('/parcel/info/' . rawurlencode((string) $co['consignment_id'])), $this->headers(), 10);
        $st = $res['json']['parcel']['status'] ?? null;
        return $res['ok'] && $st ? ['ok' => true, 'message' => 'স্ট্যাটাস আপডেট হয়েছে।', 'status' => (string) $st, 'raw' => $res['json']] : ['ok' => false, 'message' => 'RedX: ' . $this->errorFrom($res)];
    }
}
