<?php
/** Profile wallet: balance, deposit (manual payment + review) and withdraw requests. */
final class WalletController
{
    private function page(string $view, array $data, string $title): never
    {
        $u = DB::row('SELECT * FROM users WHERE id = ?', [Auth::id()]);
        View::page('pages/profile/' . $view, $data + ['u' => $u, 'tab' => 'wallet'], ['title' => $title, 'nav' => 'profile', 'css' => ['profile', 'payment'], 'cache' => false, 'noindex' => true]);
    }

    public function index(): void
    {
        $id = Auth::id();
        $p = DB::paginate('*', 'FROM wallet_transactions WHERE user_id = ? ORDER BY id DESC', [$id], input_int('page', 1), 15);
        $pending = DB::row("SELECT COALESCE(SUM(CASE WHEN type='deposit' THEN amount END),0) dep, COALESCE(SUM(CASE WHEN type='withdraw' THEN amount END),0) wd
            FROM wallet_transactions WHERE user_id = ? AND status = 'pending'", [$id]);
        $this->page('wallet', ['p' => $p, 'pending' => $pending], t('wallet.title'));
    }

    public function depositForm(): void
    {
        $this->page('wallet-deposit', ['methods' => Content::paymentMethods()], t('wallet.deposit'));
    }

    public function deposit(): void
    {
        $uid = (int)Auth::id();
        $amount = round((float)input('amount'), 2);
        if ($amount < 1 || $amount > 100000) fail(t('wallet.bad_amount'), ['amount' => t('wallet.bad_amount')]);
        $methods = array_column(Content::paymentMethods(), null, 'code');
        $code = (string)input('method');
        if (!isset($methods[$code])) fail(t('payment.choose_method'), ['method' => t('payment.choose_method')]);
        $txn = preg_replace('/\s+/', '', (string)input('transaction_id'));
        if (!preg_match('/^[A-Za-z0-9\-_.:#]{4,120}$/', $txn)) fail(t('payment.bad_txn'), ['transaction_id' => t('payment.bad_txn')]);
        if (!Upload::present('screenshot')) fail(t('payment.need_screenshot'), ['screenshot' => t('payment.need_screenshot')]);
        if (!RateLimit::hit('deposit|' . $uid, 10, 3600)) fail(t('error.429'), [], 429);
        if (DB::val("SELECT 1 FROM wallet_transactions WHERE type = 'deposit' AND method_code = ? AND transaction_id = ?", [$code, $txn])
            || DB::val('SELECT 1 FROM payments WHERE method_code = ? AND transaction_id = ?', [$code, $txn])) {
            fail(t('payment.dup_txn'), ['transaction_id' => t('payment.dup_txn')]);
        }
        try { $shot = Upload::image('screenshot', 'wallet', ['private' => true, 'max_mb' => (float)setting('max_screenshot_mb'), 'format' => 'webp', 'quality' => 82]); }
        catch (UploadError $e) { fail($e->getMessage(), ['screenshot' => $e->getMessage()]); }
        $id = Wallet::log($uid, 'deposit', $amount, ['method_code' => $code, 'transaction_id' => $txn, 'screenshot' => $shot], 'pending');
        $this->notifyAdmins(t('wallet.admin_new_deposit'), money($amount), $id);
        respond(true, t('wallet.deposit_sent'), '/profile/wallet');
    }

    public function withdrawForm(): void
    {
        $this->page('wallet-withdraw', ['methods' => DB::all('SELECT code, name, logo, type, network FROM payment_methods WHERE is_active = 1 ORDER BY sort_order')], t('wallet.withdraw'));
    }

    public function withdraw(): void
    {
        $uid = (int)Auth::id();
        $amount = round((float)input('amount'), 2);
        $min = max(1, (float)setting('wallet_min_withdraw', 5));
        if ($amount < $min) fail(t('wallet.min_withdraw', ['n' => money($min)]), ['amount' => t('wallet.min_withdraw', ['n' => money($min)])]);
        $code = (string)input('method');
        if (!DB::val('SELECT 1 FROM payment_methods WHERE code = ? AND is_active = 1', [$code])) fail(t('payment.choose_method'), ['method' => t('payment.choose_method')]);
        $account = trim((string)input('account'));
        if (mb_strlen($account) < 5 || mb_strlen($account) > 190) fail(t('wallet.bad_account'), ['account' => t('wallet.bad_account')]);
        if (!RateLimit::hit('withdraw|' . $uid, 5, 3600)) fail(t('error.429'), [], 429);
        // Funds are held immediately; a rejected request returns them.
        $id = DB::tx(function () use ($uid, $amount, $code, $account) {
            if (!Wallet::debit($uid, $amount)) return 0;
            return Wallet::log($uid, 'withdraw', $amount, ['method_code' => $code, 'account' => $account], 'pending');
        });
        if (!$id) fail(t('wallet.insufficient'), ['amount' => t('wallet.insufficient')]);
        $this->notifyAdmins(t('wallet.admin_new_withdraw'), money($amount), $id);
        respond(true, t('wallet.withdraw_sent'), '/profile/wallet');
    }

    private function notifyAdmins(string $title, string $amount, int $id): void
    {
        $u = auth();
        $admins = DB::col("SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL");
        if ($admins) Notifier::send($admins, $title, $u['name'] . ' · ' . $amount, ['icon' => 'fa-solid fa-wallet', 'link' => '/admin/wallet', 'priority' => 'high']);
    }
}
