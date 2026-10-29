<?php

declare(strict_types=1);

use PayLens\Core\Database;
use PayLens\Core\Schema;

/**
 * Scheduled work, job execution history and email delivery.
 *
 * `scheduled_jobs` covers both scheduled payroll preparation and recurring
 * report delivery. `job_runs` is the execution log: what ran, how often it
 * was attempted, why it failed and whether it may be retried.
 * `email_deliveries` records the state of every message, so a delivery is
 * only ever reported as sent when the provider confirmed it.
 */
return [
    'up' => static function (Database $db): void {
        (new Schema($db, 'scheduled_jobs'))
            ->id()
            ->string('code', 64)
            ->string('kind', 32)
            ->string('name', 120)
            ->string('report_type', 64, true)
            ->string('frequency', 16, false, 'once')
            ->dateTime('scheduled_at')
            ->dateTime('next_run_at', true)
            ->int('period_month', true)
            ->int('period_year', true)
            ->json('criteria')
            ->json('recipients')
            ->string('delivery', 16, true)
            ->string('status', 16, false, 'active')
            ->dateTime('last_run_at', true)
            ->string('last_status', 24, true)
            ->string('last_result', 255, true)
            ->bigInt('created_by', true)
            ->dateTime('created_at')
            ->dateTime('updated_at')
            ->unique('code')
            ->index(['kind', 'status'])
            ->foreignKey('created_by', 'users', 'id', 'SET NULL')
            ->create();

        (new Schema($db, 'job_runs'))
            ->id()
            ->bigInt('job_id', true)
            ->string('kind', 32)
            ->string('status', 24, false, 'running')
            ->int('attempt', false, 1)
            ->int('max_attempts', false, 3)
            ->dateTime('started_at')
            ->dateTime('finished_at', true)
            ->int('duration_ms', true)
            ->string('last_error', 500, true)
            ->bool('retryable', false, false)
            ->dateTime('next_retry_at', true)
            ->json('result')
            ->string('triggered_by', 32, false, 'scheduler')
            ->dateTime('created_at')
            ->index(['status', 'next_retry_at'])
            ->index('job_id')
            ->foreignKey('job_id', 'scheduled_jobs', 'id', 'SET NULL')
            ->create();

        (new Schema($db, 'email_deliveries'))
            ->id()
            ->string('template', 64)
            ->string('recipient_email', 160)
            ->bigInt('recipient_user_id', true)
            ->string('subject', 255)
            ->string('status', 16, false, 'queued')
            ->string('provider', 32, true)
            ->string('provider_message_id', 160, true)
            ->string('error', 500, true)
            ->int('attempts', false, 0)
            ->dateTime('sent_at', true)
            ->dateTime('created_at')
            ->dateTime('updated_at')
            ->index(['status', 'created_at'])
            ->foreignKey('recipient_user_id', 'users', 'id', 'SET NULL')
            ->create();
    },
];
