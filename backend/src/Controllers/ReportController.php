<?php

declare(strict_types=1);

namespace PayLens\Controllers;

use PayLens\Core\App;
use PayLens\Core\Money;
use PayLens\Core\Request;
use PayLens\Core\Response;
use PayLens\Repositories\AnomalyRepository;
use PayLens\Repositories\DepartmentRepository;
use PayLens\Repositories\EmployeeRepository;
use PayLens\Repositories\NotificationRepository;
use PayLens\Repositories\PayrollRepository;
use PayLens\Repositories\TaxSlabRepository;
use PayLens\Services\ReportService;
use PayLens\Support\Mapper;

/**
 * Reporting.
 *
 * Every figure is read from the database. The report shapes mirror the
 * tables the existing Reports page already renders, so the page keeps its
 * layout and only changes where the numbers come from.
 */
final class ReportController extends Controller
{
    private PayrollRepository $payroll;
    private EmployeeRepository $employees;
    private DepartmentRepository $departments;
    private AnomalyRepository $anomalies;
    private NotificationRepository $notifications;
    private TaxSlabRepository $slabs;

    public function __construct(App $app)
    {
        parent::__construct($app);
        $this->payroll = new PayrollRepository($app->db);
        $this->employees = new EmployeeRepository($app->db);
        $this->departments = new DepartmentRepository($app->db);
        $this->anomalies = new AnomalyRepository($app->db);
        $this->notifications = new NotificationRepository($app->db);
        $this->slabs = new TaxSlabRepository($app->db);
    }

    /** GET /api/reports/dashboard */
    public function dashboard(Request $request): void
    {
        $user = $this->requireUser($request);

        // The dashboard of an employee is their own: what they were paid and
        // what is open on their record. The organisation-wide figures are
        // for the roles that run payroll.
        if ($this->isSelfScoped($request)) {
            Response::json($this->personalDashboard($request, $user));
            return;
        }

        $runs = $this->payroll->runs();
        $asOf = (new \DateTimeImmutable('now'))->format('Y-m-d');

        $current = $runs[0] ?? null;
        $previous = $runs[1] ?? null;
        $growth = 0.0;
        if ($current !== null && $previous !== null && (int) $previous['total_gross_paise'] > 0) {
            $growth = round(
                (((int) $current['total_gross_paise'] - (int) $previous['total_gross_paise'])
                    / (int) $previous['total_gross_paise']) * 100,
                1,
            );
        }

        $trend = array_map(static fn (array $r): array => [
            'id' => (string) $r['id'],
            'month' => (int) $r['period_month'],
            'year' => (int) $r['period_year'],
            'label' => sprintf('%04d-%02d', (int) $r['period_year'], (int) $r['period_month']),
            'gross' => Mapper::rupees($r['total_gross_paise'] ?? 0),
            'net' => Mapper::rupees($r['total_net_paise'] ?? 0),
            'tax' => Mapper::rupees($r['total_tax_paise'] ?? 0),
            'employees' => (int) $r['employee_count'],
        ], array_reverse($runs));

        $departmentRows = $this->departments->all($asOf);
        $departments = array_map(static fn (array $d): array => [
            'name' => (string) $d['name'],
            'value' => (int) $d['headcount'],
            'color' => (string) $d['color'],
        ], $departmentRows);

        $recent = array_slice($this->anomalies->search([]), 0, 4);
        $counts = $this->anomalies->counts();

        // Headcount change: the employee count of this period's run against
        // the previous one — a real figure, not a decorative one.
        $activeEmployeeChange = 0.0;
        if ($current !== null && $previous !== null && (int) $previous['employee_count'] > 0) {
            $activeEmployeeChange = round(
                (((int) $current['employee_count'] - (int) $previous['employee_count'])
                    / (int) $previous['employee_count']) * 100,
                1,
            );
        }

        // Anomaly change: detections in the last 30 days against the 30 days
        // before them.
        $now = new \DateTimeImmutable('now');
        $detectedRecently = $this->anomalies->detectedBetween(
            $now->modify('-30 days')->format('Y-m-d H:i:s'),
            $now->format('Y-m-d H:i:s'),
        );
        $detectedPreviously = $this->anomalies->detectedBetween(
            $now->modify('-60 days')->format('Y-m-d H:i:s'),
            $now->modify('-30 days')->format('Y-m-d H:i:s'),
        );
        $openAnomalyChange = $detectedPreviously > 0
            ? round((($detectedRecently - $detectedPreviously) / $detectedPreviously) * 100, 1)
            : 0.0;

        Response::json([
            'currentRun' => $current !== null ? Mapper::payrollRun($current) : null,
            'previousRun' => $previous !== null ? Mapper::payrollRun($previous) : null,
            'growth' => $growth,
            'activeEmployees' => $this->employees->countByStatus('active'),
            'activeEmployeeChange' => $activeEmployeeChange,
            'openAnomalies' => $counts['open'] + $counts['investigating'],
            'openAnomalyChange' => $openAnomalyChange,
            'criticalAnomalies' => $counts['critical'],
            'highAnomalies' => $counts['high'],
            'unreadNotifications' => $this->notifications->unreadCount((int) $user['id']),
            'payrollNotifications' => $this->notifications->unreadInCategory('payroll', (int) $user['id']),
            'departmentCount' => count($departmentRows),
            'trend' => $trend,
            'departments' => $departments,
            'recentAnomalies' => array_map([Mapper::class, 'anomaly'], $recent),
        ]);
    }

    /**
     * The dashboard an employee sees: their own payslips and their own
     * anomalies, in the same shape as the organisation-wide one.
     *
     * The figures are the employee's, never the company's — the same
     * separation of duties the payslip endpoints enforce.
     *
     * @param array<string,mixed> $user
     * @return array<string,mixed>
     */
    private function personalDashboard(Request $request, array $user): array
    {
        $employeeId = $this->ownEmployeeId($request);
        if ($employeeId === null) {
            return [
                'currentRun' => null,
                'previousRun' => null,
                'growth' => 0.0,
                'activeEmployees' => 0,
                'activeEmployeeChange' => 0.0,
                'openAnomalies' => 0,
                'openAnomalyChange' => 0.0,
                'criticalAnomalies' => 0,
                'highAnomalies' => 0,
                'unreadNotifications' => $this->notifications->unreadCount((int) $user['id']),
                'payrollNotifications' => $this->notifications->unreadInCategory('payroll', (int) $user['id']),
                'departmentCount' => 0,
                'trend' => [],
                'departments' => [],
                'recentAnomalies' => [],
            ];
        }

        // Newest first, so the first two are this period and the one before.
        $payslips = $this->payroll->payslipsForEmployee($employeeId, 6);

        $current = $payslips[0] ?? null;
        $previous = $payslips[1] ?? null;

        $gross = (int) ($current['gross_paise'] ?? 0);
        $previousGross = (int) ($previous['gross_paise'] ?? 0);
        $growth = $previousGross > 0
            ? round((($gross - $previousGross) / $previousGross) * 100, 1)
            : 0.0;

        $asRun = static fn (?array $payslip): ?array => $payslip === null ? null : [
            'id' => (string) $payslip['id'],
            'month' => (int) $payslip['period_month'],
            'year' => (int) $payslip['period_year'],
            'totalGross' => Mapper::rupees($payslip['gross_paise'] ?? 0),
            'totalNet' => Mapper::rupees($payslip['net_paise'] ?? 0),
            'employeesCount' => 1,
        ];

        $trend = array_map(static fn (array $payslip): array => [
            'id' => (string) $payslip['id'],
            'month' => (int) $payslip['period_month'],
            'year' => (int) $payslip['period_year'],
            'label' => sprintf('%04d-%02d', (int) $payslip['period_year'], (int) $payslip['period_month']),
            'gross' => Mapper::rupees($payslip['gross_paise'] ?? 0),
            'net' => Mapper::rupees($payslip['net_paise'] ?? 0),
            'tax' => Mapper::rupees($payslip['tax_paise'] ?? 0),
            'employees' => 1,
        ], array_reverse($payslips));

        $own = $this->anomalies->search(['employeeId' => $employeeId]);
        $open = array_values(array_filter(
            $own,
            static fn (array $a): bool => in_array((string) $a['status'], ['open', 'investigating'], true),
        ));
        $critical = 0;
        $high = 0;
        foreach ($open as $anomaly) {
            if ((string) $anomaly['severity'] === 'critical') {
                $critical++;
            } elseif ((string) $anomaly['severity'] === 'high') {
                $high++;
            }
        }

        $department = $this->app->db->selectOne(
            'SELECT d.id, d.name, d.color
             FROM employees e JOIN departments d ON d.id = e.department_id
             WHERE e.id = ?',
            [$employeeId],
        );

        return [
            'currentRun' => $asRun($current),
            'previousRun' => $asRun($previous),
            'growth' => $growth,
            'activeEmployees' => 1,
            'activeEmployeeChange' => 0.0,
            'openAnomalies' => count($open),
            'openAnomalyChange' => 0.0,
            'criticalAnomalies' => $critical,
            'highAnomalies' => $high,
            'unreadNotifications' => $this->notifications->unreadCount((int) $user['id']),
            'payrollNotifications' => $this->notifications->unreadInCategory('payroll', (int) $user['id']),
            'departmentCount' => $department === null ? 0 : 1,
            'trend' => $trend,
            'departments' => $department === null ? [] : [[
                'name' => (string) $department['name'],
                'value' => 1,
                'color' => (string) $department['color'],
            ]],
            'recentAnomalies' => array_map([Mapper::class, 'anomaly'], array_slice($own, 0, 4)),
        ];
    }

    /** GET /api/reports/analytics */
    public function analytics(Request $request): void
    {
        $this->requirePermission($request, 'analytics:read');
        $runs = $this->payroll->runs();
        $asOf = (new \DateTimeImmutable('now'))->format('Y-m-d');

        $current = $runs[0] ?? null;
        $previous = $runs[1] ?? null;
        $growth = 0.0;
        if ($current !== null && $previous !== null && (int) $previous['total_gross_paise'] > 0) {
            $growth = round(
                (((int) $current['total_gross_paise'] - (int) $previous['total_gross_paise'])
                    / (int) $previous['total_gross_paise']) * 100,
                1,
            );
        }

        $employees = $this->employees->allActive($asOf);
        $headcount = count($employees);
        $grossTotal = 0;
        foreach ($employees as $employee) {
            $grossTotal += (int) ($employee['monthly_gross_paise'] ?? 0);
        }
        $averageSalary = $headcount > 0 ? round(Money::fromMinor($grossTotal) / $headcount, 2) : 0.0;

        $bands = [
            ['label' => '<5L', 'min' => 0, 'max' => 500000, 'count' => 0],
            ['label' => '5–10L', 'min' => 500000, 'max' => 1000000, 'count' => 0],
            ['label' => '10–20L', 'min' => 1000000, 'max' => 2000000, 'count' => 0],
            ['label' => '20–30L', 'min' => 2000000, 'max' => 3000000, 'count' => 0],
            ['label' => '30–50L', 'min' => 3000000, 'max' => 5000000, 'count' => 0],
            ['label' => '>50L', 'min' => 5000000, 'max' => null, 'count' => 0],
        ];
        foreach ($employees as $employee) {
            $ctc = (float) ($employee['ctc_annual_paise'] ?? 0);
            foreach ($bands as $index => $band) {
                if ($ctc >= $band['min'] && ($band['max'] === null || $ctc < $band['max'])) {
                    $bands[$index]['count']++;
                    break;
                }
            }
        }

        $departmentRows = $this->departments->all($asOf);
        $deptSpend = array_map(static fn (array $d): array => [
            'name' => (string) $d['name'],
            'value' => (int) $d['headcount'],
            'color' => (string) $d['color'],
            'spend' => Mapper::rupees($d['budget_monthly'] ?? 0),
        ], $departmentRows);
        $totalSpend = 0.0;
        foreach ($deptSpend as $dept) {
            $totalSpend += (float) $dept['spend'];
        }

        Response::json([
            'lastGross' => $current !== null ? Mapper::rupees($current['total_gross_paise'] ?? 0) : 0,
            'prevGross' => $previous !== null ? Mapper::rupees($previous['total_gross_paise'] ?? 0) : 0,
            'growth' => $growth,
            'averageSalary' => $averageSalary,
            'headcount' => $headcount,
            'activeEmployeeChange' => $current !== null && $previous !== null && (int) $previous['employee_count'] > 0
                ? round((((int) $current['employee_count'] - (int) $previous['employee_count']) / (int) $previous['employee_count']) * 100, 1)
                : 0.0,
            'departmentCount' => count($departmentRows),
            'trend' => array_map(static fn (array $r): array => [
                'id' => (string) $r['id'],
                'month' => (int) $r['period_month'],
                'year' => (int) $r['period_year'],
                'label' => sprintf('%04d-%02d', (int) $r['period_year'], (int) $r['period_month']),
                'gross' => Mapper::rupees($r['total_gross_paise'] ?? 0),
                'net' => Mapper::rupees($r['total_net_paise'] ?? 0),
                'tax' => Mapper::rupees($r['total_tax_paise'] ?? 0),
                'employees' => (int) $r['employee_count'],
            ], array_reverse($runs)),
            'ctcBands' => array_map(static fn (array $b): array => [
                'label' => $b['label'],
                'count' => $b['count'],
            ], $bands),
            'departments' => $deptSpend,
            'totalSpend' => round($totalSpend, 2),
        ]);
    }

    /** GET /api/summary — the counters the shell shows in its badges. */
    public function summary(Request $request): void
    {
        $user = $this->requireUser($request);
        $counts = $this->anomalies->counts();

        Response::json([
            'unreadNotifications' => $this->notifications->unreadCount((int) $user['id']),
            'openAnomalies' => $counts['open'] + $counts['investigating'],
            'criticalAnomalies' => $counts['critical'],
            'activeEmployees' => $this->employees->countByStatus('active'),
        ]);
    }

    /** GET /api/reports/tax-center */
    public function taxCenter(Request $request): void
    {
        // The tax centre reports what the organisation as a whole withheld.
        // An employee has their own tax information at `/api/me/tax`.
        $this->requirePermission($request, 'reports:read');
        $runs = $this->payroll->runs();
        $asOf = (new \DateTimeImmutable('now'))->format('Y-m-d');

        $current = $runs[0] ?? null;
        $previous = $runs[1] ?? null;

        $ytd = 0;
        foreach ($runs as $run) {
            $ytd += (int) ($run['total_tax_paise'] ?? 0);
        }
        $currentTax = (int) ($current['total_tax_paise'] ?? 0);

        $trend = array_map(static fn (array $r): array => [
            'id' => (string) $r['id'],
            'month' => (int) $r['period_month'],
            'year' => (int) $r['period_year'],
            'label' => sprintf('%04d-%02d', (int) $r['period_year'], (int) $r['period_month']),
            'tax' => Mapper::rupees($r['total_tax_paise'] ?? 0),
        ], array_reverse($runs));

        // The departmental split is proportional to headcount, matching the
        // way the tax centre has always presented it.
        $departmentRows = $this->departments->all($asOf);
        $headcount = 0;
        foreach ($departmentRows as $department) {
            $headcount += (int) $department['headcount'];
        }
        $split = [];
        foreach ($departmentRows as $department) {
            $share = $headcount > 0 ? ((int) $department['headcount'] / $headcount) * $currentTax : 0;
            $split[] = [
                'name' => (string) $department['name'],
                'color' => (string) $department['color'],
                'value' => (int) $department['headcount'],
                'tax' => Mapper::rupees((int) round($share)),
            ];
        }

        $slabs = $this->slabs->withCounts($this->slabs->all());

        // Effective rate: the tax actually withheld against the gross
        // payroll of the period — a measured figure, not a quoted one.
        $gross = (int) ($current['total_gross_paise'] ?? 0);
        $effectiveTaxRate = $gross > 0 ? round(($currentTax / $gross) * 100, 1) : 0.0;

        // The largest single tax contribution in the period.
        $topContributor = $this->app->db->selectOne(
            'SELECT p.employee_id, p.employee_name, p.tax_paise
             FROM payslips p
             WHERE p.payroll_run_id = ?
             ORDER BY p.tax_paise DESC, p.employee_id
             LIMIT 1',
            [(string) ($current['id'] ?? '')],
        );

        // Trend of the monthly tax: the last three periods against the
        // first three — what the projection is based on.
        $projectedAnnualChange = 0.0;
        $taxes = array_map(static fn (array $r): float => (float) ($r['total_tax_paise'] ?? 0), $runs);
        if (count($taxes) >= 2) {
            $half = (int) floor(count($taxes) / 2);
            $earlier = array_slice($taxes, 0, $half);
            $later = array_slice($taxes, -$half);
            $avgEarlier = array_sum($earlier) / max(1, count($earlier));
            $avgLater = array_sum($later) / max(1, count($later));
            if ($avgEarlier > 0) {
                $projectedAnnualChange = round((($avgLater - $avgEarlier) / $avgEarlier) * 100, 1);
            }
        }

        Response::json([
            'currentTax' => Mapper::rupees($currentTax),
            'previousTax' => Mapper::rupees((int) ($previous['total_tax_paise'] ?? 0)),
            'growth' => $currentTax > 0 && $previous !== null && (int) $previous['total_tax_paise'] > 0
                ? round((($currentTax - (int) $previous['total_tax_paise']) / (int) $previous['total_tax_paise']) * 100, 1)
                : 0.0,
            'ytdTax' => Mapper::rupees($ytd),
            'projectedAnnual' => Mapper::rupees($ytd + $currentTax * 6),
            'projectedAnnualChange' => $projectedAnnualChange,
            'effectiveTaxRate' => $effectiveTaxRate,
            'periodCount' => count($runs),
            'highestContributor' => $topContributor !== null ? [
                'employeeId' => (string) $topContributor['employee_id'],
                'name' => (string) $topContributor['employee_name'],
                'tax' => Mapper::rupees((int) $topContributor['tax_paise']),
            ] : null,
            'employeeCount' => $headcount,
            'trend' => $trend,
            'departments' => $split,
            'slabs' => array_map(static fn (array $s): array => [
                'label' => $s['label'],
                'rate' => ($s['rateBasisPoints'] / 100) . '%',
                'count' => $s['count'],
            ], $slabs),
        ]);
    }

    /** GET /api/reports/{type} */
    public function show(Request $request, array $params): void
    {
        $this->requirePermission($request, 'reports:read');
        $type = (string) $params['type'];
        $report = $this->build($type);
        if ($report === null) {
            Response::error('not_found', 'Unknown report.', 404);
            return;
        }
        Response::json($report);
    }

    /** GET /api/reports/{type}.csv */
    public function csv(Request $request, array $params): void
    {
        $this->requirePermission($request, 'reports:export');
        $type = (string) $params['type'];
        $report = $this->build($type);
        if ($report === null) {
            Response::error('not_found', 'Unknown report.', 404);
            return;
        }

        $this->app->audit->log(
            $this->actorId($request),
            'report.generated',
            'report',
            $type,
            'success',
            ['rows' => count($report['rows'])],
            $request->ip(),
        );

        Response::csv(
            'paylens-' . str_replace('_', '-', $type) . '-' . date('Y-m-d') . '.csv',
            $report['headers'],
            $report['rows'],
        );
    }

    /**
     * Build a report from stored records.
     *
     * @return array{title:string,headers:array<int,string>,rows:array<int,array<int,mixed>>}|null
     */
    /**
     * Build a report from the stored records.
     *
     * The work is done by ReportService, which the scheduled report
     * delivery also uses — a scheduled report can therefore never disagree
     * with what an operator sees on screen.
     *
     * @param array<string,mixed> $filters
     * @return array{title:string,headers:array<int,string>,rows:array<int,array<int,mixed>>}|null
     */
    private function build(string $type, array $filters = []): ?array
    {
        return (new ReportService($this->app))->build($type, $filters);
    }
}
