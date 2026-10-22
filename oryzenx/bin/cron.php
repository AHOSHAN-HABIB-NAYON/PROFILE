<?php
declare(strict_types=1);
// Scheduler entry point. Run every minute:   * * * * * php /path/to/oryzenx/bin/cron.php >/dev/null 2>&1
// Run one task:  php bin/cron.php market_refresh   (tasks: market_refresh, email_queue, portfolio_snapshots,
//                portfolio_threshold, reminders, salary_records, cleanup)
if (PHP_SAPI !== 'cli') { exit(1); }
require dirname(__DIR__) . '/app/bootstrap.php';
use OryzenX\Core\App;
use OryzenX\Services\SchedulerService;
if (!OryzenX\Core\Config::isInstalled()) { fwrite(STDERR, "Not installed\n"); exit(1); }
$s = App::get(SchedulerService::class);
$res = isset($argv[1]) ? [$argv[1] => $s->run($argv[1])] : $s->runDue();
foreach ($res as $task => $r) {
    echo str_pad($task, 22) . ' ' . $r['status'] . (isset($r['message']) ? ' — ' . $r['message'] : '') . PHP_EOL;
}
