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
        $methods = array_column(Content::paymentMethods(), null, 'code');
        $code = (string)input('method');
        if (!isset($methods[$code])) fail(t('payment.choose_method'), ['method' => t('payment.choose_method')]);
        $txn = preg_replace('/\s+/', '', (string)input('transaction_id'));
        if (!preg_match('/^[A-Za-z0-9\-_.:#]{4,120}$/', $txn)) fail(t('payment.bad_txn'), ['transaction_id' => t('payment.bad_txn')]);
        $sender = mb_substr((string)input('sender'), 0, 190);
        if (!Upload::present('screenshot')) fail(t('payment.need_screenshot'), ['screenshot' => t('payment.need_screenshot')]);
        if (!RateLimit::hit('pay|' . $u['id'], 10, 3600)) fail(t('error.429'), [], 429);
        if (DB::val('SELECT 1 FROM payments WHERE method_code = ? AND transaction_id = ?', [$code, $txn])) fail(t('payment.dup_txn'), ['transaction_id' => t('payment.dup_txn')]);
        try {
            $shot = Upload::image('screenshot', 'payments', ['private' => true, 'max_mb' => (float)setting('max_screenshot_mb'), 'format' => 'webp', 'quality' => 82, 'max_width' => 1600]);
        } catch (UploadError $e) { fail($e->getMessage(), ['screenshot' => $e->getMessage()]); }

        $payId = DB::tx(function () use ($s, $u, $code, $txn, $sender, $shot) {
            $orderNo = 'OZX' . date('ymd') . strtoupper(bin2hex(random_bytes(3)));
            $orderId = DB::insert('orders', ['order_no' => $orderNo, 'user_id' => $u['id'], 'service_id' => $s['id'], 'service_title' => $s['title'],
                'amount' => $s['price'], 'currency' => $s['currency'], 'note' => mb_substr((string)input('note'), 0, 1000) ?: null]);
            return DB::insert('payments', ['order_id' => $orderId, 'user_id' => $u['id'], 'method_code' => $code, 'amount' => $s['price'], 'currency' => $s['currency'],
                'transaction_id' => $txn, 'sender' => $sender ?: null, 'screenshot' => $shot]);
        });
        Auth::activity('payment_submitted', "#$payId {$s['title']}");
        $admins = DB::col("SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL");
        if ($admins) Notifier::send($admins, t('notif.new_payment'), $u['name'] . ' · ' . $s['title'] . ' · ' . money($s['price'], $s['currency']),
            ['icon' => 'fa-solid fa-wallet', 'link' => '/admin/payments/' . $payId, 'priority' => 'high']);
        Notifier::send([(int)$u['id']], t('notif.payment_received'), t('notif.payment_received_text', ['s' => $s['title']]), ['icon' => 'fa-solid fa-hourglass-half', 'link' => '/profile/payments/' . $payId, 'push' => false]);
        respond(true, t('payment.submitted'), '/profile/payments/' . $payId);
    }
}
