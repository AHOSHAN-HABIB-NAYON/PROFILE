<?php
declare(strict_types=1);
// Usage: php bin/migrate.php        — apply pending migrations and reference data
if (PHP_SAPI !== 'cli') { exit(1); }
require dirname(__DIR__) . '/app/bootstrap.php';
$applied = (new OryzenX\Core\Migrator(OryzenX\Core\Database::instance()))->migrate();
echo $applied ? 'Applied: ' . implode(', ', $applied) . PHP_EOL : 'Nothing to migrate.' . PHP_EOL;
