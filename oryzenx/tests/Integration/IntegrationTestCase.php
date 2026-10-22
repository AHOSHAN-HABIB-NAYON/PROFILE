<?php
declare(strict_types=1);

namespace OryzenX\Tests\Integration;

use OryzenX\Core\App;
use OryzenX\Core\Database;
use OryzenX\Core\Request;
use OryzenX\Core\Response;
use OryzenX\Core\Security;
use OryzenX\Services\HttpClient;
use OryzenX\Services\Market\MarketDataException;
use OryzenX\Services\Market\MarketDataProvider;
use OryzenX\Services\MarketService;
use PHPUnit\Framework\TestCase;

/**
 * Base class: each test runs against the real MariaDB/MySQL test database. Financial tables are
 * truncated between tests; reference data (roles, assets, payment methods) is kept.
 */
abstract class IntegrationTestCase extends TestCase
{
    protected Database $db;
    protected static int $seq = 0;
    /** @var array<string,string> symbol => price for the fixed test price provider */
    protected array $prices = [];

    protected function setUp(): void
    {
        App::reset();
        $this->db = Database::instance();
        App::set(Database::class, $this->db);
        $this->db->pdo()->exec('SET FOREIGN_KEY_CHECKS=0');
        foreach (['ledger_entries', 'financial_transactions', 'investment_entries', 'investment_positions', 'investment_sales', 'trades', 'loans', 'loan_repayments',
                     'salary_records', 'salary_schedules', 'profit_allocations', 'profit_allocation_lines', 'notifications', 'email_queue', 'email_logs', 'push_tokens',
                     'push_logs', 'support_requests', 'rate_limits', 'cache_items', 'user_sessions', 'login_history', 'verification_tokens', 'password_reset_tokens',
                     'user_verifications', 'admin_audit_logs', 'user_payment_details', 'market_price_snapshots', 'asset_latest_prices', 'portfolio_snapshots',
                     'scheduled_task_logs', 'user_roles', 'user_profiles', 'notification_preferences', 'users'] as $t) {
            $this->db->pdo()->exec("TRUNCATE TABLE `$t`");
        }
        $this->db->pdo()->exec('SET FOREIGN_KEY_CHECKS=1');
        $this->db->run('UPDATE app_settings SET value = "1" WHERE setting_key IN ("registration_open", "require_identity_verification")');
        $this->db->run('DELETE FROM app_settings WHERE setting_key IN ("smtp_enabled","smtp_host","smtp_from_email","market_last_attempt_at","market_last_success_at","market_last_error","reminder_enabled","fcm_enabled")');
        $this->useFixedPrices([]);
        HttpClient::$fake = null;
    }

    protected function tearDown(): void
    {
        HttpClient::$fake = null;
    }

    /** Installs a deterministic price provider and stores the given prices as the latest snapshot. */
    protected function useFixedPrices(array $prices): void
    {
        $this->prices = $prices;
        $test = $this;
        $provider = new class ($test) implements MarketDataProvider {
            public function __construct(private IntegrationTestCase $t) {}
            public function id(): string { return 'coingecko'; }
            public function label(): string { return 'Test provider'; }
            public function quoteNote(): string { return 'test'; }
            public function prices(array $assets): array
            {
                $out = [];
                foreach ($assets as $a) {
                    if (isset($this->t->currentPrices()[$a['symbol']])) {
                        $out[$a['symbol']] = ['price' => $this->t->currentPrices()[$a['symbol']], 'change_24h' => '0', 'source_updated_at' => gmdate('Y-m-d H:i:s')];
                    }
                }
                if (!$out && $this->t->currentPrices() === ['__fail__' => '1']) {
                    throw new MarketDataException('Provider down');
                }
                return $out;
            }
            public function ohlc(array $asset, string $range): array { throw new MarketDataException('no ohlc in tests'); }
        };
        App::get(MarketService::class)->setProvider($provider);
        if ($prices) {
            App::get(MarketService::class)->refresh();
        }
    }

    public function currentPrices(): array
    {
        return $this->prices;
    }

    protected function setPrice(string $symbol, string $price): void
    {
        $this->prices[$symbol] = $price;
        App::get(MarketService::class)->refresh();
    }

    protected function assetId(string $symbol): int
    {
        return (int) $this->db->value('SELECT id FROM assets WHERE symbol = :s', ['s' => $symbol]);
    }

    protected function createUser(array $over = []): int
    {
        self::$seq++;
        $now = Database::now();
        $id = $this->db->insert('users', array_merge([
            'uuid' => Security::uuid(),
            'email' => 'user' . self::$seq . '@example.test',
            'password_hash' => password_hash('Password1234', PASSWORD_DEFAULT),
            'full_name' => 'Test User ' . self::$seq,
            'status' => 'active',
            'email_verified_at' => $now,
            'identity_status' => 'approved',
            'is_admin' => 0,
            'created_at' => $now,
            'updated_at' => $now,
        ], $over));
        $this->db->insert('notification_preferences', ['user_id' => $id, 'updated_at' => $now]);
        $this->db->insert('user_profiles', ['user_id' => $id, 'updated_at' => $now]);
        return $id;
    }

    protected function createAdmin(string $role = 'super_admin'): int
    {
        $id = $this->createUser(['is_admin' => 1]);
        $this->db->run('INSERT INTO user_roles (user_id, role_id, created_at) SELECT :u, id, :n FROM roles WHERE slug = :r', ['u' => $id, 'n' => Database::now(), 'r' => $role]);
        return $id;
    }

    protected function deposit(int $userId, string $amount, string $to = 'cash'): void
    {
        App::get(\OryzenX\Services\LedgerService::class)->recordCashMovement($userId, ['type' => 'deposit', 'amount' => $amount, 'to' => $to], null);
    }

    /** Creates an API (bearer) session for the user and returns the token. */
    protected function token(int $userId): string
    {
        $req = $this->request('GET', '/');
        [$token] = App::get(\OryzenX\Services\AuthService::class)->createSession($userId, $req, 'api', 'phpunit');
        return $token;
    }

    protected function request(string $method, string $path, array $body = [], array $headers = [], array $cookies = [], array $files = []): Request
    {
        [$p, $q] = array_pad(explode('?', $path, 2), 2, '');
        parse_str($q, $query);
        $server = ['REQUEST_METHOD' => $method, 'REQUEST_URI' => $path, 'REMOTE_ADDR' => $headers['_ip'] ?? '10.0.0.1', 'HTTP_USER_AGENT' => 'PHPUnit', 'HTTP_HOST' => 'test.oryzenx.local'];
        unset($headers['_ip']);
        foreach ($headers as $k => $v) {
            $server['HTTP_' . strtoupper(str_replace('-', '_', $k))] = $v;
        }
        $raw = '';
        if ($body && !$files) {
            $server['CONTENT_TYPE'] = 'application/json';
            $raw = (string) json_encode($body);
        }
        return new Request($method, $p, $query, $files ? $body : [], $server, $cookies, $files, $raw);
    }

    /** Runs a request through the full kernel (routing, auth, CSRF, permissions) and decodes JSON. */
    protected function api(string $method, string $path, array $body = [], ?string $token = null, array $headers = [], array $cookies = []): array
    {
        if ($token) {
            $headers['Authorization'] = 'Bearer ' . $token;
        }
        $res = App::handle($this->request($method, $path, $body, $headers, $cookies));
        App::get(\OryzenX\Services\AuthService::class)->flushPermissionCache();
        return ['status' => $res->status, 'json' => json_decode($res->body, true), 'response' => $res];
    }

    protected function handle(Request $req): Response
    {
        return App::handle($req);
    }

    protected function lastEmail(string $to): ?array
    {
        return $this->db->one('SELECT * FROM email_queue WHERE to_email = :t ORDER BY id DESC LIMIT 1', ['t' => $to]);
    }
}
