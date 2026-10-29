<?php

declare(strict_types=1);

namespace PayLens\Services;

use PayLens\Core\App;
use PayLens\Core\Money;
use PayLens\Repositories\PayrollRepository;

/**
 * Employee payment tracking.
 *
 * A finalized payroll run says the money was calculated and approved. It
 * says nothing about whether the money reached the employee, so payment is
 * tracked separately: one record per employee, with its own status history.
 *
 * This service never moves money. A record is written by a person recording
 * what a payment provider (or a manual bank transfer) actually did, and it
 * is always marked as a manual entry unless a provider reference is given.
 */
final class PaymentService
{
    public const STATUS_PENDING = 'pending';
    public const STATUS_PAID = 'paid';
    public const STATUS_FAILED = 'failed';

    private NotificationService $notifications;
    private Mailer $mailer;

    public function __construct(
        private App $app,
        private PayrollRepository $runs,
        ?NotificationService $notifications = null,
        ?Mailer $mailer = null,
    ) {
        $this->notifications = $notifications ?? new NotificationService($app->db);
        $this->mailer = $mailer ?? new Mailer($app->db, $app->config);
    }

    /**
     * Every payment record on a run, with the employee attached.
     *
     * @return array<int,array<string,mixed>>
     */
    public function records(string $runId): array
    {
        $rows = $this->app->db->select(
            'SELECT pr.*, e.first_name, e.last_name, e.designation, d.name AS department_name
             FROM payment_records pr
             JOIN employees e ON e.id = pr.employee_id
             LEFT JOIN departments d ON d.id = e.department_id
             WHERE pr.payroll_run_id = ?
             ORDER BY e.id',
            [$runId],
        );

        return array_map(static fn (array $row): array => [
            'id' => (int) $row['id'],
            'payrollRunId' => (string) $row['payroll_run_id'],
            'employeeId' => (string) $row['employee_id'],
            'employeeName' => trim((string) $row['first_name'] . ' ' . (string) $row['last_name']),
            'designation' => (string) ($row['designation'] ?? ''),
            'departmentName' => (string) ($row['department_name'] ?? ''),
            'status' => (string) $row['status'],
            'amount' => Money::fromMinor((int) $row['amount_paise']),
            'amountPaise' => (int) $row['amount_paise'],
            'method' => (string) $row['method'],
            'isManual' => (int) $row['is_manual'] === 1,
            'reference' => $row['reference'] !== null ? (string) $row['reference'] : null,
            'paidAt' => $row['paid_at'],
            'failureReason' => $row['failure_reason'] !== null ? (string) $row['failure_reason'] : null,
            'updatedAt' => (string) $row['updated_at'],
        ], $rows);
    }

    /**
     * Counts and amounts by status.
     *
     * @return array<string,mixed>
     */
    public function summary(string $runId): array
    {
        $records = $this->records($runId);
        $summary = [
            'pending' => ['count' => 0, 'amount' => 0.0, 'amountPaise' => 0],
            'paid' => ['count' => 0, 'amount' => 0.0, 'amountPaise' => 0],
            'failed' => ['count' => 0, 'amount' => 0.0, 'amountPaise' => 0],
            'total' => ['count' => 0, 'amount' => 0.0, 'amountPaise' => 0],
        ];
        foreach ($records as $record) {
            $status = (string) $record['status'];
            if (! isset($summary[$status])) {
                continue;
            }
            $summary[$status]['count']++;
            $summary[$status]['amountPaise'] += (int) $record['amountPaise'];
            $summary[$status]['amount'] = Money::fromMinor((int) $summary[$status]['amountPaise']);
            $summary['total']['count']++;
            $summary['total']['amountPaise'] += (int) $record['amountPaise'];
            $summary['total']['amount'] = Money::fromMinor((int) $summary['total']['amountPaise']);
        }
        return $summary;
    }

    /**
     * Record a payment outcome.
     *
     * @return array<string,mixed>
     */
    public function record(
        string $runId,
        string $employeeId,
        string $status,
        ?string $reference,
        ?string $failureReason,
        ?int $amountPaise,
        ?int $userId,
        string $method = 'manual',
    ): array {
        if (! in_array($status, [self::STATUS_PENDING, self::STATUS_PAID, self::STATUS_FAILED], true)) {
            throw new \InvalidArgumentException('Unknown payment status.');
        }

        $run = $this->runs->run($runId);
        if ($run === null) {
            throw new \RuntimeException('Payroll run not found.');
        }
        if ((string) $run['status'] !== 'finalized') {
            throw new \RuntimeException('Payments can only be recorded against a finalised run.');
        }

        $payslip = $this->app->db->selectOne(
            'SELECT id, net_paise FROM payslips WHERE payroll_run_id = ? AND employee_id = ?',
            [$runId, $employeeId],
        );
        if ($payslip === null) {
            throw new \RuntimeException('That employee is not part of this payroll run.');
        }

        $net = (int) $payslip['net_paise'];
        $amount = $amountPaise ?? $net;
        if ($amount < 0) {
            throw new \InvalidArgumentException('A payment amount cannot be negative.');
        }
        if ($amount > $net) {
            throw new \InvalidArgumentException('A payment cannot exceed the net payable amount.');
        }
        if ($status === self::STATUS_FAILED && trim((string) $failureReason) === '') {
            throw new \InvalidArgumentException('A failure reason is required when a payment fails.');
        }
        if ($status === self::STATUS_PAID && trim((string) $reference) === '') {
            throw new \InvalidArgumentException('A payment reference is required for a completed payment.');
        }

        $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');
        $isManual = $method === 'manual' ? 1 : 0;

        return $this->app->db->transaction(function () use ($runId, $employeeId, $status, $reference, $failureReason, $amount, $userId, $isManual, $now, $net, $method): array {
            $existing = $this->app->db->selectOne(
                'SELECT * FROM payment_records WHERE payroll_run_id = ? AND employee_id = ?',
                [$runId, $employeeId],
            );

            if ($existing === null) {
                $this->app->db->execute(
                    'INSERT INTO payment_records
                        (payroll_run_id, employee_id, status, amount_paise, method, reference, paid_at,
                         failure_reason, is_manual, recorded_by, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [
                        $runId, $employeeId, $status, $amount, $method, $reference,
                        $status === self::STATUS_PAID ? $now : null,
                        $failureReason,
                        $isManual,
                        $userId,
                        $now,
                        $now,
                    ],
                );
                $paymentId = (int) $this->app->db->lastInsertId();
                $previousStatus = null;
            } else {
                $paymentId = (int) $existing['id'];
                $previousStatus = (string) $existing['status'];
                $this->app->db->execute(
                    'UPDATE payment_records
                     SET status = ?, amount_paise = ?, method = ?, reference = ?, paid_at = ?,
                         failure_reason = ?, is_manual = ?, recorded_by = ?, updated_at = ?
                     WHERE id = ?',
                    [
                        $status, $amount, $method, $reference,
                        $status === self::STATUS_PAID ? $now : null,
                        $failureReason, $isManual, $userId, $now, $paymentId,
                    ],
                );
            }

            $this->app->db->execute(
                'INSERT INTO payment_status_history
                    (payment_record_id, previous_status, new_status, amount_paise, reference, note, changed_by, changed_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    $paymentId,
                    $previousStatus,
                    $status,
                    $amount,
                    $reference,
                    $failureReason,
                    $userId,
                    $now,
                ],
            );

            return ['id' => $paymentId, 'status' => $status, 'amountPaise' => $amount, 'netPaise' => $net];
        });
    }

    /** @return array<int,array<string,mixed>> */
    public function history(int $paymentRecordId): array
    {
        return $this->app->db->select(
            'SELECT h.*, u.name AS changed_by_name FROM payment_status_history h
             LEFT JOIN users u ON u.id = h.changed_by
             WHERE h.payment_record_id = ? ORDER BY h.id DESC',
            [$paymentRecordId],
        );
    }

    /**
     * Every payment on every run, for the payment-tracking screen.
     *
     * @return array<int,array<string,mixed>>
     */
    public function allRecords(string $status = ''): array
    {
        $sql = 'SELECT pr.*, e.first_name, e.last_name, r.period_month, r.period_year
                FROM payment_records pr
                JOIN employees e ON e.id = pr.employee_id
                JOIN payroll_runs r ON r.id = pr.payroll_run_id';
        $params = [];
        if ($status !== '') {
            $sql .= ' WHERE pr.status = ?';
            $params[] = $status;
        }
        $sql .= ' ORDER BY r.period_year DESC, r.period_month DESC, e.id';

        return array_map(static fn (array $row): array => [
            'id' => (int) $row['id'],
            'payrollRunId' => (string) $row['payroll_run_id'],
            'period' => date('F Y', mktime(0, 0, 0, (int) $row['period_month'], 1, (int) $row['period_year'])),
            'employeeId' => (string) $row['employee_id'],
            'employeeName' => trim((string) $row['first_name'] . ' ' . (string) $row['last_name']),
            'status' => (string) $row['status'],
            'amount' => Money::fromMinor((int) $row['amount_paise']),
            'amountPaise' => (int) $row['amount_paise'],
            'method' => (string) $row['method'],
            'isManual' => (int) $row['is_manual'] === 1,
            'reference' => $row['reference'] !== null ? (string) $row['reference'] : null,
            'paidAt' => $row['paid_at'],
            'failureReason' => $row['failure_reason'] !== null ? (string) $row['failure_reason'] : null,
        ], $this->app->db->select($sql, $params));
    }
}
