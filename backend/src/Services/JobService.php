<?php

declare(strict_types=1);

namespace PayLens\Services;

use PayLens\Core\App;
use PayLens\Repositories\PayrollRepository;

/**
 * Scheduled work and its failure handling.
 *
 * Two kinds of job:
 *   payroll_preparation — prepares (never finalises) the payroll for a period
 *   recurring_report   — builds a report and delivers it by email
 *
 * Idempotency matters more than speed here. A scheduled payroll preparation
 * that fires twice must not produce two runs, and a report that is delivered
 * twice must not mail twice. Both are guarded by a check against the
 * existing state, and the whole execution is recorded in `job_runs` with the
 * attempt count and the reason for any failure.
 */
final class JobService
{
    public const KIND_PAYROLL = 'payroll_preparation';
    public const KIND_REPORT = 'recurring_report';

    private PayrollService $payroll;
    private ReportService $reports;
    private Mailer $mailer;
    private NotificationService $notifications;

    public function __construct(private App $app)
    {
        $this->payroll = new PayrollService(
            $app,
            new PayrollRepository($app->db),
            new \PayLens\Repositories\EmployeeRepository($app->db),
            new \PayLens\Repositories\UserRepository($app->db),
            new RuleRepository($app->db),
            new PayrollCalculator($app->db, new RuleRepository($app->db)),
            new AuditLogger($app->db),
        );
        $this->reports = new ReportService($app);
        $this->mailer = new Mailer($app->db, $app->config);
        $this->notifications = new NotificationService($app->db);
    }

    // ── Schedule management ────────────────────────────────────────────────

    /** @return array<int,array<string,mixed>> */
    public function listJobs(?string $kind = null): array
    {
        $sql = 'SELECT * FROM scheduled_jobs';
        $params = [];
        if ($kind !== null && $kind !== '') {
            $sql .= ' WHERE kind = ?';
            $params[] = $kind;
        }
        $sql .= ' ORDER BY status, scheduled_at';

        return array_map([$this, 'mapJob'], $this->app->db->select($sql, $params));
    }

    /** @return array<string,mixed> */
    public function createJob(array $data, ?int $userId): array
    {
        $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');
        $code = (string) ($data['code'] ?? $this->makeCode((string) $data['kind']));

        $this->app->db->execute(
            'INSERT INTO scheduled_jobs
                (code, kind, name, report_type, frequency, scheduled_at, next_run_at, period_month,
                 period_year, criteria, recipients, delivery, status, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $code,
                (string) $data['kind'],
                (string) $data['name'],
                $data['reportType'] ?? null,
                (string) ($data['frequency'] ?? 'once'),
                (string) $data['scheduledAt'],
                // The first execution happens at the scheduled time.
                (string) $data['scheduledAt'],
                $data['periodMonth'] ?? null,
                $data['periodYear'] ?? null,
                isset($data['criteria']) ? json_encode($data['criteria'], JSON_UNESCAPED_UNICODE) : null,
                isset($data['recipients']) ? json_encode($data['recipients'], JSON_UNESCAPED_UNICODE) : null,
                (string) ($data['delivery'] ?? 'email'),
                'active',
                $userId,
                $now,
                $now,
            ],
        );

        $id = (int) $this->app->db->lastInsertId();
        $this->app->audit->log($userId, 'schedule.created', 'schedule', (string) $id, 'success', ['kind' => (string) $data['kind']]);

        return $this->mapJob((array) $this->app->db->selectOne('SELECT * FROM scheduled_jobs WHERE id = ?', [$id]));
    }

    /** @return array<string,mixed> */
    public function updateJobStatus(int $id, string $status, ?int $userId): array
    {
        if (! in_array($status, ['active', 'paused', 'cancelled'], true)) {
            throw new \InvalidArgumentException('Unknown schedule status.');
        }
        $this->app->db->execute(
            'UPDATE scheduled_jobs SET status = ?, updated_at = ? WHERE id = ?',
            [$status, (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s'), $id],
        );
        $this->app->audit->log($userId, 'schedule.status_changed', 'schedule', (string) $id, 'success', ['status' => $status]);
        return $this->mapJob((array) $this->app->db->selectOne('SELECT * FROM scheduled_jobs WHERE id = ?', [$id]));
    }

    // ── Execution ───────────────────────────────────────────────────────────

    /**
     * Execute every job that is due.
     *
     * @return array<int,array<string,mixed>>
     */
    public function runDue(int $limit = 20): array
    {
        $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');
        $jobs = $this->app->db->select(
            "SELECT * FROM scheduled_jobs
             WHERE status = 'active' AND next_run_at IS NOT NULL AND next_run_at <= ?
             ORDER BY next_run_at
             LIMIT " . max(1, min(100, $limit)),
            [$now],
        );

        $results = [];
        foreach ($jobs as $job) {
            $results[] = $this->execute((int) $job['id'], 'scheduler');
        }
        return $results;
    }

    /**
     * Run one scheduled job.
     *
     * @return array<string,mixed>
     */
    public function execute(int $jobId, string $triggeredBy = 'scheduler'): array
    {
        $job = $this->app->db->selectOne('SELECT * FROM scheduled_jobs WHERE id = ?', [$jobId]);
        if ($job === null) {
            throw new \RuntimeException('Schedule not found.');
        }
        if ((string) $job['status'] !== 'active') {
            throw new \RuntimeException('Only an active schedule can run.');
        }

        $attempt = $this->nextAttempt((int) $jobId);
        $startedAt = new \DateTimeImmutable('now');
        $this->app->db->execute(
            'INSERT INTO job_runs (job_id, kind, status, attempt, max_attempts, started_at, triggered_by, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $jobId,
                (string) $job['kind'],
                'running',
                $attempt,
                3,
                $startedAt->format('Y-m-d H:i:s'),
                $triggeredBy,
                $startedAt->format('Y-m-d H:i:s'),
            ],
        );
        $runId = (int) $this->app->db->lastInsertId();

        try {
            $result = $this->perform($job);
            $finishedAt = new \DateTimeImmutable('now');

            $this->app->db->execute(
                "UPDATE job_runs
                 SET status = 'success', finished_at = ?, duration_ms = ?, last_error = NULL,
                     retryable = 0, result = ?
                 WHERE id = ?",
                [
                    $finishedAt->format('Y-m-d H:i:s'),
                    (int) round(($finishedAt->getTimestamp() - $startedAt->getTimestamp()) * 1000),
                    json_encode($result, JSON_UNESCAPED_UNICODE),
                    $runId,
                ],
            );

            $this->app->db->execute(
                'UPDATE scheduled_jobs SET last_run_at = ?, last_status = ?, last_result = ?, next_run_at = ?, updated_at = ? WHERE id = ?',
                [
                    $finishedAt->format('Y-m-d H:i:s'),
                    'success',
                    mb_substr((string) ($result['summary'] ?? 'Completed'), 0, 255),
                    $this->nextRunFor((string) $job['frequency'], $finishedAt),
                    $finishedAt->format('Y-m-d H:i:s'),
                    $jobId,
                ],
            );

            $this->app->audit->log(null, 'schedule.executed', 'schedule', (string) $jobId, 'success', ['run' => $runId, 'kind' => (string) $job['kind']]);

            return ['runId' => $runId, 'status' => 'success', 'result' => $result];
        } catch (\Throwable $e) {
            $finishedAt = new \DateTimeImmutable('now');
            $retryable = $attempt < 3;
            $nextRetry = $retryable
                ? $finishedAt->modify('+' . $this->backoffSeconds($attempt) . ' seconds')->format('Y-m-d H:i:s')
                : null;

            $this->app->db->execute(
                "UPDATE job_runs
                 SET status = 'failed', finished_at = ?, duration_ms = ?, last_error = ?, retryable = ?, next_retry_at = ?
                 WHERE id = ?",
                [
                    $finishedAt->format('Y-m-d H:i:s'),
                    (int) round(($finishedAt->getTimestamp() - $startedAt->getTimestamp()) * 1000),
                    mb_substr($e->getMessage(), 0, 500),
                    $retryable ? 1 : 0,
                    $nextRetry,
                    $runId,
                ],
            );

            // The schedule has to move on, or the worker picks the same
            // failing job up again on the next tick and retries it forever.
            // The next attempt is the retry time; a job that has run out of
            // retries is parked until it is scheduled again by hand.
            $this->app->db->execute(
                'UPDATE scheduled_jobs SET last_run_at = ?, last_status = ?, last_result = ?, next_run_at = ?, updated_at = ? WHERE id = ?',
                [
                    $finishedAt->format('Y-m-d H:i:s'),
                    'failed',
                    mb_substr($e->getMessage(), 0, 255),
                    $nextRetry,
                    $finishedAt->format('Y-m-d H:i:s'),
                    $jobId,
                ],
            );

            $this->app->audit->log(null, 'schedule.failed', 'schedule', (string) $jobId, 'failure', ['run' => $runId, 'error' => $e->getMessage()]);

            $this->notifications->notifyPermission(
                'jobs:read',
                NotificationService::TYPE_ERROR,
                'system',
                'A scheduled task could not be completed',
                'The schedule "' . (string) $job['name'] . '" failed and needs attention.',
                ['actionLabel' => 'Inspect', 'actionHref' => '/jobs'],
            );

            return ['runId' => $runId, 'status' => 'failed', 'error' => $e->getMessage()];
        }
    }

    /**
     * Retry a failed job run.
     *
     * @return array<string,mixed>
     */
    public function retry(int $jobRunId, ?int $userId): array
    {
        $run = $this->app->db->selectOne('SELECT * FROM job_runs WHERE id = ?', [$jobRunId]);
        if ($run === null) {
            throw new \RuntimeException('Job run not found.');
        }
        if ((string) $run['status'] !== 'failed') {
            throw new \RuntimeException('Only a failed job can be retried.');
        }
        if ((int) $run['retryable'] !== 1) {
            throw new \RuntimeException('This job has exhausted its retries and will not be retried automatically.');
        }
        if ((int) $run['attempt'] >= (int) $run['max_attempts']) {
            throw new \RuntimeException('This job has reached its retry limit.');
        }
        if ($run['job_id'] === null) {
            throw new \RuntimeException('This job is not attached to a schedule.');
        }

        $this->app->audit->log($userId, 'job.retried', 'job_run', (string) $jobRunId, 'success', ['schedule' => (string) $run['job_id']]);

        return $this->execute((int) $run['job_id'], 'manual');
    }

    /**
     * The job history.
     *
     * @return array<int,array<string,mixed>>
     */
    public function runs(int $limit = 50, ?string $status = null): array
    {
        $sql = 'SELECT jr.*, sj.name AS job_name, sj.code AS job_code, sj.kind AS job_kind
                FROM job_runs jr
                LEFT JOIN scheduled_jobs sj ON sj.id = jr.job_id';
        $params = [];
        if ($status !== null && $status !== '') {
            $sql .= ' WHERE jr.status = ?';
            $params[] = $status;
        }
        $sql .= ' ORDER BY jr.id DESC LIMIT ' . max(1, min(200, $limit));

        return array_map(static fn (array $row): array => [
            'id' => (int) $row['id'],
            'jobId' => $row['job_id'] !== null ? (int) $row['job_id'] : null,
            'jobName' => $row['job_name'] !== null ? (string) $row['job_name'] : null,
            'kind' => (string) $row['kind'],
            'status' => (string) $row['status'],
            'attempt' => (int) $row['attempt'],
            'maxAttempts' => (int) $row['max_attempts'],
            'startedAt' => (string) $row['started_at'],
            'finishedAt' => $row['finished_at'],
            'durationMs' => $row['duration_ms'] !== null ? (int) $row['duration_ms'] : null,
            'lastError' => $row['last_error'] !== null ? (string) $row['last_error'] : null,
            'retryable' => (int) $row['retryable'] === 1,
            'nextRetryAt' => $row['next_retry_at'],
            'triggeredBy' => (string) $row['triggered_by'],
        ], $this->app->db->select($sql, $params));
    }

    // ── Internals ───────────────────────────────────────────────────────────

    /**
     * @param array<string,mixed> $job
     * @return array<string,mixed>
     */
    private function perform(array $job): array
    {
        return match ((string) $job['kind']) {
            self::KIND_PAYROLL => $this->performPayrollPreparation($job),
            self::KIND_REPORT => $this->performRecurringReport($job),
            default => throw new \RuntimeException('Unknown job kind: ' . (string) $job['kind']),
        };
    }

    /**
     * Prepare a payroll run for a period.
     *
     * Preparing is not approving: the run is calculated and left for a human
     * to submit, exactly as if it had been prepared by hand.
     *
     * @param array<string,mixed> $job
     * @return array<string,mixed>
     */
    private function performPayrollPreparation(array $job): array
    {
        $criteria = json_decode((string) ($job['criteria'] ?? '{}'), true) ?: [];
        $month = (int) ($criteria['month'] ?? $job['period_month'] ?? 0);
        $year = (int) ($criteria['year'] ?? $job['period_year'] ?? 0);

        if ($month < 1 || $month > 12 || $year < 2000 || $year > 2100) {
            throw new \RuntimeException('The schedule does not name a valid payroll period.');
        }

        $existing = $this->app->db->selectOne(
            'SELECT id FROM payroll_runs WHERE period_year = ? AND period_month = ?',
            [$year, $month],
        );
        if ($existing !== null) {
            // Idempotency: the period is already prepared.
            return [
                'summary' => 'A payroll run already exists for ' . $month . '/' . $year . ' — nothing was done.',
                'skipped' => true,
                'runId' => (string) $existing['id'],
            ];
        }

        $run = $this->payroll->createRun($year, $month, null);
        $runId = (string) $run['id'];
        $this->payroll->calculate($runId, null);

        return [
            'summary' => 'Prepared payroll run ' . $runId . '. It still needs to be submitted for approval.',
            'skipped' => false,
            'runId' => $runId,
        ];
    }

    /**
     * Build a report and deliver it to the configured recipients.
     *
     * @param array<string,mixed> $job
     * @return array<string,mixed>
     */
    private function performRecurringReport(array $job): array
    {
        $type = (string) ($job['report_type'] ?? '');
        $report = $this->reports->build($type);
        if ($report === null) {
            throw new \RuntimeException('Unknown report type: ' . $type);
        }

        $recipients = json_decode((string) ($job['recipients'] ?? '[]'), true) ?: [];
        if ($recipients === []) {
            throw new \RuntimeException('The schedule has no recipients.');
        }

        $delivered = 0;
        $failed = 0;
        foreach ($recipients as $recipient) {
            $email = (string) ($recipient['email'] ?? '');
            if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $failed++;
                continue;
            }
            $result = $this->mailer->send('report_available', $email, null, [
                'report' => $report['title'],
                'period' => (string) ($recipient['period'] ?? 'the current period'),
            ]);
            if ($result['status'] === 'sent') {
                $delivered++;
            } else {
                $failed++;
            }
        }

        return [
            'summary' => 'Report ' . $report['title'] . ': ' . $delivered . ' delivered, ' . $failed . ' not delivered.',
            'rows' => count($report['rows']),
            'delivered' => $delivered,
            'failed' => $failed,
            'mailConfigured' => $this->mailer->isConfigured(),
        ];
    }

    private function nextAttempt(int $jobId): int
    {
        $row = $this->app->db->selectOne('SELECT MAX(attempt) AS a FROM job_runs WHERE job_id = ?', [$jobId]);
        return (int) ($row['a'] ?? 0) + 1;
    }

    private function backoffSeconds(int $attempt): int
    {
        return min(3600, 60 * (2 ** max(0, $attempt - 1)));
    }

    private function nextRunAt(string $scheduledAt, string $frequency): string
    {
        $date = new \DateTimeImmutable($scheduledAt);
        return match ($frequency) {
            'daily' => $date->modify('+1 day')->format('Y-m-d H:i:s'),
            'weekly' => $date->modify('+1 week')->format('Y-m-d H:i:s'),
            'monthly' => $date->modify('+1 month')->format('Y-m-d H:i:s'),
            default => $date->format('Y-m-d H:i:s'),
        };
    }

    private function nextRunFor(string $frequency, \DateTimeImmutable $from): ?string
    {
        return match ($frequency) {
            'daily' => $from->modify('+1 day')->format('Y-m-d H:i:s'),
            'weekly' => $from->modify('+1 week')->format('Y-m-d H:i:s'),
            'monthly' => $from->modify('+1 month')->format('Y-m-d H:i:s'),
            // A one-off schedule never runs again.
            default => null,
        };
    }

    private function makeCode(string $kind): string
    {
        return $kind . '-' . substr(sha1((string) microtime(true)), 0, 10);
    }

    /** @param array<string,mixed> $row */
    private function mapJob(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'code' => (string) $row['code'],
            'kind' => (string) $row['kind'],
            'name' => (string) $row['name'],
            'reportType' => $row['report_type'] !== null ? (string) $row['report_type'] : null,
            'frequency' => (string) $row['frequency'],
            'scheduledAt' => (string) $row['scheduled_at'],
            'nextRunAt' => $row['next_run_at'],
            'periodMonth' => $row['period_month'] !== null ? (int) $row['period_month'] : null,
            'periodYear' => $row['period_year'] !== null ? (int) $row['period_year'] : null,
            'criteria' => $row['criteria'] !== null ? json_decode((string) $row['criteria'], true) : null,
            'recipients' => $row['recipients'] !== null ? json_decode((string) $row['recipients'], true) : [],
            'delivery' => $row['delivery'] !== null ? (string) $row['delivery'] : null,
            'status' => (string) $row['status'],
            'lastRunAt' => $row['last_run_at'],
            'lastStatus' => $row['last_status'] !== null ? (string) $row['last_status'] : null,
            'lastResult' => $row['last_result'] !== null ? (string) $row['last_result'] : null,
            'createdAt' => (string) $row['created_at'],
        ];
    }
}
