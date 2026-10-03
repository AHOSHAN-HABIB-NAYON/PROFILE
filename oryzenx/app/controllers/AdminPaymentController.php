<?php
final class AdminPaymentController
{
    public function index(): void
    {
        $status = (string)input('status');
        $q = trim((string)input('q'));
        $where = '1=1'; $params = [];
        if (in_array($status, ['pending', 'approved', 'rejected', 'refunded'], true)) { $where .= ' AND p.status = ?'; $params[] = $status; }
        if ($q !== '') { $where .= ' AND (p.transaction_id LIKE ? OR u.email LIKE ? OR u.name LIKE ? OR o.order_no LIKE ?)'; array_push($params, "%$q%", "%$q%", "%$q%", "%$q%"); }
        $p = DB::paginate('p.*, u.name, u.email, o.order_no, o.service_title', "FROM payments p JOIN users u ON u.id = p.user_id JOIN orders o ON o.id = p.order_id WHERE $where ORDER BY (p.status = 'pending') DESC, p.id DESC", $params, input_int('page', 1), 25);
        $counts = array_column(DB::all('SELECT status, COUNT(*) c FROM payments GROUP BY status'), 'c', 'status');
        View::page('admin/payments', ['p' => $p, 'status' => $status, 'q' => $q, 'counts' => $counts, 'methods' => array_column(DB::all('SELECT code, name, logo FROM payment_methods'), null, 'code')],
            ['layout' => 'admin', 'title' => t('admin.payments'), 'nav' => 'payments', 'cache' => false]);
    }

    private function find(string $id): array
    {
        $pay = DB::row('SELECT p.*, u.name, u.email, u.phone, o.order_no, o.service_title, o.status AS order_status, o.note, o.id AS oid, r.name AS reviewer
            FROM payments p JOIN users u ON u.id = p.user_id JOIN orders o ON o.id = p.order_id LEFT JOIN users r ON r.id = p.reviewed_by WHERE p.id = ?', [(int)$id]);
        if (!$pay) throw new HttpException(t('error.404'), 404);
        return $pay;
    }

    public function show(string $id): void
    {
        $pay = $this->find($id);
        $method = Content::methodMap()[$pay['method_code']] ?? null;
        $others = (int)DB::val('SELECT COUNT(*) FROM payments WHERE user_id = ? AND id <> ?', [$pay['user_id'], $pay['id']]);
        View::page('admin/payment', ['pay' => $pay, 'method' => $method, 'others' => $others], ['layout' => 'admin', 'title' => t('admin.payment') . ' #' . $pay['id'], 'nav' => 'payments', 'cache' => false]);
    }

    public function update(string $id): void
    {
        $pay = $this->find($id);
        $status = (string)input('status');
        if (!in_array($status, ['pending', 'approved', 'rejected', 'refunded'], true)) fail(t('valid.in'));
        $orderStatus = (string)input('order_status');
        if (!in_array($orderStatus, ['pending', 'processing', 'completed', 'cancelled', 'refunded'], true)) {
            $orderStatus = ['approved' => 'processing', 'rejected' => 'cancelled', 'refunded' => 'refunded', 'pending' => 'pending'][$status];
        }
        $note = mb_substr((string)input('admin_note'), 0, 1000) ?: null;
        // Refunds go to the user's wallet balance (kept in USD). Undoing a refund takes it back.
        $credit = 0.0;
        if ($status === 'refunded' && $pay['status'] !== 'refunded') $credit = Wallet::toUsd((float)$pay['amount'], $pay['currency']);
        if ($pay['status'] === 'refunded' && $status !== 'refunded') $credit = -Wallet::toUsd((float)$pay['amount'], $pay['currency']);
        DB::tx(function () use ($pay, $status, $orderStatus, $note, $credit) {
            DB::q('UPDATE payments SET status = ?, admin_note = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?', [$status, $note, Auth::id(), $pay['id']]);
            DB::q('UPDATE orders SET status = ? WHERE id = ?', [$orderStatus, $pay['oid']]);
            if ($credit != 0.0) {
                Wallet::credit((int)$pay['user_id'], $credit);
                Wallet::log((int)$pay['user_id'], $credit > 0 ? 'refund' : 'adjust', abs($credit), ['note' => 'Payment #' . $pay['id'] . ($credit > 0 ? '' : ' refund reversed')]);
            }
        });
        if ($credit != 0.0) {
            Auth::activity('balance_' . ($credit > 0 ? 'refund' : 'refund_reversed'), "#{$pay['id']} " . money(abs($credit)), (int)$pay['user_id']);
            if ($credit > 0) $note = trim(($note ? $note . "\n" : '') . t('notif.refund_balance', ['amount' => money($credit)]));
        }
        if ($status !== $pay['status']) {
            $icons = ['approved' => 'fa-solid fa-circle-check', 'rejected' => 'fa-solid fa-circle-xmark', 'refunded' => 'fa-solid fa-rotate-left', 'pending' => 'fa-solid fa-hourglass-half'];
            Notifier::send([(int)$pay['user_id']], t('notif.payment_' . $status), t('notif.payment_status_text', ['s' => $pay['service_title'], 'status' => t('status.' . $status)]) . ($note ? "\n" . $note : ''),
                ['icon' => $icons[$status], 'link' => '/profile/payments/' . $pay['id'], 'priority' => 'high', 'email' => true, 'created_by' => Auth::id()]);
        }
        Auth::activity('admin_payment_' . $status, "#{$pay['id']}");
        respond(true, t('admin.payment_updated'), '/admin/payments/' . $pay['id']);
    }
}
