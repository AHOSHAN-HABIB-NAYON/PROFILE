<?php
declare(strict_types=1);
// Creates clearly labelled DEMO data (is_demo = 1). Refuses to run unless demo_mode is true in config.
// Usage: php bin/seed-demo.php
if (PHP_SAPI !== 'cli') { exit(1); }
require dirname(__DIR__) . '/app/bootstrap.php';

use OryzenX\Core\App;
use OryzenX\Core\Config;
use OryzenX\Core\Database;
use OryzenX\Core\Security;
use OryzenX\Services\InvestmentService;
use OryzenX\Services\LedgerService;
use OryzenX\Services\LoanService;
use OryzenX\Services\MarketService;
use OryzenX\Services\SalaryService;
use OryzenX\Services\SettingsService;
use OryzenX\Services\TradeService;

if (!Config::demoMode()) {
    fwrite(STDERR, "Refusing to seed: set 'demo_mode' => true in config/config.php first. Never seed production.\n");
    exit(1);
}
$db = App::get(Database::class);
(new OryzenX\Core\Migrator($db))->migrate();
$settings = App::get(SettingsService::class);
$settings->set('market_provider', 'simulated');
$now = Database::now();

function demoUser(Database $db, string $email, string $name, string $password, bool $admin): int {
    $id = $db->value('SELECT id FROM users WHERE email = :e', ['e' => $email]);
    if ($id) { return (int) $id; }
    $now = Database::now();
    $id = $db->insert('users', ['uuid' => Security::uuid(), 'email' => $email, 'password_hash' => password_hash($password, PASSWORD_DEFAULT),
        'full_name' => $name, 'status' => 'active', 'email_verified_at' => $now, 'identity_status' => 'approved', 'is_admin' => $admin ? 1 : 0,
        'is_demo' => 1, 'terms_accepted_at' => $now, 'password_changed_at' => $now, 'created_at' => $now, 'updated_at' => $now]);
    $db->insert('user_profiles', ['user_id' => $id, 'city' => 'Dhaka', 'country' => 'Bangladesh', 'updated_at' => $now]);
    $db->insert('notification_preferences', ['user_id' => $id, 'updated_at' => $now]);
    if ($admin) { $db->run('INSERT IGNORE INTO user_roles (user_id, role_id, created_at) SELECT :u, id, :n FROM roles WHERE slug = "super_admin"', ['u' => $id, 'n' => $now]); }
    return (int) $id;
}
$pw = getenv('DEMO_PASSWORD') ?: 'DemoPass2026!';
$admin = demoUser($db, 'admin@demo.oryzenx.local', 'Demo Administrator', $pw, true);
$user = demoUser($db, 'user@demo.oryzenx.local', 'Rahim Uddin (Demo)', $pw, false);
$user2 = demoUser($db, 'nadia@demo.oryzenx.local', 'Nadia Islam (Demo)', $pw, false);

App::get(MarketService::class)->refresh();
if ((int) $db->value('SELECT COUNT(*) FROM financial_transactions WHERE user_id = :u', ['u' => $user]) === 0) {
    $asset = fn (string $s) => (int) $db->value('SELECT id FROM assets WHERE symbol = :s', ['s' => $s]);
    $ago = fn (int $days) => gmdate('Y-m-d H:i:s', time() - $days * 86400);
    $L = App::get(LedgerService::class);
    $I = App::get(InvestmentService::class);
    $T = App::get(TradeService::class);
    $L->recordCashMovement($user, ['type' => 'deposit', 'amount' => '5000', 'effective_at' => $ago(60), 'reference' => 'DEMO-DEP-1', 'notes' => 'Demo deposit'], $admin);
    $L->recordCashMovement($user, ['type' => 'transfer', 'from' => 'cash', 'to' => 'trading', 'amount' => '1500', 'effective_at' => $ago(59)], $admin);
    $I->addEntry($user, ['asset_id' => $asset('SOL'), 'quantity' => '1', 'unit_price' => '106', 'fee_usd' => '0', 'acquired_at' => $ago(45), 'funding' => 'cash', 'notes' => 'Demo: 1 SOL at $106'], $admin);
    $I->addEntry($user, ['asset_id' => $asset('ETH'), 'quantity' => '0.5', 'unit_price' => '2950', 'fee_usd' => '2.5', 'acquired_at' => $ago(40), 'funding' => 'cash'], $admin);
    $I->addEntry($user, ['asset_id' => $asset('XRP'), 'quantity' => '800', 'unit_price' => '0.55', 'fee_usd' => '1', 'acquired_at' => $ago(30), 'funding' => 'cash'], $admin);
    $I->addEntry($user, ['asset_id' => $asset('PEPE'), 'quantity' => '20000000', 'unit_price' => '0.0000095', 'fee_usd' => '0.5', 'acquired_at' => $ago(20), 'funding' => 'cash'], $admin);
    $I->sell($user, ['asset_id' => $asset('XRP'), 'quantity' => '200', 'unit_price' => '0.62', 'fee_usd' => '0.4', 'sold_at' => $ago(10)], $admin);
    $T->record($user, ['asset_id' => $asset('SOL'), 'direction' => 'long', 'quantity' => '2', 'entry_price' => '140', 'exit_price' => '152', 'fee_usd' => '1.2', 'opened_at' => $ago(15), 'closed_at' => $ago(12), 'reference' => 'DEMO-T1'], $admin);
    $T->record($user, ['asset_id' => $asset('ETH'), 'direction' => 'short', 'quantity' => '0.3', 'entry_price' => '3300', 'exit_price' => '3350', 'fee_usd' => '1', 'opened_at' => $ago(8), 'closed_at' => $ago(6), 'reference' => 'DEMO-T2'], $admin);
    $T->record($user, ['asset_id' => $asset('SUI'), 'direction' => 'long', 'quantity' => '300', 'entry_price' => '1.70', 'fee_usd' => '0.8', 'opened_at' => $ago(2), 'reference' => 'DEMO-T3'], $admin);
    $T->record($user, ['asset_id' => $asset('SOL'), 'direction' => 'long', 'quantity' => '1', 'entry_price' => '148', 'exit_price' => '151', 'fee_usd' => '0.5', 'opened_at' => gmdate('Y-m-d H:i:s', time() - 7200), 'closed_at' => gmdate('Y-m-d H:i:s', time() - 600), 'reference' => 'DEMO-T4'], $admin);
    App::get(LoanService::class)->create($user, ['denomination' => 'COIN', 'asset_id' => $asset('SOL'), 'quantity' => '1', 'origination_price' => '106', 'credited_to' => 'holdings', 'loan_date' => $ago(44), 'reference' => 'DEMO-L1'], $admin);
    App::get(LoanService::class)->create($user, ['denomination' => 'USD', 'principal_usd' => '500', 'credited_to' => 'cash', 'loan_date' => $ago(25), 'interest_rate_pct' => '5'], $admin);
    $S = App::get(SalaryService::class);
    $S->upsertSchedule($user, ['amount' => '300', 'currency' => 'USD', 'pay_day' => 5, 'start_date' => gmdate('Y-m-01', strtotime('-3 months')), 'is_active' => true, 'payment_method_id' => (int) $db->value('SELECT id FROM payment_methods WHERE code = "bkash"')], $admin);
    foreach ([2, 1, 0] as $m) {
        $period = gmdate('Y-m', strtotime("first day of -$m month"));
        $S->generateForPeriod($period, $admin);
    }
    $recs = $db->all('SELECT id, period FROM salary_records WHERE user_id = :u ORDER BY period', ['u' => $user]);
    foreach (array_slice($recs, 0, 2) as $r) {
        $S->updateRecord((int) $r['id'], ['status' => 'paid', 'payment_date' => $r['period'] . '-05', 'reference' => 'DEMO-BK-' . str_replace('-', '', $r['period'])], $admin);
    }
    $L->recordCashMovement($user2, ['type' => 'deposit', 'amount' => '1200', 'effective_at' => $ago(10)], $admin);
    $I->addEntry($user2, ['asset_id' => $asset('ZEC'), 'quantity' => '10', 'unit_price' => '40', 'fee_usd' => '1', 'acquired_at' => $ago(9), 'funding' => 'cash'], $admin);
}
App::get(OryzenX\Services\PortfolioService::class)->snapshot($user);
echo "Demo data ready (DEMO accounts, simulated prices).\n  Admin: admin@demo.oryzenx.local\n  User:  user@demo.oryzenx.local\n  Password: (DEMO_PASSWORD env or the default in this script)\n";
