<?php

declare(strict_types=1);

namespace PayLens\Services;

use PayLens\Core\App;
use PayLens\Core\Money;
use PayLens\Repositories\DepartmentRepository;
use PayLens\Repositories\EmployeeRepository;
use PayLens\Repositories\TaxSlabRepository;

/**
 * Report building.
 *
 * Every report is computed from the stored records. The same code serves the
 * on-screen report screens and the scheduled report delivery, so a scheduled
 * report can never disagree with what an operator sees.
 */
final class ReportService
{
    private EmployeeRepository $employees;
    private DepartmentRepository $departments;
    private TaxSlabRepository $slabs;

    public function __construct(private App $app)
    {
        $this->employees = new EmployeeRepository($app->db);
        $this->departments = new DepartmentRepository($app->db);
        $this->slabs = new TaxSlabRepository($app->db);
    }

    /** The report types the application supports. */
    public const TYPES = [
        'monthly_payroll' => 'Monthly payroll',
        'tax_summary' => 'Tax summary',
        'employee_salary' => 'Employee salary',
        'department_cost' => 'Department cost',
        'payroll_growth' => 'Payroll growth',
        'anomaly_report' => 'Anomaly report',
        'ytd_payroll' => 'Year-to-date payroll',
    ];

    /**
     * Build a report.
     *
     * @param array{period?:?string,department?:?string} $filters
     * @return array{title:string,headers:array<int,string>,rows:array<int,array<int,mixed>>}|null
     */
    public function build(string $type, array $filters = []): ?array
    {
        $asOf = (new \DateTimeImmutable('now'))->format('Y-m-d');

        return match ($type) {
            'monthly_payroll' => $this->monthlyPayroll($asOf),
            'tax_summary' => $this->taxSummary(),
            'employee_salary' => $this->employeeSalary($asOf),
            'department_cost' => $this->departmentCost($asOf),
            'payroll_growth' => $this->payrollGrowth(),
            'anomaly_report' => $this->anomalyReport(),
            'ytd_payroll' => $this->ytdPayroll(),
            default => null,
        };
    }

    private function monthlyPayroll(string $asOf): array
    {
        $rows = [];
        foreach ($this->employees->allActive($asOf) as $row) {
            $employee = \PayLens\Support\Mapper::employee($row);
            $department = $this->departments->find($employee['departmentId']);
            $salary = $this->employees->currentSalary($employee['id'], $asOf);
            $basic = $salary !== null ? (int) $salary['basic_paise'] : 0;
            $pf = $salary !== null ? (int) $salary['pf_paise'] : 0;
            $tax = Money::applyRate($basic, 1000);
            $net = (int) $employee['monthlyGrossPaise'] - $pf - $tax;
            $rows[] = [
                $employee['id'],
                $employee['name'],
                (string) ($department['name'] ?? ''),
                number_format($employee['monthlyGross'], 2, '.', ''),
                number_format(Money::fromMinor($pf), 2, '.', ''),
                number_format(Money::fromMinor($tax), 2, '.', ''),
                number_format(Money::fromMinor($net), 2, '.', ''),
            ];
        }
        return [
            'title' => 'Monthly payroll',
            'headers' => ['Employee ID', 'Name', 'Department', 'Gross', 'PF', 'Tax', 'Net'],
            'rows' => $rows,
        ];
    }

    private function taxSummary(): array
    {
        $rows = [];
        foreach ($this->slabs->withCounts($this->slabs->all()) as $slab) {
            $rows[] = [
                $slab['label'],
                ($slab['rateBasisPoints'] / 100) . '%',
                (string) $slab['count'],
            ];
        }
        return [
            'title' => 'Tax summary',
            'headers' => ['Slab', 'Rate', 'Employees'],
            'rows' => $rows,
        ];
    }

    private function employeeSalary(string $asOf): array
    {
        $rows = [];
        foreach ($this->employees->allActive($asOf) as $row) {
            $employee = \PayLens\Support\Mapper::employee($row);
            $rows[] = [
                $employee['id'],
                $employee['name'],
                $employee['designation'],
                number_format($employee['ctcAnnual'], 2, '.', ''),
                number_format($employee['monthlyGross'], 2, '.', ''),
            ];
        }
        return [
            'title' => 'Employee salary',
            'headers' => ['Employee ID', 'Name', 'Designation', 'CTC', 'Monthly Gross'],
            'rows' => $rows,
        ];
    }

    private function departmentCost(string $asOf): array
    {
        $rows = [];
        foreach ($this->departments->all($asOf) as $department) {
            $headcount = (int) $department['headcount'];
            $budget = (int) ($department['budget_monthly'] ?? 0);
            $rows[] = [
                (string) $department['name'],
                (string) $headcount,
                number_format(Money::fromMinor($budget), 2, '.', ''),
                number_format(Money::fromMinor($headcount > 0 ? intdiv($budget, $headcount) : 0), 2, '.', ''),
            ];
        }
        return [
            'title' => 'Department cost',
            'headers' => ['Department', 'Headcount', 'Monthly Spend', 'Avg Salary'],
            'rows' => $rows,
        ];
    }

    private function payrollGrowth(): array
    {
        $rows = [];
        $runs = $this->app->db->select(
            'SELECT * FROM payroll_runs ORDER BY period_year ASC, period_month ASC',
        );
        foreach ($runs as $run) {
            $rows[] = [
                (string) $run['id'],
                number_format(Money::fromMinor((int) $run['total_gross_paise']), 2, '.', ''),
                number_format(Money::fromMinor((int) $run['total_net_paise']), 2, '.', ''),
                (string) $run['employee_count'],
            ];
        }
        return [
            'title' => 'Payroll growth',
            'headers' => ['Period', 'Gross', 'Net', 'Employees'],
            'rows' => $rows,
        ];
    }

    private function anomalyReport(): array
    {
        $rows = [];
        $anomalies = $this->app->db->select('SELECT * FROM anomalies ORDER BY risk_score DESC, detected_at DESC');
        foreach ($anomalies as $anomaly) {
            $rows[] = [
                (string) $anomaly['id'],
                (string) $anomaly['title'],
                (string) $anomaly['severity'],
                (string) $anomaly['status'],
                (string) $anomaly['risk_score'],
                (string) $anomaly['detected_at'],
            ];
        }
        return [
            'title' => 'Anomaly report',
            'headers' => ['ID', 'Title', 'Severity', 'Status', 'Risk Score', 'Detected'],
            'rows' => $rows,
        ];
    }

    private function ytdPayroll(): array
    {
        $rows = [];
        $gross = 0;
        $tax = 0;
        $net = 0;
        $runs = $this->app->db->select(
            'SELECT * FROM payroll_runs ORDER BY period_year ASC, period_month ASC',
        );
        foreach ($runs as $run) {
            $gross += (int) $run['total_gross_paise'];
            $tax += (int) $run['total_tax_paise'];
            $net += (int) $run['total_net_paise'];
            $rows[] = [
                (string) $run['id'],
                number_format(Money::fromMinor((int) $run['total_gross_paise']), 2, '.', ''),
                number_format(Money::fromMinor((int) $run['total_tax_paise']), 2, '.', ''),
                number_format(Money::fromMinor((int) $run['total_net_paise']), 2, '.', ''),
            ];
        }
        if ($rows !== []) {
            $rows[] = [
                'YTD total',
                number_format(Money::fromMinor($gross), 2, '.', ''),
                number_format(Money::fromMinor($tax), 2, '.', ''),
                number_format(Money::fromMinor($net), 2, '.', ''),
            ];
        }
        return [
            'title' => 'Year-to-date payroll',
            'headers' => ['Period', 'Gross', 'Tax', 'Net'],
            'rows' => $rows,
        ];
    }
}
