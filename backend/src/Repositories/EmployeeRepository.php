<?php

declare(strict_types=1);

namespace PayLens\Repositories;

use PayLens\Core\Database;
use PayLens\Core\Money;

/**
 * Employee reads and writes.
 *
 * Employees are archived, never deleted: a finalized payroll run references
 * them, and the foreign keys on payslips must keep resolving.
 */
final class EmployeeRepository
{
    public function __construct(private Database $db)
    {
    }

    /**
     * The shared employee projection.
     *
     * Joins the salary structure, bank details and attendance that were in
     * force on $asOf, so historical views show historical compensation.
     */
    public function baseSelect(string $asOf, string $table = 'employees'): string
    {
        return "
            SELECT e.*,
                   ss.basic_paise, ss.hra_paise, ss.special_allowance_paise,
                   ss.travel_allowance_paise, ss.pf_paise, ss.professional_tax_paise,
                   ss.ctc_annual_paise, ss.effective_from AS salary_effective_from,
                   b.account_number AS bank_account, b.ifsc AS bank_ifsc, b.bank_name,
                   att.days_present AS attendance_present, att.days_absent AS attendance_absent,
                   att.days_late AS attendance_late, att.leaves AS attendance_leaves
            FROM {$table} e
            LEFT JOIN salary_structures ss ON ss.id = (
                SELECT s.id FROM salary_structures s
                WHERE s.employee_id = e.id AND s.effective_from <= ?
                ORDER BY s.effective_from DESC, s.id DESC LIMIT 1
            )
            LEFT JOIN employee_bank_details b ON b.id = (
                SELECT d.id FROM employee_bank_details d
                WHERE d.employee_id = e.id AND d.effective_from <= ?
                ORDER BY d.effective_from DESC, d.id DESC LIMIT 1
            )
            LEFT JOIN employee_attendance att ON att.id = (
                SELECT a.id FROM employee_attendance a
                WHERE a.employee_id = e.id
                ORDER BY a.period_year DESC, a.period_month DESC LIMIT 1
            )
        ";
    }

    /**
     * @param array{search?:?string,department?:?string,status?:?string,sort?:string,page?:int,perPage?:int} $filters
     * @return array{items:array<int,array<string,mixed>>,total:int}
     */
    public function search(array $filters, string $asOf): array
    {
        $where = ['e.is_deleted = 0'];
        $whereParams = [];

        $search = trim((string) ($filters['search'] ?? ''));
        if ($search !== '') {
            $where[] = '(e.first_name LIKE ? OR e.last_name LIKE ? OR e.email LIKE ? OR e.id LIKE ? OR e.designation LIKE ?)';
            $like = '%' . $search . '%';
            array_push($whereParams, $like, $like, $like, $like, $like);
        }
        if (!empty($filters['department'])) {
            $where[] = 'e.department_id = ?';
            $whereParams[] = (string) $filters['department'];
        }
        if (!empty($filters['status'])) {
            $where[] = 'e.employment_status = ?';
            $whereParams[] = (string) $filters['status'];
        }

        $sort = match ((string) ($filters['sort'] ?? 'name')) {
            'joined' => 'e.date_of_joining DESC',
            'salary' => 'ss.ctc_annual_paise DESC, e.id ASC',
            default => 'e.first_name ASC, e.last_name ASC',
        };

        $whereSql = 'WHERE ' . implode(' AND ', $where);
        $totalRow = $this->db->selectOne(
            'SELECT COUNT(*) AS c FROM employees e ' . $whereSql,
            $whereParams,
        );
        $total = (int) ($totalRow['c'] ?? 0);

        $perPage = max(1, min(200, (int) ($filters['perPage'] ?? 25)));
        $page = max(1, (int) ($filters['page'] ?? 1));
        $offset = ($page - 1) * $perPage;

        $rows = $this->db->select(
            $this->baseSelect($asOf) . ' ' . $whereSql . " ORDER BY {$sort} LIMIT {$perPage} OFFSET {$offset}",
            array_merge([$asOf, $asOf], $whereParams),
        );

        return ['items' => $rows, 'total' => $total];
    }

    /** @return array<string,mixed>|null */
    public function find(string $id, string $asOf): ?array
    {
        return $this->db->selectOne(
            $this->baseSelect($asOf) . ' WHERE e.id = ? AND e.is_deleted = 0',
            [$asOf, $asOf, $id],
        );
    }

    /** @return array<int,array<string,mixed>> */
    public function allActive(string $asOf): array
    {
        return $this->db->select(
            $this->baseSelect($asOf) . " WHERE e.is_deleted = 0 AND e.employment_status <> 'exited'",
            [$asOf, $asOf],
        );
    }

    /** @return array<int,array<string,mixed>> */
    public function byDepartment(string $departmentId, string $asOf): array
    {
        return $this->db->select(
            $this->baseSelect($asOf) . ' WHERE e.department_id = ? AND e.is_deleted = 0',
            [$asOf, $asOf, $departmentId],
        );
    }

    public function countByStatus(string $status): int
    {
        $row = $this->db->selectOne(
            'SELECT COUNT(*) AS c FROM employees WHERE is_deleted = 0 AND employment_status = ?',
            [$status],
        );
        return (int) ($row['c'] ?? 0);
    }

    public function emailExists(string $email, ?string $exceptId = null): bool
    {
        $sql = 'SELECT COUNT(*) AS c FROM employees WHERE LOWER(email) = LOWER(?)';
        $params = [$email];
        if ($exceptId !== null) {
            $sql .= ' AND id <> ?';
            $params[] = $exceptId;
        }
        $row = $this->db->selectOne($sql, $params);
        return (int) ($row['c'] ?? 0) > 0;
    }

    public function idExists(string $id): bool
    {
        $row = $this->db->selectOne('SELECT COUNT(*) AS c FROM employees WHERE id = ?', [$id]);
        return (int) ($row['c'] ?? 0) > 0;
    }

    /** @param array<string,mixed> $data */
    public function create(array $data): void
    {
        $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');
        $this->db->execute(
            'INSERT INTO employees
                (id, first_name, last_name, email, phone, department_id, designation,
                 employment_status, employment_type, date_of_joining, date_of_birth, gender,
                 app_role, performance_rating, avatar_seed, is_deleted, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
            [
                $data['id'],
                $data['first_name'],
                $data['last_name'],
                $data['email'],
                $data['phone'] ?? null,
                $data['department_id'],
                $data['designation'],
                $data['employment_status'] ?? 'active',
                $data['employment_type'] ?? 'full_time',
                $data['date_of_joining'],
                $data['date_of_birth'] ?? null,
                $data['gender'] ?? null,
                $data['app_role'] ?? 'employee',
                $data['performance_rating'] ?? null,
                $data['avatar_seed'] ?? null,
                $now,
                $now,
            ],
        );
    }

    /** @param array<string,mixed> $data */
    public function update(string $id, array $data): void
    {
        $allowed = [
            'first_name', 'last_name', 'email', 'phone', 'department_id', 'designation',
            'employment_status', 'employment_type', 'date_of_joining', 'date_of_birth',
            'gender', 'app_role', 'performance_rating', 'avatar_seed',
        ];
        $sets = [];
        $params = [];
        foreach ($allowed as $column) {
            if (array_key_exists($column, $data)) {
                $sets[] = $column . ' = ?';
                $params[] = $data[$column];
            }
        }
        if ($sets === []) {
            return;
        }
        $sets[] = 'updated_at = ?';
        $params[] = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');
        $params[] = $id;

        $this->db->execute('UPDATE employees SET ' . implode(', ', $sets) . ' WHERE id = ?', $params);
    }

    public function archive(string $id): void
    {
        $this->db->execute(
            "UPDATE employees SET is_deleted = 1, employment_status = 'exited', updated_at = ? WHERE id = ?",
            [(new \DateTimeImmutable('now'))->format('Y-m-d H:i:s'), $id],
        );
    }

    public function hasFinalizedPayslips(string $id): bool
    {
        $row = $this->db->selectOne(
            "SELECT COUNT(*) AS c FROM payslips WHERE employee_id = ? AND status IN ('finalized', 'approved')",
            [$id],
        );
        return (int) ($row['c'] ?? 0) > 0;
    }

    public function nextId(): string
    {
        $cast = $this->db->driver() === 'pgsql' ? 'INTEGER' : 'UNSIGNED';
        $row = $this->db->selectOne("SELECT MAX(CAST(SUBSTR(id, 4) AS {$cast})) AS m FROM employees WHERE id LIKE 'EMP%'");
        $next = (int) ($row['m'] ?? 0) + 1;
        return 'EMP' . str_pad((string) $next, 3, '0', STR_PAD_LEFT);
    }

    /**
     * Insert a new salary version and close off the previous one.
     *
     * @param array<string,int> $components Component name => paise.
     */
    public function addSalaryVersion(
        string $employeeId,
        string $effectiveFrom,
        array $components,
        ?int $annualCtcPaise,
        ?int $createdBy,
    ): int {
        return $this->db->transaction(function () use ($employeeId, $effectiveFrom, $components, $annualCtcPaise, $createdBy): int {
            $previous = $this->db->selectOne(
                'SELECT id, effective_from FROM salary_structures
                 WHERE employee_id = ? AND effective_to IS NULL
                 ORDER BY effective_from DESC LIMIT 1',
                [$employeeId],
            );
            if ($previous !== null) {
                $dayBefore = (new \DateTimeImmutable($effectiveFrom))->modify('-1 day')->format('Y-m-d');
                $this->db->execute(
                    "UPDATE salary_structures SET effective_to = ?, status = 'superseded', updated_at = ? WHERE id = ?",
                    [$dayBefore, (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s'), $previous['id']],
                );
            }

            $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');
            $this->db->execute(
                'INSERT INTO salary_structures
                    (employee_id, effective_from, effective_to, basic_paise, hra_paise,
                     special_allowance_paise, travel_allowance_paise, pf_paise,
                     professional_tax_paise, ctc_annual_paise, status, created_by, created_at, updated_at)
                 VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    $employeeId,
                    $effectiveFrom,
                    $components['basic_paise'] ?? 0,
                    $components['hra_paise'] ?? 0,
                    $components['special_allowance_paise'] ?? 0,
                    $components['travel_allowance_paise'] ?? 0,
                    $components['pf_paise'] ?? 0,
                    $components['professional_tax_paise'] ?? 0,
                    $annualCtcPaise,
                    'active',
                    $createdBy,
                    $now,
                    $now,
                ],
            );
            return (int) $this->db->lastInsertId();
        });
    }

    public function currentSalary(string $employeeId, string $asOf): ?array
    {
        return $this->db->selectOne(
            'SELECT * FROM salary_structures
             WHERE employee_id = ? AND effective_from <= ?
             ORDER BY effective_from DESC, id DESC LIMIT 1',
            [$employeeId, $asOf],
        );
    }

    /** @return array<int,array<string,mixed>> */
    public function salaryHistory(string $employeeId): array
    {
        return $this->db->select(
            'SELECT * FROM salary_structures WHERE employee_id = ? ORDER BY effective_from DESC',
            [$employeeId],
        );
    }

    public function monthlyGrossPaise(array $salary): int
    {
        return (int) $salary['basic_paise']
            + (int) $salary['hra_paise']
            + (int) $salary['special_allowance_paise']
            + (int) $salary['travel_allowance_paise'];
    }

    public function paise(array $row, string $key): int
    {
        return Money::toMinor((float) ($row[$key] ?? 0));
    }
}
