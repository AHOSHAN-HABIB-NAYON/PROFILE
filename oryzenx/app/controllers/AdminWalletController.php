<?php
final class AdminWalletController
{
    public function index(): void
    {
        $type = (string)input('type');
        $status = (string)input('status');
        $where = "w.type IN ('deposit','withdraw')"; $params = [];
        if (in_array($type, ['deposit', 'withdraw'], true)) { $where .= ' AND w.type = ?'; $params[] = $type; }
        if (in_array($status, ['pending', 'approved', 'rejected'], true)) { $where .= ' AND w.status = ?'; $params[] = $status; }
        $p = DB::paginate('w.*, u.name, u.email, u.balance', "FROM wallet_transactions w JOIN users u ON u.id = w.user_id WHERE $where ORDER BY (w.status = 'pending') DESC, w.id DESC", $params, input_int('page', 1), 25);
        View::page('admin/wallet', ['p' => $p, 'type' => $type, 'status' => $status, 'methods' => Content::methodMap()],
            ['layout' => 'admin', 'title' => t('wallet.admin_title'), 'nav' => 'wallet', 'cache' => false]);
    }

    public function update(string $id): void
    {
        $w = DB::row("SELECT * FROM wallet_transactions WHERE id = ? AND type IN ('deposit','withdraw')", [(int)$id]);
        if (!$w) throw new HttpException(t('error.404'), 404);
        if ($w['status'] !== 'pending') fail(t('wallet.already_reviewed'));
        $action = (string)input('action');
        if (!in_array($action, ['approve', 'reject'], true)) fail(t('valid.in'));
        $note = mb_substr((string)input('admin_note'), 0, 1000) ?: null;
        $status = $action === 'approve' ? 'approved' : 'rejected';
        DB::tx(function () use ($w, $status, $note) {
            DB::q('UPDATE wallet_transactions SET status = ?, admin_note = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?', [$status, $note, Auth::id(), $w['id']]);
            if ($w['type'] === 'deposit' && $status === 'approved') Wallet::credit((int)$w['user_id'], (float)$w['amount']);
            if ($w['type'] === 'withdraw' && $status === 'rejected') Wallet::credit((int)$w['user_id'], (float)$w['amount']); // release the hold
        });
        $key = 'wallet.' . $w['type'] . '_' . $status;
        Notifier::send([(int)$w['user_id']], t($key), money($w['amount']) . ($note ? "\n" . $note : ''),
            ['icon' => $status === 'approved' ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-xmark', 'link' => '/profile/wallet', 'priority' => 'high', 'email' => true, 'created_by' => Auth::id()]);
        Auth::activity('admin_wallet_' . $w['type'] . '_' . $status, "#{$w['id']}");
        respond(true, t('common.saved'), '/admin/wallet');
    }
}
