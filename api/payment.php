<?php
/**
 * Orders & payments API.
 *   create_order – Buy Now
 *   submit       – submit TXID + screenshot (or pay from balance)
 *   cancel       – cancel an unpaid order
 */
defined('APP') || exit;

if (!is_post()) fail(t('err.bad_request'), 405);
$action = input('action');
$u = user();
if (!$u) fail(t('err.login_required'), 401, [], ['redirect' => url('/login?next=' . rawurlencode(parse_url((string)($_SERVER['HTTP_REFERER'] ?? '/'), PHP_URL_PATH) ?: '/'))]);
$uid = (int)$u['id'];

switch ($action) {

case 'create_order':
    rate_limit('order:' . $uid, 20, 3600);
    $p = row('SELECT p.*, s.orderable, s.status AS s_status FROM products p LEFT JOIN services s ON s.id = p.service_id WHERE p.slug = ? AND p.status = 1', [input('product')]);
    if (!$p || (isset($p['s_status']) && (int)$p['s_status'] !== 1) || (isset($p['orderable']) && !(int)$p['orderable'])) fail(t('pay.product_unavailable'), 404);
    $hours = max(0, (int)setting('payment.order_expiry_hours', 24));
    $existing = $hours ? val("SELECT code FROM orders WHERE user_id = ? AND product_id = ? AND status = 'pending_payment' AND created_at > NOW() - INTERVAL ? HOUR ORDER BY id DESC LIMIT 1", [$uid, $p['id'], $hours]) : null;
    if ($existing) ok('', ['redirect' => url('/payment/' . $existing)]);
    do { $code = 'ORD-' . random_code(8); } while (val('SELECT 1 FROM orders WHERE code = ?', [$code]));
    insert('orders', [
        'code' => $code, 'user_id' => $uid, 'product_id' => $p['id'], 'product_name' => mb_substr(loc($p, 'name'), 0, 190),
        'amount_usd' => product_price($p, 'USD'), 'amount_bdt' => product_price($p, 'BDT'),
    ]);
    ok(t('pay.order_created'), ['redirect' => url('/payment/' . $code)]);

case 'submit':
    rate_limit('pay-submit:' . $uid, 10, 3600);
    $o = row('SELECT * FROM orders WHERE code = ? AND user_id = ?', [strtoupper(input('order')), $uid]);
    if (!$o) fail(t('err.not_found'), 404);
    if (!in_array($o['status'], ['pending_payment', 'rejected'], true) || val("SELECT 1 FROM payments WHERE order_id = ? AND status = 'pending'", [$o['id']])) fail(t('pay.already_submitted'));
    $method = input('method');
    $note = mb_substr(input('note'), 0, 1000) ?: null;

    // ----- pay from account balance (instant, atomic) -----
    if ($method === 'balance') {
        if (!setting_bool('payment.allow_balance')) fail(t('pay.method_unavailable'));
        $ok = transaction(function () use ($uid, $o, $note) {
            $bal = (float)val('SELECT balance FROM users WHERE id = ? FOR UPDATE', [$uid]);
            $amt = (float)$o['amount_usd'];
            if ($bal + 1e-9 < $amt) return false;
            $after = round($bal - $amt, 2);
            q('UPDATE users SET balance = ? WHERE id = ?', [$after, $uid]);
            insert('balance_transactions', ['user_id' => $uid, 'type' => 'debit', 'amount' => $amt, 'balance_after' => $after, 'reason' => 'Order #' . $o['code'], 'reference' => $o['code']]);
            insert('payments', ['order_id' => $o['id'], 'user_id' => $uid, 'method' => 'balance', 'txid' => 'BAL-' . $o['code'] . '-' . time(), 'amount' => $amt,
                'currency' => 'USD', 'note' => $note, 'status' => 'approved', 'reviewed_at' => date('Y-m-d H:i:s')]);
            q("UPDATE orders SET status = 'approved' WHERE id = ?", [$o['id']]);
            return true;
        });
        if (!$ok) fail(t('pay.insufficient_balance'));
        notify_users([$uid], ['type' => 'payment', 'icon' => 'fa-circle-check', 'link' => '/payment/' . $o['code'],
            'title_en' => 'Payment approved — #' . $o['code'], 'title_bn' => 'পেমেন্ট অনুমোদিত — #' . $o['code'],
            'body_en' => $o['product_name'] . ' · paid from balance', 'body_bn' => $o['product_name'] . ' · ব্যালেন্স থেকে পরিশোধিত']);
        notify_staff('orders', ['type' => 'order', 'icon' => 'fa-bag-shopping', 'link' => '/admin/orders?q=' . $o['code'],
            'title_en' => 'New paid order #' . $o['code'], 'title_bn' => 'নতুন পেইড অর্ডার #' . $o['code'], 'body_en' => $u['name'] . ' · ' . $o['product_name'], 'body_bn' => $u['name'] . ' · ' . $o['product_name']]);
        ok(t('pay.paid_balance'), ['reload' => true]);
    }

    // ----- manual methods -----
    $m = row('SELECT * FROM payment_methods WHERE code = ? AND enabled = 1', [$method]);
    if (!$m) fail(t('pay.choose_method'), 422);
    $txid = preg_replace('~\s+~', '', input('txid'));
    $amount = (float)str_replace(',', '', input('amount'));
    $errors = [];
    if (!preg_match('~^[A-Za-z0-9._:\-]{4,191}$~', $txid)) $errors['txid'] = t('pay.bad_txid');
    if ($amount <= 0 || $amount > 100000000) $errors['amount'] = t('pay.bad_amount');
    if (empty($_FILES['screenshot']['name'])) $errors['screenshot'] = t('pay.screenshot_required');
    if ($errors) fail(t('err.check_form'), 422, $errors);
    if (val('SELECT 1 FROM payments WHERE method = ? AND txid = ?', [$method, $txid])) fail(t('pay.txid_used'), 422, ['txid' => t('pay.txid_used')]);

    require_once ROOT . '/core/upload.php';
    try {
        $f = store_upload($_FILES['screenshot'], 'private_image', ['max_dim' => 1600, 'webp' => true, 'target_percent' => 40]);
    } catch (RuntimeException $e) {
        fail($e->getMessage(), 422, ['screenshot' => $e->getMessage()]);
    }
    $currency = $m['currency'] === 'BDT' ? 'BDT' : 'USD';
    try {
        $pid = insert('payments', ['order_id' => $o['id'], 'user_id' => $uid, 'method' => $method, 'txid' => $txid, 'amount' => $amount,
            'currency' => $currency, 'screenshot' => $f['path'], 'note' => $note]);
    } catch (PDOException $e) {
        @unlink(ROOT . '/storage/private/' . $f['path']);
        if ($e->getCode() === '23000') fail(t('pay.txid_used'), 422, ['txid' => t('pay.txid_used')]);
        throw $e;
    }
    q("UPDATE orders SET status = 'payment_submitted' WHERE id = ?", [$o['id']]);

    $expected = $currency === 'BDT' ? (float)$o['amount_bdt'] : (float)$o['amount_usd'];
    notify_users([$uid], ['type' => 'payment', 'icon' => 'fa-hourglass-half', 'link' => '/payment/' . $o['code'],
        'title_en' => 'Payment received — under review', 'title_bn' => 'পেমেন্ট গ্রহণ করা হয়েছে — যাচাই চলছে',
        'body_en' => '#' . $o['code'] . ' · ' . money($amount, $currency), 'body_bn' => '#' . $o['code'] . ' · ' . money($amount, $currency)], ['push' => false]);
    send_mail($u['email'], 'payment_received', ['name' => $u['name'], 'link' => abs_url('/payment/' . $o['code']),
        'detail' => '#' . $o['code'] . ' · ' . $o['product_name'] . "\n" . $m['name'] . ' · ' . money($amount, $currency) . "\nTXID: " . $txid], $u['lang'] ?: null);
    notify_staff('payments', ['type' => 'payment', 'icon' => 'fa-money-bill-transfer', 'link' => '/admin/payments?status=pending',
        'title_en' => 'New payment to review — #' . $o['code'], 'title_bn' => 'যাচাইয়ের জন্য নতুন পেমেন্ট — #' . $o['code'],
        'body_en' => $u['name'] . ' · ' . $m['name'] . ' · ' . money($amount, $currency) . (abs($amount - $expected) > 0.009 ? ' (expected ' . money($expected, $currency) . ')' : ''),
        'body_bn' => $u['name'] . ' · ' . $m['name'] . ' · ' . money($amount, $currency)],
        'admin_alert', ['subject' => 'New payment #' . $o['code'], 'heading' => 'New payment to review', 'body' => $u['name'] . ' submitted ' . money($amount, $currency) . ' via ' . $m['name'] . ' (TXID ' . $txid . ').',
            'link' => abs_url('/admin/payments?status=pending')]);
    ok(t('pay.submitted'), ['reload' => true]);

case 'cancel':
    $o = row("SELECT * FROM orders WHERE code = ? AND user_id = ? AND status = 'pending_payment'", [strtoupper(input('order')), $uid]);
    if (!$o) fail(t('pay.cannot_cancel'));
    q("UPDATE orders SET status = 'cancelled' WHERE id = ?", [$o['id']]);
    ok(t('pay.order_cancelled'), ['reload' => true]);

default:
    fail(t('err.bad_request'), 400);
}
