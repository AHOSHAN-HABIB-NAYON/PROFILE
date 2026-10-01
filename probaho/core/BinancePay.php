<?php
/**
 * Binance Pay merchant integration (payment method only — never used for login).
 * API key/secret are stored encrypted server-side and never sent to the browser.
 *
 * Modes:
 *   api    — Binance Pay Merchant API (create order, QR/checkout, webhook + query)
 *   manual — user pays to the configured Binance Pay ID and submits the Binance
 *            Order ID; an admin verifies and approves it.
 */
declare(strict_types=1);

final class BinancePay
{
    private const BASE = 'https://bpay.binanceapi.com';

    public static function enabled(): bool
    {
        return setting_on('binance_enabled');
    }

    public static function mode(): string
    {
        $mode = (string) setting('binance_mode', 'manual');
        if ($mode === 'api' && (setting('binance_api_key') === '' || setting('binance_api_secret') === '')) {
            return 'manual';
        }
        return $mode === 'api' ? 'api' : 'manual';
    }

    private static function call(string $path, array $body): array
    {
        $json = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $ts = (string) round(microtime(true) * 1000);
        $nonce = random_code(32, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
        $sig = strtoupper(hash_hmac('sha512', $ts . "\n" . $nonce . "\n" . $json . "\n", (string) setting('binance_api_secret')));
        $res = Http::post(self::BASE . $path, $json, [
            'Content-Type: application/json',
            'BinancePay-Timestamp: ' . $ts,
            'BinancePay-Nonce: ' . $nonce,
            'BinancePay-Certificate-SN: ' . setting('binance_api_key'),
            'BinancePay-Signature: ' . $sig,
        ]);
        if (($res['json']['status'] ?? '') !== 'SUCCESS') {
            Logger::write('BINANCE', 'API error ' . $path, ['http' => $res['status'], 'body' => mb_substr($res['body'], 0, 500), 'err' => $res['error']]);
        }
        return $res['json'] ?? [];
    }

    public static function newTradeNo(): string
    {
        return 'PB' . date('ymdHis') . random_code(8, '0123456789');
    }

    private static function createLocal(array $user, float $amount, string $mode, ?string $binanceOrderId = null): array
    {
        $tradeNo = self::newTradeNo();
        $cur = (string) setting('binance_currency', 'USDT');
        $tx = Wallet::createPendingDeposit((int) $user['id'], $amount, 'binance_pay', $binanceOrderId ?: $tradeNo, 'Binance Pay দিয়ে জমা', ['merchant_trade_no' => $tradeNo, 'mode' => $mode]);
        $paymentId = db()->insert('payments', [
            'user_id' => $user['id'], 'transaction_id' => $tx['id'], 'method_code' => 'binance_pay', 'amount' => $amount,
            'currency' => $cur, 'status' => 'pending', 'provider_ref' => $tradeNo,
        ]);
        $id = db()->insert('binance_pay_orders', [
            'user_id' => $user['id'], 'payment_id' => $paymentId, 'transaction_id' => $tx['id'], 'mode' => $mode,
            'merchant_trade_no' => $tradeNo, 'binance_order_id' => $binanceOrderId, 'amount' => $amount, 'currency' => $cur,
            'expire_at' => $mode === 'api' ? date('Y-m-d H:i:s', time() + max(5, (int) setting('binance_expire_minutes', '30')) * 60) : null,
        ]);
        return db()->row('SELECT * FROM binance_pay_orders WHERE id = ?', [$id]);
    }

    /** Create an API order and return the local order row. */
    public static function createApiOrder(array $user, float $amount): array
    {
        $order = self::createLocal($user, $amount, 'api');
        $expireMs = (int) (strtotime((string) $order['expire_at']) * 1000);
        $res = self::call('/binancepay/openapi/v3/order', [
            'env' => ['terminalType' => 'WEB'],
            'merchantTradeNo' => $order['merchant_trade_no'],
            'orderAmount' => round($amount, 2),
            'currency' => $order['currency'],
            'description' => mb_substr(setting('site_name', 'Probaho') . ' wallet deposit', 0, 250),
            'goodsDetails' => [[
                'goodsType' => '02', 'goodsCategory' => 'Z000',
                'referenceGoodsId' => 'WALLET-' . $user['uid'], 'goodsName' => 'Wallet top-up',
            ]],
            'returnUrl' => abs_url('/payment/binance-pay/' . $order['merchant_trade_no']),
            'cancelUrl' => abs_url('/payment/binance-pay/' . $order['merchant_trade_no']),
            'webhookUrl' => abs_url('/payment/binance-pay/webhook'),
            'orderExpireTime' => $expireMs,
        ]);
        if (($res['status'] ?? '') === 'SUCCESS' && !empty($res['data']['prepayId'])) {
            $d = $res['data'];
            db()->update('binance_pay_orders', [
                'prepay_id' => (string) $d['prepayId'],
                'checkout_url' => $d['checkoutUrl'] ?? null,
                'qrcode_link' => $d['qrcodeLink'] ?? null,
                'qr_content' => $d['qrContent'] ?? null,
                'deeplink' => $d['deeplink'] ?? null,
                'universal_url' => $d['universalUrl'] ?? null,
                'raw_response' => json_encode($d, JSON_UNESCAPED_SLASHES),
            ], 'id = ?', [$order['id']]);
        } else {
            self::settle($order, 'failed', 'Binance Pay অর্ডার তৈরি করা যায়নি।');
            throw new DomainException('এই মুহূর্তে Binance Pay অর্ডার তৈরি করা যাচ্ছে না। কিছুক্ষণ পর আবার চেষ্টা করুন।');
        }
        return db()->row('SELECT * FROM binance_pay_orders WHERE id = ?', [$order['id']]);
    }

    /** Manual mode: user already paid to our Pay ID and submits the Binance order id. */
    public static function createManualOrder(array $user, float $amount, string $binanceOrderId): array
    {
        if (db()->val('SELECT 1 FROM binance_pay_orders WHERE binance_order_id = ?', [$binanceOrderId])) {
            throw new DomainException('এই Binance Order ID আগে জমা দেওয়া হয়েছে।');
        }
        $order = self::createLocal($user, $amount, 'manual', $binanceOrderId);
        Notify::user((int) $user['id'], 'payment', 'Binance Pay জমা যাচাই হচ্ছে', money($amount) . ' জমার অনুরোধ পাওয়া গেছে। যাচাই শেষে ব্যালেন্স যোগ হবে।', '/payment/binance-pay/' . $order['merchant_trade_no'], ['push' => false]);
        return $order;
    }

    /** Apply a final status to an order (idempotent). */
    public static function settle(array $order, string $status, ?string $reason = null): void
    {
        if ($order['status'] !== 'pending') {
            return;
        }
        db()->update('binance_pay_orders', ['status' => $status, 'paid_at' => $status === 'success' ? now() : null], "id = ? AND status = 'pending'", [$order['id']]);
        if ($order['payment_id']) {
            db()->update('payments', ['status' => $status], 'id = ?', [$order['payment_id']]);
        }
        if ($order['transaction_id']) {
            $status === 'success'
                ? Wallet::completeDeposit((int) $order['transaction_id'])
                : Wallet::failPending((int) $order['transaction_id'], $status, $reason);
        }
    }

    /** Ask Binance for the latest status (API mode). */
    public static function refresh(array $order): array
    {
        if ($order['mode'] !== 'api' || $order['status'] !== 'pending') {
            return $order;
        }
        if (self::mode() === 'api') {
            $res = self::call('/binancepay/openapi/v2/order/query', ['merchantTradeNo' => $order['merchant_trade_no']]);
            $remote = (string) ($res['data']['status'] ?? '');
            $map = ['PAID' => 'success', 'CANCELED' => 'cancelled', 'ERROR' => 'failed', 'EXPIRED' => 'expired'];
            if (isset($map[$remote])) {
                if ($remote === 'PAID' && !empty($res['data']['transactionId'])) {
                    db()->q('UPDATE binance_pay_orders SET binance_order_id = COALESCE(binance_order_id, ?) WHERE id = ?', [(string) $res['data']['transactionId'], $order['id']]);
                }
                self::settle($order, $map[$remote], 'Binance Pay: ' . $remote);
            }
        }
        if ($order['expire_at'] && strtotime((string) $order['expire_at']) < time() - 120) {
            $fresh = db()->row('SELECT * FROM binance_pay_orders WHERE id = ?', [$order['id']]);
            if ($fresh['status'] === 'pending') {
                self::settle($fresh, 'expired', 'পেমেন্টের সময়সীমা শেষ হয়েছে।');
            }
        }
        return db()->row('SELECT * FROM binance_pay_orders WHERE id = ?', [$order['id']]);
    }

    // ---------------------------------------------------------------- webhook

    private static function certificate(): ?array
    {
        $cacheFile = ROOT . '/storage/cache/binance-cert.json';
        if (is_file($cacheFile) && filemtime($cacheFile) > time() - 86400) {
            $c = json_decode((string) file_get_contents($cacheFile), true);
            if (!empty($c['certPublic'])) {
                return $c;
            }
        }
        $res = self::call('/binancepay/openapi/certificates', []);
        $cert = $res['data'][0] ?? null;
        if ($cert && !empty($cert['certPublic'])) {
            file_put_contents($cacheFile, json_encode($cert));
            return $cert;
        }
        return null;
    }

    public static function verifyWebhook(string $body, array $headers): bool
    {
        $ts = $headers['binancepay-timestamp'] ?? '';
        $nonce = $headers['binancepay-nonce'] ?? '';
        $sig = base64_decode($headers['binancepay-signature'] ?? '', true);
        $cert = self::certificate();
        if (!$ts || !$nonce || !$sig || !$cert) {
            return false;
        }
        $key = openssl_pkey_get_public((string) $cert['certPublic']);
        return $key && openssl_verify($ts . "\n" . $nonce . "\n" . $body . "\n", $sig, $key, OPENSSL_ALGO_SHA256) === 1;
    }

    public static function handleWebhook(array $payload): void
    {
        if (($payload['bizType'] ?? '') !== 'PAY') {
            return;
        }
        $data = is_string($payload['data'] ?? null) ? json_decode($payload['data'], true) : ($payload['data'] ?? []);
        $tradeNo = (string) ($data['merchantTradeNo'] ?? '');
        $order = db()->row('SELECT * FROM binance_pay_orders WHERE merchant_trade_no = ?', [$tradeNo]);
        if (!$order) {
            return;
        }
        if (!empty($data['transactionId'])) {
            db()->q('UPDATE binance_pay_orders SET binance_order_id = COALESCE(binance_order_id, ?) WHERE id = ?', [(string) $data['transactionId'], $order['id']]);
        }
        $biz = (string) ($payload['bizStatus'] ?? '');
        if ($biz === 'PAY_SUCCESS') {
            $paid = round((float) ($data['totalFee'] ?? $data['orderAmount'] ?? 0), 2);
            if ($paid + 0.001 < (float) $order['amount']) {
                Logger::write('BINANCE', 'Paid amount lower than order amount', ['order' => $tradeNo, 'paid' => $paid]);
                return;
            }
            self::settle($order, 'success');
        } elseif ($biz === 'PAY_CLOSED') {
            self::settle($order, 'expired', 'Binance Pay অর্ডার বন্ধ হয়েছে।');
        }
    }
}
