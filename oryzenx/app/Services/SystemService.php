<?php
declare(strict_types=1);

namespace OryzenX\Services;

use OryzenX\Core\Config;
use OryzenX\Core\Database;
use OryzenX\Core\Migrator;

/** Health diagnostics and database backups (SQL dump written to storage/backups, outside the web root). */
final class SystemService
{
    public function __construct(
        private Database $db,
        private MarketService $market,
        private MailService $mail,
        private PushService $push,
        private SettingsService $settings,
        private AuditService $audit
    ) {
    }

    public function health(): array
    {
        $checks = [];
        $add = function (string $key, string $label, string $status, string $detail) use (&$checks) {
            $checks[] = compact('key', 'label', 'status', 'detail');
        };
        $add('php', 'PHP version', version_compare(PHP_VERSION, '8.1.0', '>=') ? 'ok' : 'error', PHP_VERSION);
        foreach (['pdo_mysql', 'mbstring', 'openssl', 'json'] as $ext) {
            $add('ext_' . $ext, "Extension $ext", extension_loaded($ext) ? 'ok' : 'error', extension_loaded($ext) ? 'loaded' : 'missing (required)');
        }
        foreach (['curl' => 'market data, Google sign-in, FCM', 'gd' => 'image uploads', 'sodium' => 'secret encryption (AES-GCM fallback used)', 'bcmath' => 'faster decimals (pure-PHP fallback used)', 'fileinfo' => 'upload type detection'] as $ext => $why) {
            $add('ext_' . $ext, "Extension $ext", extension_loaded($ext) ? 'ok' : 'warning', extension_loaded($ext) ? 'loaded' : "missing — needed for $why");
        }
        try {
            $ver = (string) $this->db->value('SELECT VERSION()');
            $add('db', 'Database connection', 'ok', $ver);
            $charset = (string) $this->db->value('SELECT @@character_set_database');
            $add('db_charset', 'Database charset', str_starts_with($charset, 'utf8mb4') ? 'ok' : 'warning', $charset);
            $pending = (new Migrator($this->db))->pending();
            $add('migrations', 'Database migrations', $pending ? 'warning' : 'ok', $pending ? 'Pending: ' . implode(', ', $pending) : 'Up to date');
        } catch (\Throwable $e) {
            $add('db', 'Database connection', 'error', 'Cannot connect');
        }
        foreach (['logs', 'cache', 'private', 'backups'] as $d) {
            $p = Config::storagePath($d);
            $add('dir_' . $d, "storage/$d writable", is_dir($p) && is_writable($p) ? 'ok' : 'error', is_dir($p) ? (is_writable($p) ? 'writable' : 'not writable') : 'missing');
        }
        $up = Config::basePath('public/uploads');
        $add('dir_uploads', 'public/uploads writable', is_writable($up) ? 'ok' : 'error', is_writable($up) ? 'writable' : 'not writable');
        $add('https', 'App URL uses HTTPS', str_starts_with((string) Config::get('app_url'), 'https://') ? 'ok' : 'warning', (string) Config::get('app_url'));
        $add('debug', 'Debug mode off', Config::isDebug() ? 'warning' : 'ok', Config::isDebug() ? 'debug=true — disable in production' : 'off');
        $add('demo', 'Demo mode', Config::demoMode() ? 'warning' : 'ok', Config::demoMode() ? 'ON — demo data and simulated prices allowed' : 'off');
        $installer = Config::storagePath('installed.lock');
        $add('installer', 'Installer locked', is_file($installer) ? 'ok' : 'error', is_file($installer) ? 'locked' : 'storage/installed.lock missing');
        $m = $this->market->status();
        $add('market', 'Market data', $m['healthy'] ? 'ok' : 'warning', $m['provider_label'] . ' — last success ' . ($m['last_success_at'] ?? 'never') . ($m['last_error'] ? ' — last error: ' . $m['last_error'] : ''));
        $add('smtp', 'SMTP email', $this->mail->smtpConfigured() ? ($this->settings->get('smtp_last_test_status') === 'accepted' ? 'ok' : 'warning') : 'warning',
            $this->mail->smtpConfigured() ? 'Configured; last test: ' . ($this->settings->get('smtp_last_test_status') ?? 'never run') : 'Not configured — emails stay queued');
        $add('fcm', 'Firebase push', $this->push->configured() ? 'ok' : 'warning', $this->push->configured() ? 'Configured' : 'Not configured — push notifications are not sent');
        $lastCron = $this->db->value('SELECT MAX(started_at) FROM scheduled_task_logs');
        $cronOk = $lastCron && strtotime($lastCron . ' UTC') > time() - 900;
        $add('cron', 'Scheduled tasks', $cronOk ? 'ok' : 'warning', $lastCron ? 'Last run ' . $lastCron . ' UTC' : 'Never run — configure cron for bin/cron.php');
        $free = @disk_free_space(Config::storagePath());
        $add('disk', 'Free disk space', $free !== false && $free < 200 * 1048576 ? 'warning' : 'ok', $free !== false ? round($free / 1048576) . ' MB' : 'unknown');

        $counts = [];
        foreach (['users', 'financial_transactions', 'ledger_entries', 'trades', 'loans', 'email_queue', 'market_price_snapshots'] as $t) {
            try {
                $counts[$t] = (int) $this->db->value("SELECT COUNT(*) FROM `$t`");
            } catch (\Throwable) {
                $counts[$t] = null;
            }
        }
        $status = in_array('error', array_column($checks, 'status'), true) ? 'error' : (in_array('warning', array_column($checks, 'status'), true) ? 'warning' : 'ok');
        return ['status' => $status, 'checks' => $checks, 'counts' => $counts, 'time_utc' => gmdate('Y-m-d H:i:s'), 'version' => Config::get('version', '1.0.0')];
    }

    /** Writes a gzip SQL dump of all tables. Returns file name. */
    public function backup(int $actorId): array
    {
        $dir = Config::storagePath('backups');
        if (!is_dir($dir)) {
            mkdir($dir, 0750, true);
        }
        $name = 'oryzenx-' . gmdate('Ymd-His') . '-' . bin2hex(random_bytes(4)) . '.sql.gz';
        $gz = gzopen($dir . '/' . $name, 'wb6');
        if ($gz === false) {
            throw new \RuntimeException('Cannot write backup');
        }
        gzwrite($gz, "-- OryzenX backup " . gmdate('c') . "\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n");
        $pdo = $this->db->pdo();
        foreach ($this->db->all('SHOW FULL TABLES WHERE Table_type = "BASE TABLE"') as $row) {
            $table = (string) array_values($row)[0];
            Database::assertIdent($table);
            $create = $this->db->one("SHOW CREATE TABLE `$table`");
            gzwrite($gz, "\nDROP TABLE IF EXISTS `$table`;\n" . array_values($create)[1] . ";\n");
            $stmt = $pdo->query("SELECT * FROM `$table`", \PDO::FETCH_ASSOC);
            $batch = [];
            foreach ($stmt as $r) {
                $vals = array_map(fn ($v) => $v === null ? 'NULL' : $pdo->quote((string) $v), $r);
                $batch[] = '(' . implode(',', $vals) . ')';
                if (count($batch) >= 200) {
                    gzwrite($gz, "INSERT INTO `$table` VALUES " . implode(",\n", $batch) . ";\n");
                    $batch = [];
                }
            }
            if ($batch) {
                gzwrite($gz, "INSERT INTO `$table` VALUES " . implode(",\n", $batch) . ";\n");
            }
        }
        gzwrite($gz, "SET FOREIGN_KEY_CHECKS=1;\n");
        gzclose($gz);
        $size = filesize($dir . '/' . $name);
        $this->audit->log($actorId, 'system.backup_created', 'backup', $name, ['bytes' => $size]);
        return ['file' => $name, 'bytes' => $size, 'created_at' => gmdate('Y-m-d H:i:s')];
    }

    public function backups(): array
    {
        $out = [];
        foreach (glob(Config::storagePath('backups') . '/oryzenx-*.sql.gz') ?: [] as $f) {
            $out[] = ['file' => basename($f), 'bytes' => filesize($f), 'created_at' => gmdate('Y-m-d H:i:s', (int) filemtime($f))];
        }
        usort($out, fn ($a, $b) => strcmp($b['file'], $a['file']));
        return $out;
    }

    public function backupPath(string $name): ?string
    {
        if (!preg_match('/^oryzenx-\d{8}-\d{6}-[a-f0-9]{8}\.sql\.gz$/', $name)) {
            return null;
        }
        $p = Config::storagePath('backups/' . $name);
        return is_file($p) ? $p : null;
    }

    public function deleteBackup(string $name, int $actorId): void
    {
        $p = $this->backupPath($name);
        if ($p) {
            unlink($p);
            $this->audit->log($actorId, 'system.backup_deleted', 'backup', $name);
        }
    }
}
