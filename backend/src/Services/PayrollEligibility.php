<?php

declare(strict_types=1);

namespace PayLens\Services;

use PayLens\Core\Database;

/**
 * Who a payroll run may cover.
 *
 * Eligibility is decided on the server, never by the browser. The rules are
 * explicit and each ineligible employee comes back with the reason, so the
 * preparer can see *why* someone was left out rather than silently losing
 * them from a run.
 *
 * RULES
 *   1. The employee must not have left (employment_status !== 'exited').
 *   2. Their account access must be active — a revoked account is not paid.
 *   3. No hold may cover the payroll period.
 *   4. A compensation record must exist for the period (effective_from is
 *      on or before the period end).
 *
 * A hold is a standing condition on an employee. It is not the same thing as
 * excluding somebody from one run: an exclusion is recorded against the run
 * and expires with it.
 */
final class PayrollEligibility
{
    public function __construct(private Database $db)
    {
    }

    /**
     * Evaluate every employee against a period.
     *
     * @param array{department?:?string,status?:?string,search?:?string} $filters
     * @return array{
     *   eligible: array<int,array<string,mixed>>,
     *   ineligible: array<int,array<string,mixed>>,
     *   holds: array<int,array<string,mixed>>
     * }
     */
    public function evaluate(string $periodStart, string $periodEnd, array $filters = []): array
    {
        $where = ['e.is_deleted = 0'];
        $params = [$periodEnd];

        if (!empty($filters['department'])) {
            $where[] = 'e.department_id = ?';
            $params[] = (string) $filters['department'];
        }
        if (!empty($filters['status'])) {
            $where[] = 'e.employment_status = ?';
            $params[] = (string) $filters['status'];
        }
        if (!empty($filters['search'])) {
            $where[] = '(e.first_name LIKE ? OR e.last_name LIKE ? OR e.id LIKE ? OR e.designation LIKE ?)';
            $like = '%' . (string) $filters['search'] . '%';
            array_push($params, $like, $like, $like, $like);
        }

        $rows = $this->db->select(
            'SELECT e.id, e.first_name, e.last_name, e.email, e.designation, e.department_id,
                    e.employment_status, e.access_status, e.date_of_joining,
                    d.name AS department_name,
                    ss.id AS salary_id, ss.basic_paise, ss.hra_paise, ss.special_allowance_paise,
                    ss.travel_allowance_paise
             FROM employees e
             LEFT JOIN departments d ON d.id = e.department_id
             LEFT JOIN salary_structures ss ON ss.id = (
                SELECT s.id FROM salary_structures s
                WHERE s.employee_id = e.id AND s.effective_from <= ?
                ORDER BY s.effective_from DESC, s.id DESC LIMIT 1
             )
             WHERE ' . implode(' AND ', $where) . '
             ORDER BY e.id',
            $params,
        );

        $holds = $this->activeHolds($periodStart, $periodEnd);
        $holdsByEmployee = [];
        foreach ($holds as $hold) {
            $holdsByEmployee[(string) $hold['employee_id']][] = $hold;
        }

        $eligible = [];
        $ineligible = [];

        foreach ($rows as $row) {
            $id = (string) $row['id'];
            $name = trim((string) $row['first_name'] . ' ' . (string) $row['last_name']);

            $reason = null;
            $detail = null;

            if ((string) $row['employment_status'] === 'exited') {
                $reason = 'no_longer_employed';
                $detail = 'The employee has left the organisation.';
            } elseif ((string) ($row['access_status'] ?? 'active') !== 'active') {
                $reason = 'access_revoked';
                $detail = 'The employee\'s account access has been revoked.';
            } elseif (isset($holdsByEmployee[$id])) {
                $reason = 'on_hold';
                $detail = (string) $holdsByEmployee[$id][0]['reason'];
            } elseif ($row['salary_id'] === null) {
                $reason = 'no_compensation';
                $detail = 'No compensation record is in force for this period.';
            } elseif ((string) $row['date_of_joining'] > $periodEnd) {
                $reason = 'not_joined_yet';
                $detail = 'The employee has not joined by the end of the period.';
            }

            $record = [
                'id' => $id,
                'name' => $name,
                'email' => (string) $row['email'],
                'designation' => (string) $row['designation'],
                'departmentId' => (string) $row['department_id'],
                'departmentName' => (string) ($row['department_name'] ?? ''),
                'employmentStatus' => (string) $row['employment_status'],
                'accessStatus' => (string) ($row['access_status'] ?? 'active'),
                'basicPaise' => (int) ($row['basic_paise'] ?? 0),
            ];

            if ($reason === null) {
                $eligible[] = $record;
            } else {
                $ineligible[] = $record + ['reason' => $reason, 'detail' => $detail];
            }
        }

        return ['eligible' => $eligible, 'ineligible' => $ineligible, 'holds' => $holds];
    }

    /**
     * Holds that cover a period.
     *
     * @return array<int,array<string,mixed>>
     */
    public function activeHolds(string $periodStart, string $periodEnd): array
    {
        return $this->db->select(
            "SELECT h.*, e.first_name, e.last_name
             FROM employee_holds h
             JOIN employees e ON e.id = h.employee_id
             WHERE h.status = 'active'
               AND h.effective_from <= ?
               AND (h.effective_to IS NULL OR h.effective_to >= ?)
             ORDER BY h.id DESC",
            [$periodEnd, $periodStart],
        );
    }

    /**
     * Place an employee on hold.
     */
    public function hold(
        string $employeeId,
        string $reason,
        string $effectiveFrom,
        ?string $effectiveTo,
        string $category,
        ?string $notes,
        ?int $userId,
    ): int {
        $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');
        $this->db->execute(
            'INSERT INTO employee_holds
                (employee_id, category, reason, notes, effective_from, effective_to, status, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $employeeId,
                $category,
                $reason,
                $notes,
                $effectiveFrom,
                $effectiveTo,
                'active',
                $userId,
                $now,
                $now,
            ],
        );
        return (int) $this->db->lastInsertId();
    }

    /** Release a hold so the employee becomes eligible again. */
    public function release(int $holdId, ?int $userId): bool
    {
        return $this->db->execute(
            "UPDATE employee_holds
             SET status = 'released', released_by = ?, released_at = ?, updated_at = ?
             WHERE id = ? AND status = 'active'",
            [
                $userId,
                (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s'),
                (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s'),
                $holdId,
            ],
        ) > 0;
    }

    /** @return array<int,array<string,mixed>> */
    public function holdsFor(string $employeeId): array
    {
        return $this->db->select(
            'SELECT * FROM employee_holds WHERE employee_id = ? ORDER BY id DESC',
            [$employeeId],
        );
    }
}
