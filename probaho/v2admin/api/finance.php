<?php
/** /v2admin/api/finance/* — approve/reject, balance adjust, wallet freeze, Binance orders. */
declare(strict_types=1);

require_once ROOT . '/v2admin/lib.php';
admin_api('finance');

try {
    switch ($action) {
        case 'approve':
            $t = db()->row("SELECT * FROM transactions WHERE id = ? AND status = 'pending'", [input_int('id')]);
            if (!$t) {
                fail('লেনদেনটি আর অপেক্ষমাণ নেই।');
            }
            $note = input_str('note', 200) ?: null;
            $done = $t['type'] === 'deposit' ? Wallet::completeDeposit((int) $t['id'], $note) : Wallet::completeWithdraw((int) $t['id'], input_str('reference', 120), $note);
            if ($done) {
                db()->q("UPDATE payments SET status = 'success' WHERE transaction_id = ?", [$t['id']]);
                db()->q("UPDATE binance_pay_orders SET status = 'success', paid_at = NOW() WHERE transaction_id = ? AND status = 'pending'", [$t['id']]);
            }
            AdminAuth::log('tx.approve', $t['uid']);
            ok(['reload' => true], $done ? 'অনুমোদন সম্পন্ন ✓' : 'কোনো পরিবর্তন হয়নি');
            break;

        case 'reject':
            $t = db()->row("SELECT * FROM transactions WHERE id = ? AND status = 'pending'", [input_int('id')]);
            if (!$t) {
                fail('লেনদেনটি আর অপেক্ষমাণ নেই।');
            }
            $reason = input_str('reason', 200);
            if ($reason === '') {
                fail('প্রত্যাখ্যানের কারণ লিখুন।');
            }
            Wallet::failPending((int) $t['id'], 'failed', $reason);
            db()->q("UPDATE payments SET status = 'failed' WHERE transaction_id = ?", [$t['id']]);
            db()->q("UPDATE binance_pay_orders SET status = 'failed' WHERE transaction_id = ? AND status = 'pending'", [$t['id']]);
            AdminAuth::log('tx.reject', $t['uid'], ['reason' => $reason]);
            ok(['reload' => true], 'প্রত্যাখ্যান করা হয়েছে');
            break;

        case 'adjust':
            $amount = round((float) input('amount', 0), 2);
            $dir = input('direction') === 'debit' ? 'debit' : 'credit';
            $note = input_str('note', 200);
            $uid = input_int('user_id');
            if ($amount <= 0 || $note === '' || !db()->val('SELECT 1 FROM users WHERE id = ?', [$uid])) {
                fail('পরিমাণ ও কারণ সঠিকভাবে দিন।');
            }
            $r = Wallet::adjust($uid, $amount, $dir, $note);
            Notify::user($uid, 'payment', $dir === 'credit' ? 'ব্যালেন্স যোগ হয়েছে' : 'ব্যালেন্স সমন্বয়', ($dir === 'credit' ? '+' : '−') . money($amount) . ' — ' . $note, '/transaction/' . $r['uid']);
            AdminAuth::log('wallet.adjust', (string) $uid, ['amount' => $amount, 'dir' => $dir]);
            ok(['reload' => true], 'ব্যালেন্স আপডেট হয়েছে। নতুন ব্যালেন্স: ' . money($r['balance']));
            break;

        case 'wallet-status':
            $w = db()->row('SELECT * FROM wallets WHERE id = ?', [input_int('id')]);
            if (!$w) {
                fail('ওয়ালেট পাওয়া যায়নি।', 404);
            }
            $new = $w['status'] === 'active' ? 'frozen' : 'active';
            db()->q('UPDATE wallets SET status = ? WHERE id = ?', [$new, $w['id']]);
            Notify::user((int) $w['user_id'], 'security', $new === 'frozen' ? 'ওয়ালেট সাময়িকভাবে বন্ধ' : 'ওয়ালেট আবার চালু', $new === 'frozen' ? 'নিরাপত্তার কারণে আপনার ওয়ালেট সাময়িকভাবে বন্ধ করা হয়েছে। সাপোর্টে যোগাযোগ করুন।' : 'আপনার ওয়ালেট আবার সক্রিয় করা হয়েছে।', '/wallet');
            AdminAuth::log('wallet.' . $new, (string) $w['id']);
            ok(['reload' => true], 'ওয়ালেট আপডেট হয়েছে');
            break;

        case 'binance-approve':
        case 'binance-reject':
            $o = db()->row("SELECT * FROM binance_pay_orders WHERE id = ? AND status = 'pending'", [input_int('id')]);
            if (!$o) {
                fail('অর্ডারটি আর অপেক্ষমাণ নেই।');
            }
            $approve = $action === 'binance-approve';
            BinancePay::settle($o, $approve ? 'success' : 'failed', $approve ? null : 'Binance পেমেন্ট যাচাই করা যায়নি।');
            AdminAuth::log('binance.' . ($approve ? 'approve' : 'reject'), $o['merchant_trade_no']);
            ok(['reload' => true], $approve ? 'অনুমোদন সম্পন্ন — ব্যালেন্স যোগ হয়েছে ✓' : 'অর্ডার প্রত্যাখ্যান করা হয়েছে');
            break;

        case 'binance-refresh':
            $o = db()->row('SELECT * FROM binance_pay_orders WHERE id = ?', [input_int('id')]);
            if (!$o) {
                fail('অর্ডার পাওয়া যায়নি।', 404);
            }
            $o = BinancePay::refresh($o);
            ok(['reload' => true], 'স্ট্যাটাস: ' . $o['status']);
            break;
    }
} catch (DomainException $e) {
    fail($e->getMessage());
}
