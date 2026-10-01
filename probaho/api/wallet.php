<?php
/** /api/wallet/* — deposit request, withdraw, transfer, service payment, recipient lookup. */
declare(strict_types=1);

require_post();
$u = api_user();
$uid = (int) $u['id'];

$method = static function (string $code, string $direction): array {
    $m = db()->row("SELECT * FROM payment_methods WHERE code = ? AND is_active = 1 AND direction IN (?, 'both')", [$code, $direction]);
    if (!$m || $code === 'qr') {
        fail('পেমেন্ট মেথড নির্বাচন করুন।');
    }
    return $m;
};
$limits = static function (float $amount, float $min, float $max): void {
    if ($amount <= 0) {
        fail('সঠিক পরিমাণ লিখুন।');
    }
    if ($amount < $min || $amount > $max) {
        fail('পরিমাণ ' . money($min) . ' থেকে ' . money($max) . '-এর মধ্যে হতে হবে।');
    }
};

try {
    switch ($action) {
        case 'lookup':
            $q = trim((string) input('q', ''));
            $qq = str_contains($q, '@') ? mb_strtolower($q) : $q;
            $r = db()->row("SELECT id, name, uid FROM users WHERE status = 'active' AND (uid = ? OR email = ? OR phone = ?) LIMIT 1", [$qq, $qq, normalize_phone($q)]);
            if (!$r) {
                fail('এই তথ্যে কোনো ব্যবহারকারী পাওয়া যায়নি।', 404);
            }
            if ((int) $r['id'] === $uid) {
                fail('এটি আপনার নিজের অ্যাকাউন্ট।');
            }
            ok(['name' => $r['name'], 'uid' => $r['uid']]);
            break;

        case 'deposit':
            require_verified($u);
            $m = $method((string) input('method', ''), 'deposit');
            if ($m['code'] === 'binance_pay') {
                ok(['redirect' => url('/payment/binance-pay')]);
            }
            $amount = input_money('amount');
            $limits($amount, (float) $m['min_amount'], (float) $m['max_amount']);
            $ref = input_str('reference', 100);
            if (mb_strlen($ref) < 4) {
                fail('পেমেন্টের ট্রানজেকশন আইডি / রেফারেন্স দিন।');
            }
            if (db()->val("SELECT 1 FROM transactions WHERE type = 'deposit' AND method = ? AND reference = ? AND status IN ('pending','success')", [$m['code'], $ref])) {
                fail('এই রেফারেন্স আগেই জমা দেওয়া হয়েছে।');
            }
            if ((int) db()->val("SELECT COUNT(*) FROM transactions WHERE user_id = ? AND type = 'deposit' AND status = 'pending'", [$uid]) >= 5) {
                fail('আপনার ৫টি জমার অনুরোধ যাচাইয়ের অপেক্ষায় আছে। আগে সেগুলো সম্পন্ন হোক।');
            }
            $tx = Wallet::createPendingDeposit($uid, $amount, $m['code'], $ref, $m['name'] . ' দিয়ে জমা');
            db()->insert('payments', ['user_id' => $uid, 'transaction_id' => $tx['id'], 'method_code' => $m['code'], 'amount' => $amount, 'currency' => currency(), 'status' => 'pending', 'provider_ref' => $ref]);
            Notify::user($uid, 'payment', 'জমার অনুরোধ গ্রহণ করা হয়েছে', money($amount) . ' জমার অনুরোধ যাচাই করা হচ্ছে।', '/transaction/' . $tx['uid'], ['push' => false]);
            ok(['redirect' => url('/transaction/' . $tx['uid'])], 'জমার অনুরোধ পাঠানো হয়েছে');
            break;

        case 'withdraw':
            require_verified($u);
            if (!setting_on('withdraw_enabled')) {
                fail('উত্তোলন সাময়িকভাবে বন্ধ আছে।');
            }
            $m = $method((string) input('method', ''), 'withdraw');
            $amount = input_money('amount');
            $limits($amount, (float) $m['min_amount'], (float) $m['max_amount']);
            $account = input_str('account', 190);
            if (mb_strlen($account) < 3) {
                fail(($m['account_label'] ?: 'অ্যাকাউন্টের তথ্য') . ' লিখুন।');
            }
            if (!RateLimit::hit('withdraw:' . $uid, 10, 3600)) {
                fail('অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।', 429);
            }
            $tx = Wallet::requestWithdraw($uid, $amount, $m, $account);
            if (input_bool('save') && !db()->val('SELECT 1 FROM user_payment_methods WHERE user_id = ? AND method_code = ? AND account_ref = ?', [$uid, $m['code'], $account])) {
                db()->insert('user_payment_methods', ['user_id' => $uid, 'method_code' => $m['code'], 'label' => $m['name'], 'account_ref' => $account]);
            }
            ok(['redirect' => url('/transaction/' . $tx['uid'])], 'উত্তোলনের অনুরোধ গ্রহণ করা হয়েছে');
            break;

        case 'transfer':
            require_verified($u);
            if (!setting_on('transfer_enabled')) {
                fail('ট্রান্সফার সাময়িকভাবে বন্ধ আছে।');
            }
            $amount = input_money('amount');
            $limits($amount, (float) setting('transfer_min', '1'), (float) setting('transfer_max', '5000'));
            if ((int) $u['totp_enabled'] === 1 && setting_on('auth_2fa') && !Totp::verify(Crypto::decrypt($u['totp_secret']), input_str('otp', 10))) {
                fail('2FA কোড সঠিক নয়।');
            }
            if (!RateLimit::hit('transfer:' . $uid, 20, 3600)) {
                fail('অনেকবার ট্রান্সফার হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।', 429);
            }
            $q = trim((string) input('recipient', ''));
            $qq = str_contains($q, '@') ? mb_strtolower($q) : $q;
            $to = db()->row("SELECT id FROM users WHERE status = 'active' AND (uid = ? OR email = ? OR phone = ?) LIMIT 1", [$qq, $qq, normalize_phone($q)]);
            if (!$to) {
                fail('প্রাপক পাওয়া যায়নি। ইমেইল / মোবাইল / ইউজার আইডি যাচাই করুন।');
            }
            $r = Wallet::transfer($uid, (int) $to['id'], $amount, input_str('note', 120), input('via') === 'qr' ? 'qr' : 'wallet');
            ok(['redirect' => url('/transaction/' . $r['out'])], money($amount) . ' সফলভাবে পাঠানো হয়েছে ✓');
            break;

        case 'pay-service':
            require_verified($u);
            $s = db()->row('SELECT * FROM services WHERE id = ? AND is_active = 1', [input_int('service_id')]);
            if (!$s || (float) $s['price'] <= 0) {
                fail('সার্ভিসটি পাওয়া যায়নি।');
            }
            $tx = Wallet::payService($uid, $s, input_str('note', 500));
            ok(['redirect' => url('/transaction/' . $tx['uid'])], 'পেমেন্ট সফল হয়েছে ✓');
            break;

        case 'delete-saved':
            db()->q('DELETE FROM user_payment_methods WHERE id = ? AND user_id = ?', [input_int('id'), $uid]);
            ok([], 'মুছে ফেলা হয়েছে');
            break;
    }
} catch (DomainException $e) {
    fail($e->getMessage());
}
