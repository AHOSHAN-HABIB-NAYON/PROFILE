<?php
/**
 * Pure-PHP database backup/restore (no mysqldump needed on shared hosting).
 * Files live in storage/backups (denied by .htaccess) and are downloaded only
 * through the authenticated admin route.
 *
 * Format: gzip, one SQL statement per line (newlines escaped), so restore can
 * stream line-by-line safely. Only files carrying our signature are restorable.
 */
final class Backup
{
    private const SIGNATURE = '-- NovaShop backup v1';
    private const DIR = STORAGE_PATH . '/backups/';

    public static function create(string $label = 'manual'): string
    {
        @set_time_limit(300);
        $name = 'backup-' . date('Ymd-His') . '-' . preg_replace('/[^a-z]/', '', $label) . '-' . bin2hex(random_bytes(3)) . '.sql.gz';
        $gz = gzopen(self::DIR . $name, 'wb6');
        if (!$gz) {
            throw new RuntimeException('Cannot write backup file');
        }
        gzwrite($gz, self::SIGNATURE . ' ' . date('c') . "\n");
        gzwrite($gz, "SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n");
        $pdo = DB::pdo();
        foreach (DB::column('SHOW TABLES') as $table) {
            if (in_array($table, ['rate_limits', 'analytics_visitors'], true)) {
                continue;
            }
            $create = DB::one('SHOW CREATE TABLE `' . $table . '`');
            gzwrite($gz, 'DROP TABLE IF EXISTS `' . $table . "`;\n");
            gzwrite($gz, str_replace(["\r", "\n"], ' ', $create['Create Table']) . ";\n");
            $stmt = $pdo->query('SELECT * FROM `' . $table . '`', PDO::FETCH_ASSOC);
            $batch = [];
            $cols = null;
            while ($row = $stmt->fetch()) {
                $cols ??= '(`' . implode('`,`', array_keys($row)) . '`)';
                $batch[] = '(' . implode(',', array_map([self::class, 'quote'], array_values($row))) . ')';
                if (count($batch) >= 200) {
                    gzwrite($gz, 'INSERT INTO `' . $table . '` ' . $cols . ' VALUES ' . implode(',', $batch) . ";\n");
                    $batch = [];
                }
            }
            if ($batch) {
                gzwrite($gz, 'INSERT INTO `' . $table . '` ' . $cols . ' VALUES ' . implode(',', $batch) . ";\n");
            }
        }
        gzwrite($gz, "SET FOREIGN_KEY_CHECKS=1;\n");
        gzclose($gz);
        Audit::log('backup.create', null, null, null, ['file' => $name]);
        return $name;
    }

    public static function restore(array $upload): int
    {
        if (($upload['error'] ?? 1) !== UPLOAD_ERR_OK || !is_uploaded_file($upload['tmp_name'])) {
            throw new HttpException(422, 'Upload failed.');
        }
        if ($upload['size'] > 200 * 1024 * 1024) {
            throw new HttpException(422, 'Backup file is too large.');
        }
        $gz = gzopen($upload['tmp_name'], 'rb');
        $first = $gz ? (string)gzgets($gz, 4096) : '';
        if (!$gz || !str_starts_with($first, self::SIGNATURE)) {
            if ($gz) {
                gzclose($gz);
            }
            throw new HttpException(422, 'This is not a NovaShop backup file.');
        }
        @set_time_limit(600);
        self::create('prerestore');
        $pdo = DB::pdo();
        $count = 0;
        while (($line = gzgets($gz, 64 * 1024 * 1024)) !== false) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '--')) {
                continue;
            }
            $pdo->exec($line);
            $count++;
        }
        gzclose($gz);
        Cache::flushAll();
        Audit::log('backup.restore', null, null, null, ['statements' => $count, 'file' => basename((string)$upload['name'])]);
        return $count;
    }

    public static function list(): array
    {
        $files = [];
        foreach (glob(self::DIR . 'backup-*.sql.gz') ?: [] as $f) {
            $files[] = ['name' => basename($f), 'size' => filesize($f), 'time' => filemtime($f)];
        }
        usort($files, static fn($a, $b) => $b['time'] <=> $a['time']);
        return $files;
    }

    public static function path(string $name): ?string
    {
        if (!preg_match('/^backup-[0-9]{8}-[0-9]{6}-[a-z]*-[a-f0-9]{6}\.sql\.gz$/', $name)) {
            return null;
        }
        $path = self::DIR . $name;
        return is_file($path) ? $path : null;
    }

    public static function delete(string $name): bool
    {
        $path = self::path($name);
        if ($path) {
            Audit::log('backup.delete', null, null, null, ['file' => $name]);
            return unlink($path);
        }
        return false;
    }

    private static function quote(mixed $v): string
    {
        if ($v === null) {
            return 'NULL';
        }
        if (is_int($v) || is_float($v)) {
            return (string)$v;
        }
        return "'" . strtr((string)$v, ['\\' => '\\\\', "'" => "\\'", "\n" => '\\n', "\r" => '\\r', "\0" => '\\0', "\x1a" => '\\Z']) . "'";
    }
}
