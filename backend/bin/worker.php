<?php

declare(strict_types=1);

/**
 * Background worker.
 *
 * Runs the scheduled jobs that are due. Call it from cron:
 *
 *   * * * * * cd /srv/paylens && php backend/bin/worker.php >> storage/worker.log 2>&1
 *
 * The worker never finalises a payroll run: preparing a period is
 * automated, approving it stays a human decision.
 */

use PayLens\Core\App;
use PayLens\Services\JobService;

/** @var App $app */
$app = require dirname(__DIR__) . '/bootstrap.php';

$jobs = new JobService($app);
$results = $jobs->runDue(50);

if ($results === []) {
    echo "[" . date('c') . "] nothing to do\n";
    exit(0);
}

foreach ($results as $result) {
    $status = (string) ($result['status'] ?? 'unknown');
    $detail = $status === 'success'
        ? (string) ($result['result']['summary'] ?? 'completed')
        : (string) ($result['error'] ?? 'unknown error');
    echo '[' . date('c') . "] job #{$result['runId']}: {$status} — {$detail}\n";
}
