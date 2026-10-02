<?php
/** Steadfast (Packzy) API v1. */
final class SteadfastCourier extends BaseCourier
{
    private function headers(): array
    {
        return ['Api-Key' => (string) $this->account['api_key'], 'Secret-Key' => (string) $this->account['secret_key'], 'Content-Type' => 'application/json'];
    }

    private function url(string $path): string
    {
        return $this->base('https://portal.packzy.com/api/v1') . $path;
    }

    public function test(): array
    {
        $res = Http::get($this->url('/get_balance'), $this->headers(), 10);
        if ($res['ok'] && (int) ($res['json']['status'] ?? 0) === 200) {
            return ['ok' => true, 'message' => 'সংযোগ সফল। ব্যালেন্স: ৳' . ($res['json']['current_balance'] ?? 0)];
        }
        return ['ok' => false, 'message' => 'সংযোগ ব্যর্থ: ' . $this->errorFrom($res)];
    }

    public function send(array $s): array
    {
        $res = Http::post($this->url('/create_order'), [
            'invoice' => $s['invoice'], 'recipient_name' => $s['name'], 'recipient_phone' => $s['phone'],
            'recipient_address' => mb_substr($s['address'] . ', ' . $s['district'], 0, 250),
            'cod_amount' => (float) $s['amount'], 'note' => mb_substr((string) $s['note'], 0, 250),
        ], $this->headers(), 20);
        $c = $res['json']['consignment'] ?? null;
        if ($res['ok'] && (int) ($res['json']['status'] ?? 0) === 200 && $c) {
            return ['ok' => true, 'message' => 'Steadfast-এ পাঠানো হয়েছে।', 'consignment_id' => (string) $c['consignment_id'],
                'tracking_code' => (string) ($c['tracking_code'] ?? ''), 'reference' => (string) ($c['invoice'] ?? $s['invoice']),
                'status' => (string) ($c['status'] ?? 'in_review'), 'raw' => $res['json']];
        }
        return ['ok' => false, 'message' => 'Steadfast: ' . $this->errorFrom($res), 'raw' => $res['json'] ?? []];
    }

    public function status(array $co): array
    {
        $res = Http::get($this->url('/status_by_cid/' . rawurlencode((string) $co['consignment_id'])), $this->headers(), 10);
        if ($res['ok'] && isset($res['json']['delivery_status'])) {
            return ['ok' => true, 'message' => 'স্ট্যাটাস আপডেট হয়েছে।', 'status' => (string) $res['json']['delivery_status'], 'raw' => $res['json']];
        }
        return ['ok' => false, 'message' => 'Steadfast: ' . $this->errorFrom($res)];
    }
}
