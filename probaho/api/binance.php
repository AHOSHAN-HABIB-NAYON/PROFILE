<?php
/** /api/binance/* — create Binance Pay orders and poll status. Secrets never leave the server. */
declare(strict_types=1);

require_post();
$u = api_user();

switch ($action) {
    case 'create':
        require_verified($u);
        if (!BinancePay::enabled()) {
            fail('Binance Pay এই মুহূর্তে বন্ধ আছে।');
        }
        $amount = input_money('amount');
        $min = (float) setting('binance_min', '1');
        $max = (float) setting('binance_max', '5000');
        if ($amount < $min || $amount > $max) {
            fail('পরিমাণ ' . $min . ' থেকে ' . $max . ' ' . setting('binance_currency', 'USDT') . '-এর মধ্যে হতে হবে।');
        }
        if (!RateLimit::hit('bp:' . $u['id'], 10, 3600)) {
            fail('অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।', 429);
        }
        try {
            if (BinancePay::mode() === 'api') {
                $order = BinancePay::createApiOrder($u, $amount);
            } else {
                $oid = preg_replace('/[^A-Za-z0-9_-]/', '', input_str('binance_order_id', 64));
                if (strlen((string) $oid) < 6) {
                    fail('সঠিক Binance Order ID দিন।');
                }
                $order = BinancePay::createManualOrder($u, $amount, (string) $oid);
            }
        } catch (DomainException $e) {
            fail($e->getMessage());
        }
        ok(['redirect' => url('/payment/binance-pay/' . $order['merchant_trade_no'])], BinancePay::mode() === 'api' ? 'অর্ডার তৈরি হয়েছে' : 'যাচাইয়ের জন্য জমা দেওয়া হয়েছে');
        break;

    case 'status':
        $o = db()->row('SELECT * FROM binance_pay_orders WHERE merchant_trade_no = ? AND user_id = ?', [input_str('trade', 40), $u['id']]);
        if (!$o) {
            fail('অর্ডার পাওয়া যায়নি।', 404);
        }
        if (RateLimit::hit('bp-status:' . $o['id'], 1, 4)) {
            $o = BinancePay::refresh($o);
        }
        ok(['status' => $o['status']]);
        break;
}
