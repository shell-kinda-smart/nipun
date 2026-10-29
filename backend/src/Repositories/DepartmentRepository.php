<?php

declare(strict_types=1);

namespace PayLens\Repositories;

use PayLens\Core\Database;

final class DepartmentRepository
{
    public function __construct(private Database $db)
    {
    }

    /**
     * Departments with their live headcount and monthly budget.
     *
     * @return array<int,array<string,mixed>>
     */
    public function all(string $asOf): array
    {
        return $this->db->select(
            "SELECT d.*,
                    (SELECT COUNT(*) FROM employees e
                      WHERE e.department_id = d.id AND e.is_deleted = 0
                        AND e.employment_status <> 'exited') AS headcount,
                    (SELECT COALESCE(SUM(ss.basic_paise + ss.hra_paise + ss.special_allowance_paise + ss.travel_allowance_paise), 0)
                       FROM employees e
                       JOIN salary_structures ss ON ss.id = (
                            SELECT s.id FROM salary_structures s
                            WHERE s.employee_id = e.id AND s.effective_from <= ?
                            ORDER BY s.effective_from DESC, s.id DESC LIMIT 1)
                      WHERE e.department_id = d.id AND e.is_deleted = 0
                        AND e.employment_status <> 'exited') AS budget_monthly
             FROM departments d
             ORDER BY d.name",
            [$asOf],
        );
    }

    /** @return array<string,mixed>|null */
    public function find(string $id): ?array
    {
        return $this->db->selectOne('SELECT * FROM departments WHERE id = ?', [$id]);
    }

    public function exists(string $id): bool
    {
        $row = $this->db->selectOne('SELECT COUNT(*) AS c FROM departments WHERE id = ?', [$id]);
        return (int) ($row['c'] ?? 0) > 0;
    }
}
