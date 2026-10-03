<?php
final class PaymentController
{
    public function index(): void
    {
        $u = auth();
        $payments = $u ? DB::all('SELECT p.*, o.service_title, o.order_no FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.user_id = ? ORDER BY p.id DESC LIMIT 10', [$u['id']]) : [];
        $services = DB::all('SELECT slug, title, title_bn, icon, icon_color, icon_image, price, currency, price_plus FROM services WHERE is_active = 1 ORDER BY is_featured DESC, sort_order LIMIT 6');
        View::page('pages/payment/index', ['u' => $u, 'payments' => $payments, 'services' => $services, 'methods' => Content::paymentMethods()], [
            'title' => t('payment.title'), 'nav' => 'payment', 'css' => ['payment', 'profile'], 'cache' => false,
        ]);
    }

    private function service(string $slug): array
    {
        $s = DB::row('SELECT * FROM services WHERE slug = ? AND is_active = 1', [$slug]);
        if (!$s) throw new HttpException(t('error.404'), 404);
        return $s;
    }

    public function checkout(string $slug): void
    {
        $s = $this->service($slug);
        $u = DB::row('SELECT * FROM users WHERE id = ?', [Auth::id()]);
        View::page('pages/payment/checkout', ['s' => $s, 'u' => $u, 'methods' => Content::paymentMethods()], [
            'title' => t('payment.pay_for', ['s' => tr($s, 'title')]), 'nav' => 'payment', 'css' => ['payment'], 'cache' => false, 'noindex' => true,
        ]);
    }

    public function submit(string $slug): void
    {
        $s = $this->service($slug);
        $u = DB::row('SELECT * FROM users WHERE id = ?', [Auth::id()]);
        if (setting('require_verified_for_payment') === '1' && !$u['email_verified_at']) fail(t('payment.verify_first'));
        $code = (string)input('method');
        if ($code === 'balance') $this->payWithBalance($s, $u);
        $methods = array_column(Content::paymentMethods(), null, 'code');
        if (!isset($methods[$code])) fail(t('payment.choose_method'), ['method' => t('payment.choose_method')]);
        $txn = preg_replace('/\s+/', '', (string)input('transaction_id'));
        if (!preg_match('/^[A-Za-z0-9\-_.:#]{4,120}$/', $txn)) fail(t('payment.bad_txn'), ['transaction_id' => t('payment.bad_txn')]);
        $sender = null;
        if (!Upload::present('screenshot')) fail(t('payment.need_screenshot'), ['screenshot' => t('payment.need_screenshot')]);
        if (!RateLimit::hit('pay|' . $u['id'], 10, 3600)) fail(t('error.429'), [], 429);
        if (DB::val('SELECT 1 FROM payments WHERE method_code = ? AND transaction_id = ?', [$code, $txn])) fail(t('payment.dup_txn'), ['transaction_id' => t('payment.dup_txn')]);
        try {
            $shot = Upload::image('screenshot', 'payments', ['private' => true, 'max_mb' => (float)setting('max_screenshot_mb'), 'format' => 'webp', 'quality' => 82, 'max_width' => 1600]);
        } catch (UploadError $e) { fail($e->getMessage(), ['screenshot' => $e->getMessage()]); }

        [$price, $disc] = Offer::price($s, (int)$u['id']);
        $payId = DB::tx(function () use ($s, $u, $code, $txn, $sender, $shot, $price, $disc) {
            $orderNo = 'OZX' . date('ymd') . strtoupper(bin2hex(random_bytes(3)));
            $orderId = DB::insert('orders', ['order_no' => $orderNo, 'user_id' => $u['id'], 'service_id' => $s['id'], 'service_title' => $s['title'],
                'amount' => $price, 'currency' => $s['currency'], 'note' => mb_substr((string)input('note'), 0, 1000) ?: null]);
            $payId = DB::insert('payments', ['order_id' => $orderId, 'user_id' => $u['id'], 'method_code' => $code, 'amount' => $price, 'discount' => $disc, 'currency' => $s['currency'],
                'transaction_id' => $txn, 'sender' => $sender ?: null, 'screenshot' => $shot]);
            if ($disc > 0) Offer::markUsed((int)$u['id'], $payId);
            return $payId;
        });
        Auth::activity('payment_submitted', "#$payId {$s['title']}");
        $admins = DB::col("SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL");
        if ($admins) Notifier::send($admins, t('notif.new_payment'), $u['name'] . ' · ' . $s['title'] . ' · ' . money($price, $s['currency']) . ($disc > 0 ? ' (−' . money($disc, $s['currency']) . ')' : ''),
            ['icon' => 'fa-solid fa-wallet', 'link' => '/admin/payments/' . $payId, 'priority' => 'high']);
        Notifier::send([(int)$u['id']], t('notif.payment_received'), t('notif.payment_received_text', ['s' => $s['title']]), ['icon' => 'fa-solid fa-hourglass-half', 'link' => '/profile/payments/' . $payId, 'push' => false, 'email' => false]);
        respond(true, t('payment.submitted'), '/profile/payments/' . $payId);
    }

    /** Instant purchase from the wallet balance: no proof needed, the order starts right away. */
    private function payWithBalance(array $s, array $u): never
    {
        [$price, $disc] = Offer::price($s, (int)$u['id']);
        $usd = Wallet::toUsd($price, $s['currency']);
        if ($usd <= 0) fail(t('valid.numeric'));
        if (!RateLimit::hit('pay|' . $u['id'], 10, 3600)) fail(t('error.429'), [], 429);
        $payId = DB::tx(function () use ($s, $u, $usd, $price, $disc) {
            if (!Wallet::debit((int)$u['id'], $usd)) return 0;
            $orderNo = 'OZX' . date('ymd') . strtoupper(bin2hex(random_bytes(3)));
            $orderId = DB::insert('orders', ['order_no' => $orderNo, 'user_id' => $u['id'], 'service_id' => $s['id'], 'service_title' => $s['title'],
                'amount' => $price, 'currency' => $s['currency'], 'status' => 'processing']);
            $payId = DB::insert('payments', ['order_id' => $orderId, 'user_id' => $u['id'], 'method_code' => 'balance', 'amount' => $price, 'discount' => $disc, 'currency' => $s['currency'],
                'transaction_id' => 'BAL-' . $orderNo, 'status' => 'approved', 'reviewed_at' => now()]);
            if ($disc > 0) Offer::markUsed((int)$u['id'], $payId);
            Wallet::log((int)$u['id'], 'purchase', $usd, ['method_code' => 'balance', 'transaction_id' => 'BAL-' . $orderNo, 'note' => $s['title']]);
            return $payId;
        });
        if (!$payId) fail(t('wallet.insufficient'), ['method' => t('wallet.insufficient')]);
        Auth::activity('payment_submitted', "#$payId {$s['title']} (balance)");
        $admins = DB::col("SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL");
        if ($admins) Notifier::send($admins, t('notif.new_order_balance'), $u['name'] . ' · ' . $s['title'] . ' · ' . money($usd), ['icon' => 'fa-solid fa-cart-shopping', 'link' => '/admin/payments/' . $payId, 'priority' => 'high']);
        Notifier::send([(int)$u['id']], t('notif.payment_approved'), t('notif.paid_balance', ['s' => $s['title']]), ['icon' => 'fa-solid fa-circle-check', 'link' => '/profile/payments/' . $payId, 'push' => false]);
        respond(true, t('wallet.paid'), '/profile/payments/' . $payId);
    }
}
