<?php
declare(strict_types=1);

namespace OryzenX\Controllers\Web;

use OryzenX\Core\Config;
use OryzenX\Core\Database;
use OryzenX\Core\HttpException;
use OryzenX\Core\Migrator;
use OryzenX\Core\Request;
use OryzenX\Core\Response;
use OryzenX\Core\Security;
use OryzenX\Core\Validator;
use OryzenX\Core\View;

/**
 * First-run installer. Protections:
 *  - refuses to run once storage/installed.lock exists or config says installed
 *  - requires an install key that is written to storage/install.key on first visit; the operator must read
 *    it from the server (file manager/SSH), proving control of the hosting account
 *  - never echoes database credentials back; config.php is written outside the web root
 */
final class InstallController
{
    private function locked(): bool
    {
        return Config::isInstalled() || is_file(Config::storagePath('installed.lock'));
    }

    private function keyFile(): string
    {
        return Config::storagePath('install.key');
    }

    private function ensureKey(): void
    {
        if (!is_file($this->keyFile())) {
            if (!is_dir(Config::storagePath())) {
                @mkdir(Config::storagePath(), 0750, true);
            }
            @file_put_contents($this->keyFile(), Security::randomToken(18) . "\n");
            @chmod($this->keyFile(), 0600);
        }
    }

    private function checkKey(Request $req): void
    {
        $expected = is_file($this->keyFile()) ? trim((string) file_get_contents($this->keyFile())) : '';
        if ($expected === '' || !hash_equals($expected, $req->str('install_key'))) {
            throw new HttpException(403, 'bad_install_key', 'The install key is incorrect. Open storage/install.key on your server and copy its contents.');
        }
    }

    public static function requirements(): array
    {
        $checks = [];
        $add = function (string $label, bool $ok, string $detail, bool $required = true) use (&$checks) {
            $checks[] = compact('label', 'ok', 'detail', 'required');
        };
        $add('PHP 8.1 or newer', version_compare(PHP_VERSION, '8.1.0', '>='), PHP_VERSION);
        foreach (['pdo_mysql', 'mbstring', 'openssl', 'json'] as $e) {
            $add("PHP extension: $e", extension_loaded($e), extension_loaded($e) ? 'loaded' : 'missing');
        }
        // Secret encryption works with libsodium or, when it is absent, OpenSSL AES-256-GCM (see Security::encrypt).
        $sodium = function_exists('sodium_crypto_secretbox');
        $gcm = function_exists('openssl_get_cipher_methods') && in_array('aes-256-gcm', array_map('strtolower', openssl_get_cipher_methods()), true);
        $add('Encryption for stored secrets', $sodium || $gcm, $sodium ? 'sodium' : ($gcm ? 'OpenSSL AES-256-GCM' : 'unavailable'));
        foreach (['curl', 'gd', 'fileinfo'] as $e) {
            $add("PHP extension: $e (recommended)", extension_loaded($e), extension_loaded($e) ? 'loaded' : 'missing', false);
        }
        $add('PHPMailer installed (composer)', class_exists(\PHPMailer\PHPMailer\PHPMailer::class), class_exists(\PHPMailer\PHPMailer\PHPMailer::class) ? 'found' : 'run composer install --no-dev, or upload the release package that includes vendor/', false);
        $cfgDir = Config::basePath('config');
        $add('config/ is writable', is_writable($cfgDir), is_writable($cfgDir) ? 'writable' : 'make config/ writable during install');
        foreach (['', '/logs', '/cache', '/private', '/backups'] as $d) {
            $p = Config::storagePath() . $d;
            if (!is_dir($p)) {
                @mkdir($p, 0750, true);
            }
            $add('storage' . $d . ' is writable', is_writable($p), is_writable($p) ? 'writable' : 'not writable');
        }
        $up = Config::basePath('public/uploads');
        $add('public/uploads is writable', is_writable($up), is_writable($up) ? 'writable' : 'not writable');
        return $checks;
    }

    public function show(Request $req): Response
    {
        if ($this->locked()) {
            return Response::html(View::render('install/locked'), 403);
        }
        $this->ensureKey();
        $https = $req->isHttps();
        $guessUrl = ($https ? 'https' : 'http') . '://' . preg_replace('/[^A-Za-z0-9.:-]/', '', (string) ($req->server['HTTP_HOST'] ?? 'localhost'));
        return Response::html(View::render('install/index', [
            'requirements' => self::requirements(),
            'https' => $https,
            'guessUrl' => $guessUrl,
        ]))->header('Cache-Control', 'no-store')->header('X-Robots-Tag', 'noindex');
    }

    private function dbConfig(Request $req): array
    {
        $d = Validator::make($req->json(), [
            'db_host' => 'required|string|max:190',
            'db_port' => 'required|int',
            'db_name' => 'required|regex:/^[A-Za-z0-9_$-]{1,64}$/',
            'db_user' => 'required|string|max:80',
            'db_pass' => 'nullable|string|max:200',
        ])->validated();
        return ['host' => $d['db_host'], 'port' => (int) $d['db_port'], 'name' => $d['db_name'], 'user' => $d['db_user'], 'pass' => (string) ($req->json()['db_pass'] ?? '')];
    }

    public function testDb(Request $req): Response
    {
        if ($this->locked()) {
            throw HttpException::forbidden('Already installed.');
        }
        $this->checkKey($req);
        $cfg = $this->dbConfig($req);
        try {
            $db = Database::connect($cfg);
            $ver = (string) $db->value('SELECT VERSION()');
            $tables = (int) $db->value('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()');
            $innodb = (string) $db->value("SELECT SUPPORT FROM information_schema.ENGINES WHERE ENGINE = 'InnoDB'");
            return Response::ok(['connected' => true, 'version' => $ver, 'existing_tables' => $tables, 'innodb' => in_array($innodb, ['YES', 'DEFAULT'], true)]);
        } catch (\PDOException $e) {
            // do not echo credentials; give the class of error only
            $code = $e->getCode();
            $hint = match (true) {
                str_contains($e->getMessage(), 'Access denied') => 'Access denied — check the username and password.',
                str_contains($e->getMessage(), 'Unknown database') => 'Database not found — create it in your hosting panel first.',
                str_contains($e->getMessage(), 'getaddrinfo') || str_contains($e->getMessage(), 'Connection refused') => 'Cannot reach the database host/port.',
                default => 'Connection failed (code ' . $code . ').',
            };
            return Response::error('db_failed', $hint, 422);
        }
    }

    public function run(Request $req): Response
    {
        if ($this->locked()) {
            throw HttpException::forbidden('Already installed.');
        }
        $this->checkKey($req);
        $dbCfg = $this->dbConfig($req);
        $d = Validator::make($req->json(), [
            'app_url' => 'required|url',
            'admin_name' => 'required|string|min:2|max:120',
            'admin_email' => 'required|email',
            'admin_password' => 'required|password',
            'admin_password_confirmation' => 'required|same:admin_password',
            'site_name' => 'nullable|string|max:60',
            'support_email' => 'nullable|email',
            'timezone' => 'nullable|string|max:60',
            'market_provider' => 'nullable|in:coingecko,binance',
            'market_api_key' => 'nullable|string|max:200',
            'smtp_host' => 'nullable|string|max:190',
            'smtp_port' => 'nullable|int',
            'smtp_encryption' => 'nullable|in:tls,ssl,none',
            'smtp_username' => 'nullable|string|max:190',
            'smtp_password' => 'nullable|string|max:300',
            'smtp_from_email' => 'nullable|email',
        ])->validated();
        foreach (self::requirements() as $c) {
            if ($c['required'] && !$c['ok']) {
                throw new HttpException(422, 'requirements', 'Fix the failed requirement first: ' . $c['label']);
            }
        }
        $appUrl = rtrim($d['app_url'], '/');
        $config = [
            'installed' => true,
            'version' => '1.0.0',
            'app_url' => $appUrl,
            'base_path' => rtrim((string) parse_url($appUrl, PHP_URL_PATH), '/'),
            'app_key' => base64_encode(random_bytes(32)),
            'debug' => false,
            'demo_mode' => false,
            'trust_proxy' => false,
            'db' => $dbCfg,
            'mail' => ['driver' => 'smtp'],
            'storage_path' => null,
        ];
        // connect + migrate before writing config, so a failure leaves the installer usable
        $db = Database::connect($dbCfg);
        Database::setInstance($db);
        Config::set($config);
        (new Migrator($db))->migrate();

        $now = Database::now();
        if ($db->value('SELECT id FROM users WHERE email = :e', ['e' => $d['admin_email']])) {
            throw HttpException::validation(['admin_email' => 'A user with this email already exists in this database.']);
        }
        $db->transaction(function (Database $db) use ($d, $now) {
            $id = $db->insert('users', [
                'uuid' => Security::uuid(), 'email' => $d['admin_email'], 'password_hash' => password_hash($d['admin_password'], PASSWORD_DEFAULT),
                'full_name' => strip_tags($d['admin_name']), 'status' => 'active', 'email_verified_at' => $now, 'identity_status' => 'approved',
                'is_admin' => 1, 'terms_accepted_at' => $now, 'password_changed_at' => $now, 'created_at' => $now, 'updated_at' => $now,
            ]);
            $db->insert('user_profiles', ['user_id' => $id, 'updated_at' => $now]);
            $db->insert('notification_preferences', ['user_id' => $id, 'updated_at' => $now]);
            $db->run('INSERT INTO user_roles (user_id, role_id, created_at) SELECT :u, id, :n FROM roles WHERE slug = "super_admin"', ['u' => $id, 'n' => $now]);
        });
        $settings = new \OryzenX\Services\SettingsService($db);
        $map = ['site_name' => 'site_name', 'support_email' => 'support_email', 'timezone' => 'business_timezone', 'market_provider' => 'market_provider',
            'market_api_key' => 'market_api_key', 'smtp_host' => 'smtp_host', 'smtp_port' => 'smtp_port', 'smtp_encryption' => 'smtp_encryption',
            'smtp_username' => 'smtp_username', 'smtp_password' => 'smtp_password', 'smtp_from_email' => 'smtp_from_email'];
        foreach ($map as $in => $key) {
            $v = $req->json()[$in] ?? null;
            if (is_scalar($v) && trim((string) $v) !== '') {
                if ($key === 'business_timezone' && !in_array($v, \DateTimeZone::listIdentifiers(), true)) {
                    continue;
                }
                $settings->set($key, trim((string) $v));
            }
        }
        if (!empty($d['smtp_host']) && !empty($d['smtp_from_email'])) {
            $settings->set('smtp_enabled', '1');
        }

        $php = "<?php\n// Generated by the OryzenX installer on " . gmdate('c') . ". Keep this file private.\nreturn " . var_export($config, true) . ";\n";
        $cfgFile = Config::basePath('config/config.php');
        if (file_put_contents($cfgFile, $php, LOCK_EX) === false) {
            throw new HttpException(500, 'config_write', 'Could not write config/config.php. Make the config directory writable and retry.');
        }
        @chmod($cfgFile, 0640);
        file_put_contents(Config::storagePath('installed.lock'), gmdate('c') . "\n");
        @unlink($this->keyFile());
        return Response::ok([
            'installed' => true,
            'admin_url' => $appUrl . '/v2admin',
            'next_steps' => [
                'Remove write permission from the config/ directory.',
                'Add the cron job: * * * * * php ' . Config::basePath('bin/cron.php') . ' >/dev/null 2>&1',
                'Sign in to /v2admin and open System health.',
                'Configure SMTP and send a test email (Admin → SMTP).',
            ],
        ]);
    }
}
