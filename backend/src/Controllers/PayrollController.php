<?php

declare(strict_types=1);

namespace PayLens\Controllers;

use PayLens\Core\App;
use PayLens\Core\HttpException;
use PayLens\Core\Money;
use PayLens\Core\Request;
use PayLens\Core\Response;
use PayLens\Repositories\EmployeeRepository;
use PayLens\Repositories\PayrollRepository;
use PayLens\Repositories\UserRepository;
use PayLens\Services\AuditLogger;
use PayLens\Services\PayrollCalculator;
use PayLens\Services\PayrollService;
use PayLens\Services\RuleRepository;
use PayLens\Support\Mapper;

final class PayrollController extends Controller
{
    private PayrollRepository $runs;
    private PayrollService $service;

    public function __construct(App $app)
    {
        parent::__construct($app);
        $this->runs = new PayrollRepository($app->db);
        $rules = new RuleRepository($app->db);
        $this->service = new PayrollService(
            $app,
            $this->runs,
            new EmployeeRepository($app->db),
            new UserRepository($app->db),
            $rules,
            new PayrollCalculator($app->db, $rules),
            new AuditLogger($app->db),
        );
    }

    /** GET /api/payroll/runs */
    public function index(Request $request): void
    {
        $this->requirePermission($request, 'payroll:read');

        // The run list is an operations view: it carries what the whole
        // organisation cost. An employee reads their own payslips through
        // `/api/me/payslips` instead.
        if ($this->isSelfScoped($request)) {
            throw new HttpException(
                'forbidden',
                'You do not have permission to perform this action.',
                403,
            );
        }

        $rows = $this->runs->runs();
        Response::json(array_map([Mapper::class, 'payrollRun'], $rows));
    }

    /** POST /api/payroll/runs */
    public function store(Request $request): void
    {
        $this->requirePermission($request, 'payroll:process');
        $data = $this->validated($request, [
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer|min:2000|max:2100',
        ]);

        try {
            $run = $this->service->createRun((int) $data['year'], (int) $data['month'], $this->actorId($request));
        } catch (\RuntimeException $e) {
            throw new HttpException('conflict', $e->getMessage(), 409);
        } catch (\InvalidArgumentException $e) {
            throw new HttpException('validation_failed', $e->getMessage(), 422);
        }

        Response::json(Mapper::payrollRun($run), 201);
    }

    /** GET /api/payroll/runs/{id} */
    public function show(Request $request, array $params): void
    {
        $this->requirePermission($request, 'payroll:read');
        $run = $this->runs->run((string) $params['id']);
        if ($run === null) {
            throw new HttpException('not_found', 'Payroll run not found.', 404);
        }
        Response::json(Mapper::payrollRun($run));
    }

    /** GET /api/payroll/runs/{id}/payslips */
    public function payslips(Request $request, array $params): void
    {
        $this->requirePermission($request, 'payroll:read');
        $runId = (string) $params['id'];
        $rows = $this->runs->payslips($runId);

        // An employee may only see their own payslip within a run.
        if ($this->isSelfScoped($request)) {
            $own = $this->ownEmployeeId($request);
            $rows = array_values(array_filter(
                $rows,
                static fn (array $row): bool => (string) $row['employee_id'] === (string) $own,
            ));
        }

        $data = array_map(
            fn (array $row): array => Mapper::payslip($row, $this->runs->payslipLines((string) $row['id'])),
            $rows,
        );
        Response::json($data);
    }

    /**
     * GET /api/payroll/runs/{id}/selection
     *
     * Who the run covers, who is excluded and who is not eligible.
     */
    public function selection(Request $request, array $params): void
    {
        $this->requirePermission($request, 'payroll:select');
        Response::json($this->service->selection((string) $params['id']));
    }

    /**
     * PUT /api/payroll/runs/{id}/selection
     *
     * @param array<string,mixed> $body
     */
    public function setSelection(Request $request, array $params): void
    {
        $this->requirePermission($request, 'payroll:select');
        $body = $request->all();

        $included = [];
        foreach ((array) ($body['included'] ?? []) as $employeeId) {
            $included[] = (string) $employeeId;
        }
        $excluded = [];
        foreach ((array) ($body['excluded'] ?? []) as $item) {
            if (is_array($item) && isset($item['id'])) {
                $excluded[] = [
                    'id' => (string) $item['id'],
                    'reason' => (string) ($item['reason'] ?? 'Excluded from this run'),
                ];
            }
        }

        try {
            $selection = $this->service->setSelection((string) $params['id'], $included, $excluded, $this->actorId($request));
        } catch (\RuntimeException $e) {
            throw new HttpException('conflict', $e->getMessage(), 409);
        }

        Response::json($selection);
    }

    /** POST /api/payroll/runs/{id}/calculate */
    public function calculate(Request $request, array $params): void
    {
        $this->requirePermission($request, 'payroll:process');
        try {
            $result = $this->service->calculate((string) $params['id'], $this->actorId($request));
        } catch (\RuntimeException $e) {
            throw new HttpException('conflict', $e->getMessage(), 409);
        }
        // The run is the payload; `errors` names anyone who was left out.
        Response::json(Mapper::payrollRun($result['run']) + ['errors' => $result['errors']]);
    }

    /** POST /api/payroll/runs/{id}/submit */
    public function submit(Request $request, array $params): void
    {
        $this->requirePermission($request, 'payroll:submit');
        try {
            $run = $this->service->submit((string) $params['id'], $this->actorId($request));
        } catch (\RuntimeException $e) {
            throw new HttpException('conflict', $e->getMessage(), 409);
        }
        Response::json(Mapper::payrollRun($run));
    }

    /** POST /api/payroll/runs/{id}/approve */
    public function approve(Request $request, array $params): void
    {
        $this->requirePermission($request, 'payroll:approve');
        try {
            $run = $this->service->approve((string) $params['id'], $this->actorId($request));
        } catch (\RuntimeException $e) {
            throw new HttpException('conflict', $e->getMessage(), 409);
        }
        Response::json(Mapper::payrollRun($run));
    }

    /** POST /api/payroll/runs/{id}/reject */
    public function reject(Request $request, array $params): void
    {
        $this->requirePermission($request, 'payroll:reject');
        $data = $this->validated($request, ['reason' => 'required|string|max:500']);
        try {
            $run = $this->service->reject((string) $params['id'], (string) $data['reason'], $this->actorId($request));
        } catch (\RuntimeException $e) {
            throw new HttpException('conflict', $e->getMessage(), 409);
        }
        Response::json(Mapper::payrollRun($run));
    }

    /** POST /api/payroll/runs/{id}/finalize */
    public function finalize(Request $request, array $params): void
    {
        $this->requirePermission($request, 'payroll:approve');
        try {
            $run = $this->service->finalize((string) $params['id'], $this->actorId($request));
        } catch (\RuntimeException $e) {
            throw new HttpException('conflict', $e->getMessage(), 409);
        }
        Response::json(Mapper::payrollRun($run));
    }

    /** POST /api/payroll/runs/{id}/reverse */
    public function reverse(Request $request, array $params): void
    {
        $this->requirePermission($request, 'payroll:approve');
        $data = $this->validated($request, ['reason' => 'required|string|max:500']);
        try {
            $run = $this->service->reverse((string) $params['id'], (string) $data['reason'], $this->actorId($request));
        } catch (\RuntimeException $e) {
            throw new HttpException('conflict', $e->getMessage(), 409);
        }
        Response::json(Mapper::payrollRun($run));
    }

    /** POST /api/payroll/runs/{id}/adjustments */
    public function addAdjustment(Request $request, array $params): void
    {
        $this->requirePermission($request, 'payroll:process');
        $data = $this->validated($request, [
            'employeeId' => 'nullable|string|max:32',
            'kind' => 'required|in:bonus,overtime,deduction',
            'amount' => 'required|numeric|min:0',
            'reason' => 'required|string|max:500',
            'approved' => 'nullable|boolean',
        ]);

        try {
            $adjustment = $this->service->addAdjustment(
                (string) $params['id'],
                isset($data['employeeId']) ? (string) $data['employeeId'] : null,
                (string) $data['kind'],
                Money::toMinor((float) $data['amount']),
                (string) $data['reason'],
                (bool) ($data['approved'] ?? false),
                $this->actorId($request),
            );
        } catch (\RuntimeException $e) {
            throw new HttpException('conflict', $e->getMessage(), 409);
        }

        Response::json([
            'id' => (int) ($adjustment['id'] ?? 0),
            'payrollRunId' => (string) ($adjustment['payroll_run_id'] ?? $params['id']),
            'employeeId' => isset($adjustment['employee_id']) ? (string) $adjustment['employee_id'] : null,
            'kind' => (string) ($adjustment['kind'] ?? ''),
            'amount' => Money::fromMinor((int) ($adjustment['amount_paise'] ?? 0)),
            'amountPaise' => (int) ($adjustment['amount_paise'] ?? 0),
            'reason' => (string) ($adjustment['reason'] ?? ''),
            'status' => (string) ($adjustment['status'] ?? 'pending'),
        ], 201);
    }

    /**
     * POST /api/payroll/preview
     *
     * What a period would cost, calculated without writing anything.
     */
    public function preview(Request $request): void
    {
        $this->requirePermission($request, 'payroll:process');
        $data = $this->validated($request, [
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer|min:2000|max:2100',
        ]);

        $year = (int) $data['year'];
        $month = (int) $data['month'];
        $period = new \DateTimeImmutable(sprintf('%04d-%02d-01', $year, $month));
        $asOf = $period->modify('last day of this month')->format('Y-m-d');

        $rules = new RuleRepository($this->app->db);
        $ruleSet = $rules->rulesFor($asOf);
        $calculator = new PayrollCalculator($this->app->db, $rules);
        $employees = new EmployeeRepository($this->app->db);

        $gross = 0;
        $deductions = 0;
        $net = 0;
        $tax = 0;
        $count = 0;

        foreach ($employees->allActive($asOf) as $employee) {
            $salary = $employees->currentSalary((string) $employee['id'], $asOf);
            if ($salary === null) {
                continue;
            }
            $result = $calculator->calculate($salary, $ruleSet);
            $gross += $result['gross_paise'];
            $deductions += $result['total_deductions_paise'];
            $net += $result['net_paise'];
            $tax += $result['tax_paise'];
            $count++;
        }

        Response::json([
            'employeeCount' => $count,
            'totalGross' => Money::fromMinor($gross),
            'totalGrossPaise' => $gross,
            'totalTax' => Money::fromMinor($tax),
            'totalTaxPaise' => $tax,
            'totalDeductions' => Money::fromMinor($deductions),
            'totalDeductionsPaise' => $deductions,
            'totalNet' => Money::fromMinor($net),
            'totalNetPaise' => $net,
        ]);
    }

    /** GET /api/payroll/approvals */
    public function approvals(Request $request): void
    {
        $this->requirePermission($request, 'payroll:approve');
        $rows = $this->app->db->select(
            "SELECT * FROM payroll_runs WHERE status IN ('submitted', 'rejected', 'approved') ORDER BY submitted_at DESC",
        );
        Response::json(array_map(static function (array $row): array {
            $run = Mapper::payrollRun($row);
            $run['rejectionReason'] = $row['rejection_reason'] !== null ? (string) $row['rejection_reason'] : null;
            $run['submittedAt'] = $row['submitted_at'];
            $run['employeeCount'] = (int) $row['employee_count'];
            return $run;
        }, $rows));
    }

    /** GET /api/payroll/rules */
    public function rules(Request $request): void
    {
        $this->requirePermission($request, 'payroll:read');
        $rules = new RuleRepository($this->app->db);
        $rows = $rules->all();
        Response::json(array_map(static fn (array $r): array => [
            'code' => (string) $r['code'],
            'name' => (string) $r['name'],
            'jurisdiction' => (string) $r['jurisdiction'],
            'basis' => (string) $r['basis'],
            'rateBasisPoints' => $r['rate_basis_points'] !== null ? (int) $r['rate_basis_points'] : null,
            'amountPaise' => $r['amount_paise'] !== null ? (int) $r['amount_paise'] : null,
            'capPaise' => $r['cap_paise'] !== null ? (int) $r['cap_paise'] : null,
            'effectiveFrom' => (string) $r['effective_from'],
            'effectiveTo' => $r['effective_to'] !== null ? (string) $r['effective_to'] : null,
            'enabled' => (int) $r['enabled'] === 1,
            'notes' => $r['notes'] !== null ? (string) $r['notes'] : null,
        ], $rows));
    }

    /** GET /api/payroll/approvers */
    public function approvers(Request $request): void
    {
        $this->requirePermission($request, 'payroll:read');
        $rows = $this->app->db->select(
            "SELECT DISTINCT u.id, u.name, u.email, u.role FROM users u
             JOIN role_permissions rp ON rp.role_name = u.role
             WHERE rp.permission_name = 'payroll:approve' AND u.status = 'active'
             ORDER BY u.name",
        );
        Response::json(array_map(static fn (array $row): array => [
            'id' => (string) $row['id'],
            'name' => (string) $row['name'],
            'email' => (string) $row['email'],
            'role' => (string) $row['role'],
        ], $rows));
    }
}
