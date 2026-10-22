<?php
declare(strict_types=1);
// Restores a backup created by Admin → Backups. DESTRUCTIVE: replaces all data.
// Usage: php bin/restore.php storage/backups/oryzenx-YYYYMMDD-HHMMSS-xxxx.sql.gz --confirm
if (PHP_SAPI !== 'cli') { exit(1); }
require dirname(__DIR__) . '/app/bootstrap.php';
$file = $argv[1] ?? '';
if (!in_array('--confirm', $argv, true) || !is_file($file) || !str_ends_with($file, '.sql.gz')) {
    fwrite(STDERR, "Usage: php bin/restore.php <backup.sql.gz> --confirm\nThis replaces ALL current data. Take a fresh backup first.\n");
    exit(1);
}
$pdo = OryzenX\Core\Database::instance()->pdo();
$sql = gzdecode((string) file_get_contents($file));
if ($sql === false) { fwrite(STDERR, "Cannot read backup.\n"); exit(1); }
$count = 0;
$pdo->exec('SET FOREIGN_KEY_CHECKS=0');
foreach (explode(OryzenX\Services\SystemService::END, $sql) as $stmt) {
    $stmt = trim(preg_replace('/^--[^\n]*\n/m', '', $stmt) ?? '');
    if ($stmt !== '') { $pdo->exec(rtrim($stmt, ';')); $count++; }
}
$pdo->exec('SET FOREIGN_KEY_CHECKS=1');
echo "Restored $count statements from " . basename($file) . "\n";
