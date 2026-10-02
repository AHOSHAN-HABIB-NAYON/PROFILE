<?php
final class AdminCourierController extends AdminController
{
    public function index(): void
    {
        View::admin('couriers', ['accounts' => CourierManager::accounts()], 'কুরিয়ার', 'couriers');
    }

    public function save(string $code): void
    {
        if (!isset(CourierManager::REGISTRY[$code])) {
            Response::notFound();
        }
        CourierManager::sync();
        $acc = DB::one('SELECT * FROM courier_accounts WHERE code = ?', [$code]);
        $extra = json_decode((string) $acc['extra'], true) ?: [];
        foreach (array_keys(CourierManager::REGISTRY[$code]['fields']) as $f) {
            $v = Request::str('extra_' . $f);
            // Password-type fields keep their stored value when left blank.
            if ($v !== '' || $f !== 'password') {
                $extra[$f] = $v;
            }
        }
        unset($extra['_token'], $extra['_token_exp']);
        $data = [
            'base_url' => Request::str('base_url') ?: null, 'extra' => json_encode($extra, JSON_UNESCAPED_UNICODE),
            'is_enabled' => (int) Request::bool('is_enabled'), 'is_default' => (int) Request::bool('is_default'),
        ];
        if ($data['base_url'] && !filter_var($data['base_url'], FILTER_VALIDATE_URL)) {
            Response::fail('সঠিক Base URL দিন।');
        }
        // Secrets are write-only from the UI: blank = keep the stored value.
        if (Request::str('api_key') !== '') $data['api_key'] = Request::str('api_key');
        if (Request::str('secret_key') !== '') $data['secret_key'] = Request::str('secret_key');
        if ($data['is_default']) {
            DB::run('UPDATE courier_accounts SET is_default = 0');
        }
        DB::update('courier_accounts', $data, 'code = ?', [$code]);
        Response::ok(null, CourierManager::REGISTRY[$code]['name'] . ' সেটিংস সংরক্ষিত হয়েছে।');
    }

    public function test(string $code): void
    {
        if (!isset(CourierManager::REGISTRY[$code])) {
            Response::notFound();
        }
        $r = CourierManager::test($code);
        $r['ok'] ? Response::ok(null, $r['message']) : Response::fail($r['message']);
    }

    public function fraud(): void
    {
        $recent = DB::all('SELECT f.*, o.order_code FROM fraud_checks f LEFT JOIN orders o ON o.id = f.order_id ORDER BY f.id DESC LIMIT 30');
        $risky = DB::all("SELECT id, order_code, customer_name, phone, total, status, risk_level, created_at FROM orders
            WHERE deleted_at IS NULL AND risk_level IN ('high','review') ORDER BY id DESC LIMIT 20");
        View::admin('fraud', ['recent' => $recent, 'risky' => $risky, 'configured' => BDCourierService::configured()], 'ফ্রড চেক', 'fraud');
    }

    public function fraudCheck(): void
    {
        $phone = normalize_phone(Request::str('phone'));
        if (!$phone) {
            Response::fail('সঠিক ফোন নম্বর দিন।');
        }
        $r = FraudService::evaluate($phone, null, Request::bool('force'));
        $r['html'] = View::render('admin/views/partials/fraud-result', ['r' => $r, 'phone' => $phone]);
        Response::ok($r, 'চেক সম্পন্ন হয়েছে।');
    }

    public function blocked(): void
    {
        $items = DB::all("SELECT b.*, (b.block_type = 'lifetime' OR b.blocked_until > NOW()) active,
            (SELECT COUNT(*) FROM orders o WHERE o.ip = b.ip) orders FROM blocked_ips b ORDER BY b.created_at DESC LIMIT 300");
        View::admin('blocked-ips', ['items' => $items], 'ব্লকড IP', 'blocked-ips');
    }

    public function block(): void
    {
        $ip = Request::str('ip');
        if (!filter_var($ip, FILTER_VALIDATE_IP)) {
            Response::fail('সঠিক IP ঠিকানা দিন।', ['ip' => 'অবৈধ IP']);
        }
        $type = Request::str('block_type') === 'lifetime' ? 'lifetime' : 'temporary';
        IpGuard::block($ip, Request::str('reason') ?: 'ম্যানুয়াল ব্লক', $type, max(1, Request::int('hours', 72)));
        Response::ok(null, 'IP ব্লক করা হয়েছে।');
    }

    public function unblock(string $id): void
    {
        IpGuard::unblock($this->id($id));
        Response::ok(null, 'IP আনব্লক করা হয়েছে।');
    }
}
