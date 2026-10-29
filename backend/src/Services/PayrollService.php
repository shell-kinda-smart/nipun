<?php

declare(strict_types=1);

namespace PayLens\Services;

use PayLens\Core\App;
use PayLens\Core\Money;
use PayLens\Repositories\EmployeeRepository;
use PayLens\Repositories\PayrollRepository;
use PayLens\Repositories\UserRepository;
use PayLens\Support\Mapper;

/**
 * Payroll workflow orchestration.
 *
 * LIFECYCLE
 *
 *   draft ──calculate──▶ calculated ──submit──▶ submitted ──approve──▶ approved
 *     ▲                     │                     │                       │
 *     │                     │                  reject                 finalize
 *     │                     │                     ▼                       ▼
 *     └──── recalculate ────┴─────────────── rejected              finalized
 *   (any state) ──────────────────────────────────────────────▶ reversed
 *
 *   A finalized run also opens a payment record per employee, all of them
 *   *pending*. Nothing is marked paid by the payroll process: whether money
 *   reached an employee is recorded separately, by whoever actually paid it.
 *
 * Every transition is claimed with a conditional UPDATE, so two concurrent
 * requests cannot both advance the same run — the second one updates zero
 * rows and is rejected.
 */
final class PayrollService
{
    private NotificationService $notifications;
    private Mailer $mailer;

    public function __construct(
        private App $app,
        private PayrollRepository $runs,
        private EmployeeRepository $employees,
        private UserRepository $users,
        private RuleRepository $rules,
        private PayrollCalculator $calculator,
        private AuditLogger $audit,
        ?NotificationService $notifications = null,
        ?Mailer $mailer = null,
    ) {
        $this->notifications = $notifications ?? new NotificationService($app->db);
        $this->mailer = $mailer ?? new Mailer($app->db, $app->config);
    }

    // ── Creation ────────────────────────────────────────────────────────────

    /**
     * Create a draft run for a period.
     *
     * @return array<string,mixed>
     */
    public function createRun(int $year, int $month, ?int $userId): array
    {
        if ($month < 1 || $month > 12 || $year < 2000 || $year > 2100) {
            throw new \InvalidArgumentException('Invalid payroll period.');
        }

        $existing = $this->runs->runForPeriod($year, $month);
        if ($existing !== null) {
            throw new \RuntimeException('A payroll run already exists for that period.');
        }

        $id = 'PR-' . $year . str_pad((string) $month, 2, '0', STR_PAD_LEFT);
        $this->runs->createRun($id, $year, $month, $userId);

        $this->audit->log(
            $userId,
            'payroll.run.created',
            'payroll_run',
            $id,
            'success',
            ['period' => $year . '-' . str_pad((string) $month, 2, '0', STR_PAD_LEFT)],
        );

        return $this->runs->run($id) ?? [];
    }

    // ── Selection ───────────────────────────────────────────────────────────

    /**
     * Record who a run covers.
     *
     * @param array<int,string> $included
     * @param array<int,array{id:string,reason:string}> $excluded
     * @return array<string,mixed>
     */
    public function setSelection(
        string $runId,
        array $included,
        array $excluded,
        ?int $userId,
    ): array {
        $run = $this->requireRun($runId);
        if (in_array((string) $run['status'], ['calculated', 'submitted', 'approved', 'finalized'], true)) {
            throw new \RuntimeException('The selection is locked once the run has been calculated.');
        }

        $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');

        $this->app->db->transaction(function () use ($runId, $included, $excluded, $now, $userId): void {
            $this->app->db->execute('DELETE FROM payroll_run_employees WHERE payroll_run_id = ?', [$runId]);

            foreach ($included as $employeeId) {
                $this->app->db->execute(
                    'INSERT INTO payroll_run_employees
                        (payroll_run_id, employee_id, status, included, created_at, updated_at)
                     VALUES (?, ?, ?, 1, ?, ?)',
                    [$runId, $employeeId, 'selected', $now, $now],
                );
            }

            foreach ($excluded as $item) {
                $this->app->db->execute(
                    'INSERT INTO payroll_run_employees
                        (payroll_run_id, employee_id, status, included, exclusion_reason, excluded_by, excluded_at, created_at, updated_at)
                     VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)',
                    [
                        $runId,
                        $item['id'],
                        'excluded',
                        $item['reason'],
                        $userId !== null ? (string) ($this->users->findById($userId)['email'] ?? '') : null,
                        $now,
                        $now,
                        $now,
                    ],
                );
            }
        });

        $this->audit->log(
            $userId,
            'payroll.selection.set',
            'payroll_run',
            $runId,
            'success',
            ['included' => count($included), 'excluded' => count($excluded)],
        );

        return $this->selection($runId);
    }

    /**
     * The employees a run covers, with the ineligible ones explained.
     *
     * @return array<string,mixed>
     */
    public function selection(string $runId): array
    {
        $run = $this->requireRun($runId);
        $period = $this->periodBounds((int) $run['period_year'], (int) $run['period_month']);

        $eligibility = new PayrollEligibility($this->app->db);
        $evaluated = $eligibility->evaluate($period['start'], $period['end']);

        $stored = $this->app->db->select(
            'SELECT * FROM payroll_run_employees WHERE payroll_run_id = ? ORDER BY employee_id',
            [$runId],
        );
        $storedByEmployee = [];
        foreach ($stored as $row) {
            $storedByEmployee[(string) $row['employee_id']] = $row;
        }

        $selected = [];
        $excluded = [];
        $explicit = $stored !== [];

        foreach ($evaluated['eligible'] as $employee) {
            $row = $storedByEmployee[$employee['id']] ?? null;

            if ($explicit) {
                // A selection was made: only the employees on it are paid.
                if ($row === null) {
                    continue;
                }
                if ((int) $row['included'] === 0) {
                    $excluded[] = $employee + [
                        'reason' => (string) ($row['exclusion_reason'] ?? ''),
                        'excludedAt' => $row['excluded_at'],
                    ];
                    continue;
                }
            }

            $selected[] = $employee + [
                'status' => $row !== null ? (string) $row['status'] : 'selected',
                'explicitlySelected' => $row !== null,
            ];
        }

        return [
            'runId' => $runId,
            'status' => (string) $run['status'],
            'selected' => $selected,
            'excluded' => $excluded,
            'ineligible' => $evaluated['ineligible'],
            'holds' => $evaluated['holds'],
            'summary' => [
                'selected' => count($selected),
                'excluded' => count($excluded),
                'ineligible' => count($evaluated['ineligible']),
                'onHold' => count($evaluated['holds']),
            ],
        ];
    }

    // ── Calculation ─────────────────────────────────────────────────────────

    /**
     * Calculate the run from the current selection.
     *
     * @return array{run:array<string,mixed>,errors:array<int,string>}
     */
    public function calculate(string $runId, ?int $userId): array
    {
        $run = $this->requireRun($runId);
        if (in_array((string) $run['status'], ['submitted', 'approved', 'finalized'], true)) {
            throw new \RuntimeException('A run that has been submitted cannot be recalculated.');
        }

        $year = (int) $run['period_year'];
        $month = (int) $run['period_month'];
        $period = $this->periodBounds($year, $month);
        $asOf = $period['end'];

        $ruleSet = $this->rules->rulesFor($asOf);
        $snapshot = json_encode($this->rules->snapshot($asOf), JSON_UNESCAPED_UNICODE);

        // The selection is authoritative: only the employees recorded on the
        // run are paid, and only if they are still eligible.
        $selection = $this->selection($runId);
        $payroll = new PayrollEligibility($this->app->db);
        $evaluated = $payroll->evaluate($period['start'], $period['end']);
        $eligibleById = [];
        foreach ($evaluated['eligible'] as $employee) {
            $eligibleById[$employee['id']] = $employee;
        }

        $errors = [];

        $count = $this->app->db->transaction(function () use ($runId, $selection, $eligibleById, $asOf, $ruleSet, $snapshot, $userId, $year, $month, &$errors): int {
            $this->app->db->execute('DELETE FROM payslips WHERE payroll_run_id = ?', [$runId]);

            $gross = 0;
            $deductions = 0;
            $net = 0;
            $tax = 0;
            $count = 0;
            $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');

            foreach ($selection['selected'] as $employee) {
                $employeeId = (string) $employee['id'];
                if (! isset($eligibleById[$employeeId])) {
                    $errors[] = $employeeId . ' is no longer eligible and was skipped.';
                    continue;
                }

                $salary = $this->employees->currentSalary($employeeId, $asOf);
                if ($salary === null) {
                    $errors[] = $employeeId . ' has no compensation in force and was skipped.';
                    continue;
                }

                $attendance = $this->attendanceFor($employeeId, $year, $month);
                $adjustments = $this->runs->adjustments($runId, $employeeId);

                $result = $this->calculator->calculate($salary, $ruleSet, $adjustments, $attendance);
                if ($result['errors'] !== []) {
                    $errors[] = $employeeId . ': ' . implode(' ', $result['errors']);
                    continue;
                }

                $payslipId = 'PS-' . $runId . '-' . $employeeId;
                $department = $this->app->db->selectOne(
                    'SELECT name FROM departments WHERE id = ?',
                    [(string) $employee['departmentId']],
                );

                $this->app->db->execute(
                    'INSERT INTO payslips
                        (id, payroll_run_id, employee_id, period_month, period_year, employee_name,
                         designation, department_id, department_name, basic_paise, gross_paise,
                         total_deductions_paise, net_paise, tax_paise, status, working_days,
                         days_present, compensation_snapshot, generated_at, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [
                        $payslipId,
                        $runId,
                        $employeeId,
                        $month,
                        $year,
                        (string) $employee['name'],
                        (string) $employee['designation'],
                        (string) $employee['departmentId'],
                        (string) ($department['name'] ?? ''),
                        $result['basic_paise'],
                        $result['gross_paise'],
                        $result['total_deductions_paise'],
                        $result['net_paise'],
                        $result['tax_paise'],
                        'calculated',
                        (int) ($attendance['working_days'] ?? $this->app->config->int('payroll.default_working_days', 22)),
                        (int) ($attendance['days_present'] ?? 0),
                        json_encode($this->compensationSnapshot($salary), JSON_UNESCAPED_UNICODE),
                        $now,
                        $now,
                        $now,
                    ],
                );

                foreach ($result['lines'] as $line) {
                    $this->app->db->execute(
                        'INSERT INTO payslip_lines (payslip_id, kind, code, label, amount_paise, sequence)
                         VALUES (?, ?, ?, ?, ?, ?)',
                        [$payslipId, $line['kind'], $line['code'], $line['label'], $line['amount_paise'], $line['sequence']],
                    );
                }

                $gross += $result['gross_paise'];
                $deductions += $result['total_deductions_paise'];
                $net += $result['net_paise'];
                $tax += $result['tax_paise'];
                $count++;
            }

            $claimed = $this->app->db->execute(
                "UPDATE payroll_runs SET status = 'calculated' WHERE id = ? AND status IN ('draft', 'calculated', 'rejected')",
                [$runId],
            );
            if ($claimed === 0) {
                throw new \RuntimeException('Payroll run is not in a calculable state.');
            }

            $this->runs->updateRunTotals(
                $runId,
                'calculated',
                $count,
                $gross,
                $deductions,
                $net,
                $tax,
                $snapshot,
                $userId,
            );

            return $count;
        });

        $this->audit->log(
            $userId,
            'payroll.processed',
            'payroll_run',
            $runId,
            $errors === [] ? 'success' : 'partial',
            ['employees' => $count, 'errors' => $errors],
        );

        // The errors travel with the result: an employee who was left out of
        // the run has to be visible to the person who prepared it, not
        // buried in the audit trail.
        return ['run' => $this->runs->run($runId) ?? [], 'errors' => $errors];
    }

    // ── Approval ────────────────────────────────────────────────────────────

    /**
     * Record an adjustment against a run.
     *
     * An adjustment is a bonus, an overtime payment or an extra deduction
     * applied to one employee's payslip. It is recorded against the run
     * rather than folded into the payslip, so the payslip the run produced
     * stays exactly as it was calculated and the correction is visible on
     * its own.
     *
     * Only approved adjustments are applied by the calculator, so an
     * adjustment added to a calculated run takes effect when the run is
     * calculated again.
     *
     * @return array<string,mixed>
     */
    public function addAdjustment(
        string $runId,
        ?string $employeeId,
        string $kind,
        int $amountPaise,
        string $reason,
        bool $approved,
        ?int $userId,
    ): array {
        $run = $this->requireRun($runId);
        if (in_array((string) $run['status'], ['submitted', 'approved', 'finalized'], true)) {
            throw new \RuntimeException('Adjustments cannot be added once a run has been submitted.');
        }
        if ($amountPaise <= 0) {
            throw new \RuntimeException('An adjustment must be worth more than nothing.');
        }

        if ($employeeId !== null && $employeeId !== '') {
            $onRun = $this->app->db->selectOne(
                'SELECT COUNT(*) AS c FROM payslips WHERE payroll_run_id = ? AND employee_id = ?',
                [$runId, $employeeId],
            );
            $known = (int) ($onRun['c'] ?? 0) > 0
                || (int) ($this->app->db->selectOne(
                    'SELECT COUNT(*) AS c FROM employees WHERE id = ?',
                    [$employeeId],
                )['c'] ?? 0) > 0;
            if (! $known) {
                throw new \RuntimeException('That employee is not on this payroll run.');
            }
        }

        $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');
        $this->app->db->execute(
            'INSERT INTO payroll_adjustments
                (payroll_run_id, employee_id, kind, amount_paise, reason, status, created_by, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $runId,
                ($employeeId !== null && $employeeId !== '') ? $employeeId : null,
                $kind,
                $amountPaise,
                $reason,
                $approved ? 'approved' : 'pending',
                $userId,
                $now,
            ],
        );
        // The identifier has to be read now: the audit entry that follows is
        // an insert of its own and would move it on.
        $adjustmentId = (int) $this->app->db->lastInsertId();

        $this->audit->log(
            $userId,
            'payroll.adjusted',
            'payroll_run',
            $runId,
            'success',
            [
                'employee' => $employeeId,
                'kind' => $kind,
                'amount' => Money::formatPlain($amountPaise),
                'reason' => $reason,
                'approved' => $approved,
            ],
        );

        return $this->app->db->selectOne(
            'SELECT * FROM payroll_adjustments WHERE id = ?',
            [$adjustmentId],
        ) ?? [];
    }

    /**
     * Submit a calculated run for approval.
     *
     * @return array<string,mixed>
     */
    public function submit(string $runId, ?int $userId): array
    {
        $run = $this->requireRun($runId);
        if ((string) $run['status'] !== 'calculated') {
            throw new \RuntimeException('Only a calculated run can be submitted.');
        }

        $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');
        $claimed = $this->app->db->execute(
            "UPDATE payroll_runs SET status = 'submitted', submitted_at = ?, submitted_by = ? WHERE id = ? AND status = 'calculated'",
            [$now, $userId, $runId],
        );
        if ($claimed === 0) {
            throw new \RuntimeException('The run was submitted by someone else.');
        }

        $period = $this->periodLabel($run);
        $this->audit->log($userId, 'payroll.submitted', 'payroll_run', $runId, 'success', ['period' => $period]);

        $this->notifications->notifyPermission(
            'payroll:approve',
            NotificationService::TYPE_INFO,
            'payroll',
            'Payroll awaiting your approval',
            'A payroll run for ' . $period . ' has been submitted and needs a decision.',
            ['actionLabel' => 'Review', 'actionHref' => '/payroll/runs'],
        );
        $this->mailApprovers('payroll_submitted', $period);

        return $this->runs->run($runId) ?? [];
    }

    /**
     * Approve a submitted run.
     *
     * @return array<string,mixed>
     */
    public function approve(string $runId, ?int $userId): array
    {
        $run = $this->requireRun($runId);
        if ((string) $run['status'] !== 'submitted') {
            throw new \RuntimeException('Only a submitted run can be approved.');
        }

        $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');
        $claimed = $this->app->db->execute(
            "UPDATE payroll_runs SET status = 'approved', approved_at = ?, approved_by = ? WHERE id = ? AND status = 'submitted'",
            [$now, $userId, $runId],
        );
        if ($claimed === 0) {
            throw new \RuntimeException('The run was approved by someone else.');
        }

        $period = $this->periodLabel($run);
        $this->audit->log($userId, 'payroll.approved', 'payroll_run', $runId, 'success', ['period' => $period]);

        $this->notifyPreparer($run, 'payroll_approved', 'Payroll approved', 'The payroll run for ' . $period . ' has been approved.');
        $this->mailPreparer('payroll_approved', $period);

        return $this->runs->run($runId) ?? [];
    }

    /**
     * Send a submitted run back.
     *
     * @return array<string,mixed>
     */
    public function reject(string $runId, string $reason, ?int $userId): array
    {
        $run = $this->requireRun($runId);
        if ((string) $run['status'] !== 'submitted') {
            throw new \RuntimeException('Only a submitted run can be sent back.');
        }
        if (trim($reason) === '') {
            throw new \InvalidArgumentException('A reason is required to send a run back.');
        }

        $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');
        $claimed = $this->app->db->execute(
            "UPDATE payroll_runs
             SET status = 'rejected', rejected_at = ?, rejected_by = ?, rejection_reason = ?
             WHERE id = ? AND status = 'submitted'",
            [$now, $userId, mb_substr($reason, 0, 500), $runId],
        );
        if ($claimed === 0) {
            throw new \RuntimeException('The run was decided by someone else.');
        }

        $period = $this->periodLabel($run);
        $this->audit->log($userId, 'payroll.rejected', 'payroll_run', $runId, 'success', ['period' => $period, 'reason' => $reason]);

        $this->notifyPreparer(
            $run,
            'payroll_rejected',
            'Payroll sent back for review',
            'The payroll run for ' . $period . ' was sent back. Reason: ' . $reason,
        );
        $this->mailPreparer('payroll_rejected', $period, ['reason' => $reason]);

        return $this->runs->run($runId) ?? [];
    }

    // ── Finalisation ────────────────────────────────────────────────────────

    /**
     * Finalise an approved run and open a pending payment per employee.
     *
     * @return array<string,mixed>
     */
    public function finalize(string $runId, ?int $userId): array
    {
        $run = $this->requireRun($runId);
        if ((string) $run['status'] !== 'approved') {
            throw new \RuntimeException('Only an approved run can be finalised.');
        }

        $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');

        $this->app->db->transaction(function () use ($runId, $userId, $now): void {
            $claimed = $this->app->db->execute(
                "UPDATE payroll_runs SET status = 'finalized', finalized_at = ?, finalized_by = ? WHERE id = ? AND status = 'approved'",
                [$now, $userId, $runId],
            );
            if ($claimed === 0) {
                throw new \RuntimeException('The run was finalised by someone else.');
            }

            $this->app->db->execute(
                "UPDATE payslips SET status = 'finalized', updated_at = ? WHERE payroll_run_id = ?",
                [$now, $runId],
            );

            // Every employee on the run gets a payment record, pending.
            // Finalising payroll does not mean anyone has been paid.
            $payslips = $this->app->db->select(
                'SELECT id, employee_id, net_paise FROM payslips WHERE payroll_run_id = ?',
                [$runId],
            );
            foreach ($payslips as $payslip) {
                $exists = $this->app->db->selectOne(
                    'SELECT id FROM payment_records WHERE payroll_run_id = ? AND employee_id = ?',
                    [$runId, $payslip['employee_id']],
                );
                if ($exists !== null) {
                    continue;
                }
                $this->app->db->execute(
                    'INSERT INTO payment_records
                        (payroll_run_id, employee_id, status, amount_paise, method, is_manual, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
                    [$runId, $payslip['employee_id'], 'pending', (int) $payslip['net_paise'], 'manual', $now, $now],
                );
            }
        });

        $period = $this->periodLabel($run);
        $this->audit->log($userId, 'payroll.finalized', 'payroll_run', $runId, 'success', ['period' => $period]);

        $this->notifyPreparer(
            $run,
            'payroll_finalized',
            'Payroll finalised',
            'The payroll run for ' . $period . ' has been finalised. Payslips are available; payments are tracked separately.',
        );
        $this->mailPreparer('payroll_finalized', $period);
        $this->notifyPayslips($runId, $period);

        return $this->runs->run($runId) ?? [];
    }

    /**
     * Reverse a finalised run.
     *
     * The original payslips are preserved and marked reversed — nothing is
     * deleted and no amount is silently rewritten.
     *
     * @return array<string,mixed>
     */
    public function reverse(string $runId, string $reason, ?int $userId): array
    {
        $run = $this->requireRun($runId);
        if ((string) $run['status'] !== 'finalized') {
            throw new \RuntimeException('Only a finalised run can be reversed.');
        }
        if (trim($reason) === '') {
            throw new \InvalidArgumentException('A reason is required to reverse a payroll run.');
        }

        $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');

        $this->app->db->transaction(function () use ($runId, $reason, $userId, $now): void {
            $claimed = $this->app->db->execute(
                "UPDATE payroll_runs SET status = 'reversed' WHERE id = ? AND status = 'finalized'",
                [$runId],
            );
            if ($claimed === 0) {
                throw new \RuntimeException('The run was reversed by someone else.');
            }
            $this->app->db->execute(
                "UPDATE payslips SET status = 'reversed', updated_at = ? WHERE payroll_run_id = ?",
                [$now, $runId],
            );
            $this->app->db->execute(
                'INSERT INTO payroll_adjustments (payroll_run_id, employee_id, kind, amount_paise, reason, status, created_by, created_at)
                 VALUES (?, NULL, ?, ?, ?, ?, ?, ?)',
                [$runId, 'reversal', 0, $reason, 'approved', $userId, $now],
            );
            // A reversed run's pending payments are withdrawn, not paid.
            $this->app->db->execute(
                "UPDATE payment_records SET status = 'failed', failure_reason = ?, updated_at = ?
                 WHERE payroll_run_id = ? AND status = 'pending'",
                ['The payroll run was reversed.', $now, $runId],
            );
        });

        $period = $this->periodLabel($run);
        $this->audit->log($userId, 'payroll.reversed', 'payroll_run', $runId, 'success', ['period' => $period, 'reason' => $reason]);

        $this->notifyPreparer(
            $run,
            'payroll_finalized',
            'Payroll reversed',
            'The payroll run for ' . $period . ' has been reversed. Reason: ' . $reason,
        );

        return $this->runs->run($runId) ?? [];
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    /** @return array<string,mixed> */
    private function requireRun(string $runId): array
    {
        $run = $this->runs->run($runId);
        if ($run === null) {
            throw new \RuntimeException('Payroll run not found.');
        }
        return $run;
    }

    /** @return array{start:string,end:string} */
    private function periodBounds(int $year, int $month): array
    {
        $start = (new \DateTimeImmutable(sprintf('%04d-%02d-01', $year, $month)));
        return [
            'start' => $start->format('Y-m-d'),
            'end' => $start->modify('last day of this month')->format('Y-m-d'),
        ];
    }

    /** @param array<string,mixed> $run */
    private function periodLabel(array $run): string
    {
        $month = (int) $run['period_month'];
        $name = date('F', mktime(0, 0, 0, $month, 1));
        return $name . ' ' . (int) $run['period_year'];
    }

    /** @return array<string,mixed> */
    private function attendanceFor(string $employeeId, int $year, int $month): array
    {
        $row = $this->app->db->selectOne(
            'SELECT * FROM employee_attendance WHERE employee_id = ? AND period_year = ? AND period_month = ?',
            [$employeeId, $year, $month],
        );
        return $row ?? [];
    }

    /** @return array<string,mixed> */
    private function compensationSnapshot(array $salary): array
    {
        return [
            'basicPaise' => (int) $salary['basic_paise'],
            'hraPaise' => (int) $salary['hra_paise'],
            'specialAllowancePaise' => (int) $salary['special_allowance_paise'],
            'travelAllowancePaise' => (int) $salary['travel_allowance_paise'],
            'pfPaise' => (int) $salary['pf_paise'],
            'professionalTaxPaise' => (int) $salary['professional_tax_paise'],
            'ctcAnnualPaise' => (int) ($salary['ctc_annual_paise'] ?? 0),
            'effectiveFrom' => (string) $salary['effective_from'],
        ];
    }

    /** @param array<string,mixed> $run */
    private function notifyPreparer(array $run, string $template, string $title, string $description): void
    {
        $preparer = $run['processed_by'] !== null ? (int) $run['processed_by'] : null;
        if ($preparer !== null) {
            $this->notifications->notify(
                $preparer,
                NotificationService::TYPE_INFO,
                'payroll',
                $title,
                $description,
                ['actionLabel' => 'Open', 'actionHref' => '/payroll/runs'],
            );
        }
        $this->notifications->notifyPermission(
            'payroll:read',
            NotificationService::TYPE_INFO,
            'payroll',
            $title,
            $description,
            ['actionLabel' => 'Open', 'actionHref' => '/payroll/runs'],
        );
    }

    /** @param array<string,mixed> $run */
    private function mailPreparer(string $template, string $period, array $extra = []): void
    {
        $recipients = $this->app->db->select(
            "SELECT DISTINCT u.id, u.email FROM users u
             JOIN role_permissions rp ON rp.role_name = u.role
             WHERE rp.permission_name = 'payroll:process' AND u.status = 'active'",
        );
        foreach ($recipients as $recipient) {
            $this->mailer->send($template, (string) $recipient['email'], (int) $recipient['id'], ['period' => $period] + $extra);
        }
    }

    private function mailApprovers(string $template, string $period): void
    {
        $recipients = $this->app->db->select(
            "SELECT DISTINCT u.id, u.email FROM users u
             JOIN role_permissions rp ON rp.role_name = u.role
             WHERE rp.permission_name = 'payroll:approve' AND u.status = 'active'",
        );
        foreach ($recipients as $recipient) {
            $this->mailer->send($template, (string) $recipient['email'], (int) $recipient['id'], ['period' => $period]);
        }
    }

    private function notifyPayslips(string $runId, string $period): void
    {
        $employees = $this->app->db->select(
            'SELECT DISTINCT u.id, u.email, u.employee_id, e.first_name, e.last_name
             FROM payslips p
             JOIN employees e ON e.id = p.employee_id
             LEFT JOIN users u ON u.employee_id = e.id AND u.status = \'active\'
             WHERE p.payroll_run_id = ?',
            [$runId],
        );
        foreach ($employees as $employee) {
            if ($employee['id'] === null) {
                continue;
            }
            $this->notifications->notify(
                (int) $employee['id'],
                NotificationService::TYPE_SUCCESS,
                'payroll',
                'Your payslip is ready',
                'Your payslip for ' . $period . ' is available to view, download and print.',
                ['actionLabel' => 'View payslip', 'actionHref' => '/me/payslips'],
            );
            $this->mailer->send('payslip_available', (string) $employee['email'], (int) $employee['id'], ['period' => $period]);
        }
    }
}
