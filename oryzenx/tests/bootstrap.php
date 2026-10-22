<?php
declare(strict_types=1);

// Test bootstrap: loads tests/config.testing.php and rebuilds the test database from the migrations.
putenv('ORYZENX_CONFIG=' . __DIR__ . '/config.testing.php');
require dirname(__DIR__) . '/app/bootstrap.php';
restore_error_handler(); // PHPUnit handles warnings itself

$storage = OryzenX\Core\Config::storagePath();
foreach (['logs', 'cache', 'private', 'backups', 'mail'] as $d) {
    @mkdir($storage . '/' . $d, 0777, true);
}
$db = OryzenX\Core\Database::instance();
$db->pdo()->exec('SET FOREIGN_KEY_CHECKS=0');
foreach ($db->all('SHOW TABLES') as $row) {
    $db->pdo()->exec('DROP TABLE `' . array_values($row)[0] . '`');
}
$db->pdo()->exec('SET FOREIGN_KEY_CHECKS=1');
(new OryzenX\Core\Migrator($db))->migrate();
