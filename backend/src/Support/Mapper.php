<?php

declare(strict_types=1);

namespace PayLens\Support;

use PayLens\Core\Money;

/**
 * Row → API shape mappers.
 *
 * The API returns the same field names the frontend already uses, so the
 * pages keep their existing prop and field references. Money is exposed
 * twice on purpose:
 *
 *   monthlyGross      — a rupee number, for display only
 *   monthlyGrossPaise — the authoritative integer, for anything that matters
 *
 * The server never computes with the display value; it is derived from the
 * integer at the edge.
 */
final class Mapper
{
    /** @param array<string,mixed> $row */
    public static function employee(array $row): array
    {
        $basic = (int) ($row['basic_paise'] ?? 0);
        $hra = (int) ($row['hra_paise'] ?? 0);
        $special = (int) ($row['special_allowance_paise'] ?? 0);
        $travel = (int) ($row['travel_allowance_paise'] ?? 0);
        // Monthly gross is the sum of the earning components, so it always
        // agrees with the payslip the payroll engine produces.
        $monthlyGrossPaise = (int) ($row['monthly_gross_paise'] ?? ($basic + $hra + $special + $travel));

        return [
            'id' => (string) $row['id'],
            'name' => trim((string) $row['first_name'] . ' ' . (string) $row['last_name']),
            'firstName' => (string) $row['first_name'],
            'lastName' => (string) $row['last_name'],
            'email' => (string) $row['email'],
            'phone' => $row['phone'] !== null ? (string) $row['phone'] : '',
            'designation' => (string) $row['designation'],
            'departmentId' => (string) $row['department_id'],
            'role' => (string) ($row['app_role'] ?? 'employee'),
            'joinedAt' => (string) $row['date_of_joining'],
            'status' => (string) $row['employment_status'],
            'employmentType' => (string) ($row['employment_type'] ?? 'full_time'),
            'performanceRating' => $row['performance_rating'] !== null ? (int) $row['performance_rating'] : null,
            'avatarSeed' => (string) ($row['avatar_seed'] ?? ''),
            'ctcAnnual' => self::rupees($row['ctc_annual_paise'] ?? 0),
            'ctcAnnualPaise' => (int) ($row['ctc_annual_paise'] ?? 0),
            'monthlyGross' => self::rupees($monthlyGrossPaise),
            'monthlyGrossPaise' => $monthlyGrossPaise,
            'salary' => [
                'basic' => self::rupees($basic),
                'hra' => self::rupees($hra),
                'specialAllowance' => self::rupees($special),
                'travelAllowance' => self::rupees($travel),
                'pf' => self::rupees($row['pf_paise'] ?? 0),
                'professionalTax' => self::rupees($row['professional_tax_paise'] ?? 0),
            ],
            'bank' => [
                'account' => (string) ($row['bank_account'] ?? ''),
                'ifsc' => (string) ($row['bank_ifsc'] ?? ''),
                'bankName' => (string) ($row['bank_name'] ?? ''),
            ],
            'attendance' => [
                'present' => (int) ($row['attendance_present'] ?? 0),
                'absent' => (int) ($row['attendance_absent'] ?? 0),
                'late' => (int) ($row['attendance_late'] ?? 0),
                'leaves' => (int) ($row['attendance_leaves'] ?? 0),
            ],
        ];
    }

    /** @param array<string,mixed> $row */
    public static function department(array $row): array
    {
        return [
            'id' => (string) $row['id'],
            'name' => (string) $row['name'],
            'color' => (string) $row['color'],
            'fill' => 'fill-dept-' . (string) $row['id'],
            'icon' => (string) ($row['icon'] ?? 'Users'),
            'headEmployeeId' => (string) ($row['head_employee_id'] ?? ''),
            'headcount' => (int) ($row['headcount'] ?? 0),
            'budgetMonthly' => self::rupees($row['budget_monthly'] ?? 0),
            'budgetMonthlyPaise' => (int) ($row['budget_monthly'] ?? 0),
        ];
    }

    /** @param array<string,mixed> $row */
    public static function payrollRun(array $row): array
    {
        return [
            'id' => (string) $row['id'],
            'month' => (int) $row['period_month'],
            'year' => (int) $row['period_year'],
            'status' => self::runStatus((string) $row['status']),
            'employeesCount' => (int) $row['employee_count'],
            'totalGross' => self::rupees($row['total_gross_paise'] ?? 0),
            'totalGrossPaise' => (int) ($row['total_gross_paise'] ?? 0),
            'totalNet' => self::rupees($row['total_net_paise'] ?? 0),
            'totalNetPaise' => (int) ($row['total_net_paise'] ?? 0),
            'totalTax' => self::rupees($row['total_tax_paise'] ?? 0),
            'totalTaxPaise' => (int) ($row['total_tax_paise'] ?? 0),
            'totalDeductions' => self::rupees($row['total_deductions_paise'] ?? 0),
            'totalDeductionsPaise' => (int) ($row['total_deductions_paise'] ?? 0),
            'processedBy' => $row['processed_by_name'] ?? null,
            'approvedBy' => $row['approved_by_name'] ?? null,
            'processedAt' => $row['processed_at'] ?? null,
            'approvedAt' => $row['approved_at'] ?? null,
            'finalizedAt' => $row['finalized_at'] ?? null,
            'submittedAt' => $row['submitted_at'] ?? null,
            'rejectionReason' => $row['rejection_reason'] ?? null,
            'createdAt' => (string) $row['created_at'],
        ];
    }

    /**
     * @param array<string,mixed> $row
     * @param array<int,array<string,mixed>> $lines
     */
    public static function payslip(array $row, array $lines = []): array
    {
        $earnings = [];
        $deductions = [];
        foreach ($lines as $line) {
            $mapped = [
                'kind' => (string) $line['kind'] === 'earning'
                    ? (string) $line['code']
                    : (string) $line['code'],
                'label' => (string) $line['label'],
                'amount' => self::rupees($line['amount_paise']),
                'amountPaise' => (int) $line['amount_paise'],
            ];
            if ((string) $line['kind'] === 'earning') {
                $earnings[] = $mapped;
            } else {
                $deductions[] = $mapped;
            }
        }

        return [
            'id' => (string) $row['id'],
            'payrollRunId' => (string) $row['payroll_run_id'],
            'employeeId' => (string) $row['employee_id'],
            'employeeName' => (string) ($row['employee_name'] ?? ''),
            'designation' => (string) ($row['designation'] ?? ''),
            'departmentId' => (string) ($row['department_id'] ?? ''),
            'departmentName' => (string) ($row['department_name'] ?? ''),
            'month' => (int) $row['period_month'],
            'year' => (int) $row['period_year'],
            'earnings' => $earnings,
            'deductions' => $deductions,
            'gross' => self::rupees($row['gross_paise']),
            'grossPaise' => (int) $row['gross_paise'],
            'totalDeductions' => self::rupees($row['total_deductions_paise']),
            'totalDeductionsPaise' => (int) $row['total_deductions_paise'],
            'net' => self::rupees($row['net_paise']),
            'netPaise' => (int) $row['net_paise'],
            'tax' => self::rupees($row['tax_paise'] ?? 0),
            'taxPaise' => (int) ($row['tax_paise'] ?? 0),
            'workingDays' => (int) ($row['working_days'] ?? 0),
            'daysPresent' => (int) ($row['days_present'] ?? 0),
            'status' => self::runStatus((string) $row['status']),
            'generatedAt' => (string) $row['generated_at'],
        ];
    }

    /** @param array<string,mixed> $row */
    public static function anomaly(array $row): array
    {
        return [
            'id' => (string) $row['id'],
            'type' => (string) $row['type'],
            'severity' => (string) $row['severity'],
            'status' => (string) $row['status'],
            'employeeId' => $row['employee_id'] !== null ? (string) $row['employee_id'] : null,
            'payrollRunId' => $row['payroll_run_id'] !== null ? (string) $row['payroll_run_id'] : null,
            'title' => (string) $row['title'],
            'description' => (string) $row['description'],
            'detectedAt' => (string) $row['detected_at'],
            'riskScore' => (int) $row['risk_score'],
            'amount' => $row['amount_paise'] !== null ? self::rupees($row['amount_paise']) : null,
            'amountPaise' => $row['amount_paise'] !== null ? (int) $row['amount_paise'] : null,
            'assignedTo' => $row['assigned_to'] !== null ? (string) $row['assigned_to'] : null,
        ];
    }

    /** @param array<string,mixed> $row */
    public static function notification(array $row): array
    {
        return [
            'id' => (string) $row['id'],
            'type' => (string) $row['type'],
            'category' => (string) $row['category'],
            'title' => (string) $row['title'],
            'description' => (string) $row['description'],
            'timestamp' => (string) $row['created_at'],
            'read' => $row['read_at'] !== null,
            'actionLabel' => $row['action_label'] !== null ? (string) $row['action_label'] : null,
            'actionHref' => $row['action_href'] !== null ? (string) $row['action_href'] : null,
            'severity' => $row['severity'] !== null ? (string) $row['severity'] : null,
        ];
    }

    /** @param array<string,mixed> $row */
    public static function auditLog(array $row): array
    {
        return [
            'id' => (string) $row['id'],
            'actor' => (string) ($row['actor_name'] ?? $row['actor_email'] ?? 'system'),
            'actorEmail' => $row['actor_email'] !== null ? (string) $row['actor_email'] : null,
            'actorRole' => (string) ($row['actor_role'] ?? 'admin'),
            'action' => (string) $row['action'],
            'entity' => (string) $row['entity_type'],
            'entityId' => $row['entity_id'] !== null ? (string) $row['entity_id'] : null,
            'description' => self::auditDescription($row),
            'timestamp' => (string) $row['created_at'],
            'ipAddress' => $row['ip_address'] !== null ? (string) $row['ip_address'] : null,
        ];
    }

    /**
     * The human-readable line for an audit entry.
     *
     * The table has no description column, so the text is taken from the
     * metadata the logger stored — that is where the detail of an action
     * lives.
     *
     * @param array<string,mixed> $row
     */
    private static function auditDescription(array $row): string
    {
        $description = $row['description'] ?? null;
        if (is_string($description) && $description !== '') {
            return $description;
        }

        $metadata = $row['metadata'] ?? null;
        if (is_string($metadata)) {
            $metadata = json_decode($metadata, true);
        }
        if (! is_array($metadata) || $metadata === []) {
            return '';
        }

        $parts = [];
        foreach ($metadata as $key => $value) {
            if (is_scalar($value) || $value === null) {
                $parts[] = $key . ': ' . (is_scalar($value) ? (string) $value : 'null');
            } elseif (is_array($value)) {
                $parts[] = $key . ': ' . (is_array($value) ? implode(', ', array_map(
                    static fn ($item): string => is_scalar($item) ? (string) $item : '',
                    $value,
                )) : '');
            }
        }

        return implode(' · ', $parts);
    }

    /** @param array<string,mixed> $row */
    public static function document(array $row): array
    {
        return [
            'id' => (string) $row['id'],
            'employeeId' => (string) $row['employee_id'],
            'name' => (string) $row['name'],
            'type' => (string) $row['type'],
            'status' => (string) $row['status'],
            'issuedAt' => $row['issued_at'] !== null ? (string) $row['issued_at'] : null,
            'expiresAt' => $row['expires_at'] !== null ? (string) $row['expires_at'] : null,
            'sizeBytes' => (int) $row['size_bytes'],
            'createdAt' => (string) $row['created_at'],
        ];
    }

    /** @param array<string,mixed> $row */
    public static function user(array $row): array
    {
        return [
            'id' => (string) $row['id'],
            'name' => (string) $row['name'],
            'email' => (string) $row['email'],
            'role' => (string) $row['role'],
            'employeeId' => $row['employee_id'] !== null ? (string) $row['employee_id'] : null,
            'avatarSeed' => (string) ($row['avatar_seed'] ?? ''),
        ];
    }

    /** Rupee value derived from integer paise — for display only. */
    public static function rupees(mixed $paise): float
    {
        return round(Money::fromMinor((int) $paise), 2);
    }

    /**
     * Map an internal workflow status onto the status the UI already uses.
     *
     * A finalized run is *not* "paid": whether the money reached an
     * employee is tracked separately, in the payment records.
     */
    private static function runStatus(string $status): string
    {
        return match ($status) {
            'draft' => 'draft',
            'calculated' => 'review',
            'submitted' => 'submitted',
            'rejected' => 'rejected',
            'approved' => 'approved',
            'finalized' => 'finalized',
            'reversed' => 'failed',
            default => 'draft',
        };
    }
}
