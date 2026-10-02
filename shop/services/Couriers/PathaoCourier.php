<?php
/**
 * Pathao Merchant (Aladdin) API.
 * api_key = client_id, secret_key = client_secret, extra: username, password, store_id, city_id?, zone_id?
 */
final class PathaoCourier extends BaseCourier
{
    private function url(string $path): string
    {
        return $this->base('https://api-hermes.pathao.com') . $path;
    }

    private function token(): ?string
    {
        if (!empty($this->extra['_token']) && (int) ($this->extra['_token_exp'] ?? 0) > time() + 60) {
            return $this->extra['_token'];
        }
        $res = Http::post($this->url('/aladdin/api/v1/issue-token'), [
            'client_id' => $this->account['api_key'], 'client_secret' => $this->account['secret_key'],
            'username' => $this->extra['username'] ?? '', 'password' => $this->extra['password'] ?? '', 'grant_type' => 'password',
        ], [], 15);
        $t = $res['json']['access_token'] ?? null;
        if (!$t) {
            Logger::courier('Pathao token failed', ['status' => $res['status'], 'message' => $this->errorFrom($res)]);
            return null;
        }
        $this->extra['_token'] = $t;
        $this->extra['_token_exp'] = time() + (int) ($res['json']['expires_in'] ?? 3600);
        DB::update('courier_accounts', ['extra' => json_encode($this->extra, JSON_UNESCAPED_UNICODE)], 'id = ?', [$this->account['id']]);
        return $t;
    }

    private function headers(): ?array
    {
        $t = $this->token();
        return $t ? ['Authorization' => 'Bearer ' . $t, 'Content-Type' => 'application/json'] : null;
    }

    public function test(): array
    {
        $h = $this->headers();
        if (!$h) {
            return ['ok' => false, 'message' => 'টোকেন পাওয়া যায়নি — Client ID/Secret/Username/Password যাচাই করুন।'];
        }
        $res = Http::get($this->url('/aladdin/api/v1/stores'), $h, 10);
        return $res['ok'] ? ['ok' => true, 'message' => 'সংযোগ সফল।'] : ['ok' => false, 'message' => 'সংযোগ ব্যর্থ: ' . $this->errorFrom($res)];
    }

    public function send(array $s): array
    {
        $h = $this->headers();
        if (!$h) {
            return ['ok' => false, 'message' => 'Pathao টোকেন পাওয়া যায়নি।'];
        }
        $body = array_filter([
            'store_id' => (int) ($this->extra['store_id'] ?? 0), 'merchant_order_id' => $s['invoice'],
            'recipient_name' => $s['name'], 'recipient_phone' => $s['phone'],
            'recipient_address' => mb_substr($s['address'] . ', ' . $s['district'], 0, 220),
            'recipient_city' => !empty($this->extra['city_id']) ? (int) $this->extra['city_id'] : null,
            'recipient_zone' => !empty($this->extra['zone_id']) ? (int) $this->extra['zone_id'] : null,
            'delivery_type' => 48, 'item_type' => 2, 'item_quantity' => max(1, (int) $s['items_count']),
            'item_weight' => (string) ($s['weight'] ?? '0.5'), 'amount_to_collect' => (int) round($s['amount']),
            'special_instruction' => mb_substr((string) $s['note'], 0, 200), 'item_description' => mb_substr((string) ($s['description'] ?? ''), 0, 200),
        ], static fn ($v) => $v !== null && $v !== '');
        $res = Http::post($this->url('/aladdin/api/v1/orders'), $body, $h, 20);
        $d = $res['json']['data'] ?? null;
        if ($res['ok'] && !empty($d['consignment_id'])) {
            return ['ok' => true, 'message' => 'Pathao-তে পাঠানো হয়েছে।', 'consignment_id' => (string) $d['consignment_id'],
                'tracking_code' => (string) $d['consignment_id'], 'reference' => (string) ($d['merchant_order_id'] ?? $s['invoice']),
                'status' => (string) ($d['order_status'] ?? 'Pending'), 'raw' => $res['json']];
        }
        return ['ok' => false, 'message' => 'Pathao: ' . $this->errorFrom($res), 'raw' => $res['json'] ?? []];
    }

    public function status(array $co): array
    {
        $h = $this->headers();
        if (!$h) {
            return ['ok' => false, 'message' => 'Pathao টোকেন পাওয়া যায়নি।'];
        }
        $res = Http::get($this->url('/aladdin/api/v1/orders/' . rawurlencode((string) $co['consignment_id']) . '/info'), $h, 10);
        $st = $res['json']['data']['order_status'] ?? null;
        return $res['ok'] && $st ? ['ok' => true, 'message' => 'স্ট্যাটাস আপডেট হয়েছে।', 'status' => (string) $st, 'raw' => $res['json']] : ['ok' => false, 'message' => 'Pathao: ' . $this->errorFrom($res)];
    }
}
