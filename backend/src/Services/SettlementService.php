<?php

declare(strict_types=1);

namespace PayLens\Services;

use PayLens\Core\App;
use PayLens\Core\Money;
use PayLens\Repositories\EmployeeRepository;

/**
 * Final settlement.
 *
 * The settlement lists every component that makes up the final amount, and
 * each one says where it came from:
 *
 *   computed — derived from the employee's own payroll record
 *   manual   — entered by an authorised person (leave encashment, notice
 *              adjustment, arrears, recoveries)
 *
 * Nothing is invented: an entitlement the application does not hold the data
 * for is entered by hand rather than guessed at. Tax on the settlement uses
 * the same configured withholding rate as ordinary payroll.
 *
 * Settling is a separate act from acknowledging the notice, and from
 * completing the offboarding.
 */
final class SettlementService
{
    private NotificationService $notifications;
    private Mailer $mailer;

    public function __construct(private App $app)
    {
        $this->notifications = new NotificationService($app->db);
        $this->mailer = new Mailer($app->db, $app->config);
    }

    /**
     * Calculate a settlement for a termination request.
     *
     * @return array<string,mixed>
     */
    public function calculate(string $terminationRequestId, ?int $userId): array
    {
        $request = $this->app->db->selectOne(
            'SELECT * FROM termination_requests WHERE id = ?',
            [$terminationRequestId],
        );
        if ($request === null) {
            throw new \RuntimeException('Termination request not found.');
        }
        if (! in_array((string) $request['status'], ['acknowledged', 'settled'], true)) {
            throw new \RuntimeException('A settlement can only be prepared once the notice has been acknowledged.');
        }

        $employeeId = (string) $request['employee_id'];
        $employees = new EmployeeRepository($this->app->db);
        $employee = $employees->find($employeeId, (string) $request['last_working_day']);
        if ($employee === null) {
            throw new \RuntimeException('Employee record not found.');
        }

        $salary = $employees->currentSalary($employeeId, (string) $request['last_working_day']);
        if ($salary === null) {
            throw new \RuntimeException('No compensation record is in force for the last working day.');
        }

        $monthlyGross = (int) ($employee['monthly_gross_paise'] ?? 0);
        if ($monthlyGross === 0) {
            $monthlyGross = (int) $salary['basic_paise']
                + (int) $salary['hra_paise']
                + (int) $salary['special_allowance_paise']
                + (int) $salary['travel_allowance_paise'];
        }

        $lastWorkingDay = (string) $request['last_working_day'];
        $monthStart = new \DateTimeImmutable($lastWorkingDay . ' 00:00:00');
        $daysInMonth = (int) $monthStart->format('t');
        $daysWorked = (int) $monthStart->format('j');
        $prorated = (int) round($monthlyGross * ($daysWorked / max(1, $daysInMonth)));

        $rules = new RuleRepository($this->app->db);
        $ruleSet = $rules->rulesFor($lastWorkingDay);
        $tdsRate = (int) ($ruleSet['tds_basic']['rate_basis_points'] ?? 0);

        $settlementId = $this->settlementId($terminationRequestId);
        $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');

        $this->app->db->transaction(function () use ($settlementId, $terminationRequestId, $employeeId, $prorated, $tdsRate, $daysWorked, $daysInMonth, $monthlyGross, $userId, $now): void {
            $existing = $this->app->db->selectOne('SELECT * FROM settlements WHERE termination_request_id = ?', [$terminationRequestId]);
            if ($existing === null) {
                $this->app->db->execute(
                    'INSERT INTO settlements (id, termination_request_id, employee_id, status, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?)',
                    [$settlementId, $terminationRequestId, $employeeId, 'draft', $now, $now],
                );
            } else {
                $settlementId = (string) $existing['id'];
            }

            // The termination points back at its settlement, so the request
            // and the money that settles it are linked from either side.
            $this->app->db->execute(
                'UPDATE termination_requests SET settlement_id = ?, updated_at = ? WHERE id = ?',
                [$settlementId, $now, $terminationRequestId],
            );

            // Recalculating replaces the computed items and keeps the
            // manual ones.
            $this->app->db->execute(
                "DELETE FROM settlement_items WHERE settlement_id = ? AND source <> 'manual'",
                [$settlementId],
            );

            $this->app->db->execute(
                'INSERT INTO settlement_items (settlement_id, code, label, kind, amount_paise, source, note, sequence)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    $settlementId,
                    'prorated_salary',
                    'Salary through the last working day',
                    'earning',
                    $prorated,
                    'computed',
                    'Monthly gross of ' . Money::format($monthlyGross) . ' for ' . $daysWorked . ' of ' . $daysInMonth . ' days',
                    0,
                ],
            );

            if ($tdsRate > 0 && $prorated > 0) {
                $tax = Money::applyRate($prorated, $tdsRate);
                $this->app->db->execute(
                    'INSERT INTO settlement_items (settlement_id, code, label, kind, amount_paise, source, note, sequence)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [
                        $settlementId,
                        'settlement_tax',
                        'Income tax withheld on the settlement',
                        'deduction',
                        $tax,
                        'computed',
                        'Withholding rate of ' . ($tdsRate / 100) . '% as configured for ordinary payroll',
                        1,
                    ],
                );
            }
        });

        $this->recalculate($settlementId);

        $this->app->audit->log(
            $userId,
            'settlement.calculated',
            'settlement',
            $settlementId,
            'success',
            ['termination' => $terminationRequestId],
        );

        return $this->settlement($settlementId);
    }

    /**
     * Add or change a manual settlement component.
     *
     * @param array<string,mixed> $data
     * @return array<string,mixed>
     */
    public function addItem(string $settlementId, array $data, ?int $userId): array
    {
        $settlement = $this->requireSettlement($settlementId);
        if (in_array((string) $settlement['status'], ['approved', 'finalized'], true)) {
            throw new \RuntimeException('An approved settlement cannot be changed. Approve a revised calculation instead.');
        }

        $kind = (string) $data['kind'];
        if (! in_array($kind, ['earning', 'deduction'], true)) {
            throw new \InvalidArgumentException('A settlement component is either an earning or a deduction.');
        }
        $amount = Money::toMinor((float) $data['amount']);
        if ($amount < 0) {
            throw new \InvalidArgumentException('A settlement component cannot be negative.');
        }

        $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');
        $this->app->db->execute(
            'INSERT INTO settlement_items (settlement_id, code, label, kind, amount_paise, source, note, sequence)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $settlementId,
                (string) $data['code'],
                (string) $data['label'],
                $kind,
                $amount,
                'manual',
                $data['note'] ?? null,
                (int) ($this->app->db->selectOne(
                    'SELECT COALESCE(MAX(sequence), 0) + 1 AS s FROM settlement_items WHERE settlement_id = ?',
                    [$settlementId],
                )['s'] ?? 10),
            ],
        );

        $this->recalculate($settlementId);
        $this->app->audit->log($userId, 'settlement.item_added', 'settlement', $settlementId, 'success', ['code' => (string) $data['code']]);

        return $this->settlement($settlementId);
    }

    /** @return array<string,mixed> */
    public function approve(string $settlementId, ?int $userId): array
    {
        $settlement = $this->requireSettlement($settlementId);
        if ((string) $settlement['status'] !== 'draft') {
            throw new \RuntimeException('Only a draft settlement can be approved.');
        }

        $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');
        $claimed = $this->app->db->execute(
            "UPDATE settlements SET status = 'approved', approved_by = ?, approved_at = ?, updated_at = ?
             WHERE id = ? AND status = 'draft'",
            [$userId, $now, $now, $settlementId],
        );
        if ($claimed === 0) {
            throw new \RuntimeException('The settlement was approved by someone else.');
        }

        $this->app->audit->log($userId, 'settlement.approved', 'settlement', $settlementId);

        return $this->settlement($settlementId);
    }

    /**
     * Finalise a settlement and apply the access policy.
     *
     * @return array<string,mixed>
     */
    public function finalize(string $settlementId, ?int $userId): array
    {
        $settlement = $this->requireSettlement($settlementId);
        if ((string) $settlement['status'] !== 'approved') {
            throw new \RuntimeException('Only an approved settlement can be finalised.');
        }

        $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');
        $policy = $this->app->config->string('app.access_after_termination', 'restricted');

        $this->app->db->transaction(function () use ($settlementId, $now, $policy, $settlement): void {
            $this->app->db->execute(
                "UPDATE settlements SET status = 'finalized', finalized_at = ?, updated_at = ? WHERE id = ? AND status = 'approved'",
                [$now, $now, $settlementId],
            );

            // The offboarding is complete only now — not when the letter was
            // acknowledged.
            $this->app->db->execute(
                "UPDATE termination_requests SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?",
                [$now, $now, (string) $settlement['termination_request_id']],
            );

            // Account access: the employee keeps read access to their own
            // records (restricted) or loses it entirely (revoked), per the
            // configured policy. Their payroll history is never deleted.
            $accessStatus = $policy === 'revoked' ? 'revoked' : 'restricted';
            $this->app->db->execute(
                'UPDATE employees SET access_status = ?, access_revoked_at = ?, access_revoked_reason = ?, terminated_at = ?, updated_at = ? WHERE id = ?',
                [
                    $accessStatus,
                    $now,
                    'Employment ended on ' . $now,
                    $now,
                    $now,
                    (string) $settlement['employee_id'],
                ],
            );

            if ($accessStatus === 'revoked') {
                $this->app->db->execute(
                    "UPDATE users SET status = 'disabled', updated_at = ? WHERE employee_id = ?",
                    [$now, (string) $settlement['employee_id']],
                );
            }
        });

        $this->app->audit->log(
            $userId,
            'settlement.finalized',
            'settlement',
            $settlementId,
            'success',
            ['access' => $policy],
        );

        $this->notifyEmployee($settlement);

        return $this->settlement($settlementId);
    }

    /** @return array<string,mixed> */
    public function settlement(string $settlementId): array
    {
        $settlement = $this->requireSettlement($settlementId);
        $items = $this->app->db->select(
            'SELECT * FROM settlement_items WHERE settlement_id = ? ORDER BY sequence, id',
            [$settlementId],
        );

        return [
            'id' => (string) $settlement['id'],
            'terminationRequestId' => (string) $settlement['termination_request_id'],
            'employeeId' => (string) $settlement['employee_id'],
            'status' => (string) $settlement['status'],
            'totalPayable' => Money::fromMinor((int) $settlement['total_payable_paise']),
            'totalPayablePaise' => (int) $settlement['total_payable_paise'],
            'totalRecoverable' => Money::fromMinor((int) $settlement['total_recoverable_paise']),
            'totalRecoverablePaise' => (int) $settlement['total_recoverable_paise'],
            'netPayable' => Money::fromMinor((int) $settlement['net_payable_paise']),
            'netPayablePaise' => (int) $settlement['net_payable_paise'],
            'items' => array_map(static fn (array $item): array => [
                'id' => (int) $item['id'],
                'code' => (string) $item['code'],
                'label' => (string) $item['label'],
                'kind' => (string) $item['kind'],
                'amount' => Money::fromMinor((int) $item['amount_paise']),
                'amountPaise' => (int) $item['amount_paise'],
                'source' => (string) $item['source'],
                'note' => $item['note'] !== null ? (string) $item['note'] : null,
            ], $items),
            'calculatedAt' => $settlement['calculated_at'],
            'approvedAt' => $settlement['approved_at'],
            'finalizedAt' => $settlement['finalized_at'],
            'createdAt' => (string) $settlement['created_at'],
        ];
    }

    /** @return array<string,mixed>|null */
    public function forTermination(string $terminationRequestId): ?array
    {
        $row = $this->app->db->selectOne(
            'SELECT id FROM settlements WHERE termination_request_id = ?',
            [$terminationRequestId],
        );
        return $row === null ? null : $this->settlement((string) $row['id']);
    }

    /** @return array<int,array<string,mixed>> */
    public function all(): array
    {
        $rows = $this->app->db->select(
            'SELECT s.*, e.first_name, e.last_name FROM settlements s
             JOIN employees e ON e.id = s.employee_id
             ORDER BY s.id DESC',
        );
        return array_map(function (array $row): array {
            $settlement = $this->settlement((string) $row['id']);
            $settlement['employeeName'] = trim((string) $row['first_name'] . ' ' . (string) $row['last_name']);
            return $settlement;
        }, $rows);
    }

    // ── Internals ───────────────────────────────────────────────────────────

    /** @return array<string,mixed> */
    private function requireSettlement(string $settlementId): array
    {
        $row = $this->app->db->selectOne('SELECT * FROM settlements WHERE id = ?', [$settlementId]);
        if ($row === null) {
            throw new \RuntimeException('Settlement not found.');
        }
        return $row;
    }

    private function settlementId(string $terminationRequestId): string
    {
        $existing = $this->app->db->selectOne(
            'SELECT id FROM settlements WHERE termination_request_id = ?',
            [$terminationRequestId],
        );
        if ($existing !== null) {
            return (string) $existing['id'];
        }
        return 'ST-' . str_pad(substr($terminationRequestId, 3), 4, '0', STR_PAD_LEFT);
    }

    private function recalculate(string $settlementId): void
    {
        $items = $this->app->db->select(
            'SELECT kind, amount_paise FROM settlement_items WHERE settlement_id = ?',
            [$settlementId],
        );
        $payable = 0;
        $recoverable = 0;
        foreach ($items as $item) {
            if ((string) $item['kind'] === 'earning') {
                $payable += (int) $item['amount_paise'];
            } else {
                $recoverable += (int) $item['amount_paise'];
            }
        }
        $net = $payable - $recoverable;

        $this->app->db->execute(
            'UPDATE settlements
             SET total_payable_paise = ?, total_recoverable_paise = ?, net_payable_paise = ?,
                 calculated_at = ?, updated_at = ?
             WHERE id = ?',
            [
                $payable,
                $recoverable,
                $net,
                (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s'),
                (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s'),
                $settlementId,
            ],
        );
    }

    /** @param array<string,mixed> $settlement */
    private function notifyEmployee(array $settlement): void
    {
        $user = $this->app->db->selectOne(
            'SELECT id, email FROM users WHERE employee_id = ? AND status = ?',
            [(string) $settlement['employee_id'], 'active'],
        );
        if ($user === null) {
            return;
        }
        $this->notifications->notify(
            (int) $user['id'],
            NotificationService::TYPE_SUCCESS,
            'settlement',
            'Your final settlement statement is ready',
            'Your final settlement statement is available to view.',
            ['actionLabel' => 'View settlement', 'actionHref' => '/me/settlement'],
        );
        $this->mailer->send('settlement_ready', (string) $user['email'], (int) $user['id'], []);
    }
}
