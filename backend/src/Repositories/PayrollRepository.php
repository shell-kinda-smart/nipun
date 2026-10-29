<?php

declare(strict_types=1);

namespace PayLens\Repositories;

use PayLens\Core\Database;

final class PayrollRepository
{
    public function __construct(private Database $db)
    {
    }

    /** @return array<int,array<string,mixed>> */
    public function runs(): array
    {
        return $this->db->select(
            'SELECT r.*, pu.name AS processed_by_name, au.name AS approved_by_name
             FROM payroll_runs r
             LEFT JOIN users pu ON pu.id = r.processed_by
             LEFT JOIN users au ON au.id = r.approved_by
             ORDER BY r.period_year DESC, r.period_month DESC',
        );
    }

    /** @return array<string,mixed>|null */
    public function run(string $id): ?array
    {
        return $this->db->selectOne(
            'SELECT r.*, pu.name AS processed_by_name, au.name AS approved_by_name
             FROM payroll_runs r
             LEFT JOIN users pu ON pu.id = r.processed_by
             LEFT JOIN users au ON au.id = r.approved_by
             WHERE r.id = ?',
            [$id],
        );
    }

    /** @return array<string,mixed>|null */
    public function runForPeriod(int $year, int $month): ?array
    {
        return $this->db->selectOne(
            'SELECT * FROM payroll_runs WHERE period_year = ? AND period_month = ?',
            [$year, $month],
        );
    }

    public function createRun(string $id, int $year, int $month, ?int $processedBy): void
    {
        $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');
        $this->db->execute(
            'INSERT INTO payroll_runs (id, period_month, period_year, status, employee_count, created_at, updated_at)
             VALUES (?, ?, ?, ?, 0, ?, ?)',
            [$id, $month, $year, 'draft', $now, $now],
        );
    }

    public function updateRunTotals(
        string $id,
        string $status,
        int $employeeCount,
        int $gross,
        int $deductions,
        int $net,
        int $tax,
        ?string $rulesSnapshot,
        ?int $processedBy = null,
        ?int $approvedBy = null,
    ): void {
        $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');
        $this->db->execute(
            'UPDATE payroll_runs
             SET status = ?, employee_count = ?, total_gross_paise = ?, total_deductions_paise = ?,
                 total_net_paise = ?, total_tax_paise = ?, rules_snapshot = ?,
                 processed_by = COALESCE(?, processed_by),
                 approved_by = COALESCE(?, approved_by),
                 processed_at = CASE WHEN ? IS NOT NULL THEN ? ELSE processed_at END,
                 approved_at = CASE WHEN ? IS NOT NULL THEN ? ELSE approved_at END,
                 updated_at = ?
             WHERE id = ?',
            [
                $status, $employeeCount, $gross, $deductions, $net, $tax, $rulesSnapshot,
                $processedBy, $approvedBy,
                $processedBy, $now,
                $approvedBy, $now,
                $now, $id,
            ],
        );
    }

    public function finalizeRun(string $id): void
    {
        $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');
        $this->db->execute(
            "UPDATE payroll_runs SET status = 'finalized', finalized_at = ?, updated_at = ? WHERE id = ?",
            [$now, $now, $id],
        );
    }

    public function reverseRun(string $id): void
    {
        $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');
        $this->db->execute(
            "UPDATE payroll_runs SET status = 'reversed', updated_at = ? WHERE id = ?",
            [$now, $id],
        );
    }

    /** @return array<int,array<string,mixed>> */
    public function payslips(string $runId): array
    {
        return $this->db->select(
            'SELECT * FROM payslips WHERE payroll_run_id = ? ORDER BY employee_id',
            [$runId],
        );
    }

    /** @return array<int,array<string,mixed>> */
    public function payslipsForEmployee(string $employeeId, int $limit = 24): array
    {
        return $this->db->select(
            'SELECT * FROM payslips WHERE employee_id = ? ORDER BY period_year DESC, period_month DESC LIMIT ' . (int) $limit,
            [$employeeId],
        );
    }

    /** @return array<string,mixed>|null */
    public function payslip(string $id): ?array
    {
        return $this->db->selectOne('SELECT * FROM payslips WHERE id = ?', [$id]);
    }

    /** @return array<int,array<string,mixed>> */
    public function payslipLines(string $payslipId): array
    {
        return $this->db->select(
            'SELECT * FROM payslip_lines WHERE payslip_id = ? ORDER BY kind DESC, sequence',
            [$payslipId],
        );
    }

    public function deletePayslipsForRun(string $runId): void
    {
        $this->db->execute('DELETE FROM payslips WHERE payroll_run_id = ?', [$runId]);
    }

    /** @return array<int,array<string,mixed>> */
    public function adjustments(string $runId, ?string $employeeId = null, string $status = 'approved'): array
    {
        $sql = "SELECT * FROM payroll_adjustments WHERE payroll_run_id = ? AND status = ?";
        $params = [$runId, $status];
        if ($employeeId !== null) {
            $sql .= ' AND employee_id = ?';
            $params[] = $employeeId;
        }
        return $this->db->select($sql . ' ORDER BY id', $params);
    }
}
