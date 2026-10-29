<?php

declare(strict_types=1);

namespace PayLens\Controllers;

use PayLens\Core\App;
use PayLens\Core\Money;
use PayLens\Core\Request;
use PayLens\Core\Response;
use PayLens\Repositories\DepartmentRepository;
use PayLens\Repositories\EmployeeRepository;
use PayLens\Repositories\PayrollRepository;
use PayLens\Repositories\TaxSlabRepository;
use PayLens\Support\Mapper;

/**
 * The signed-in employee's own records.
 *
 * Every query here is scoped to the session's employee id — an employee
 * cannot reach another employee's data by changing a query parameter.
 */
final class MeController extends Controller
{
    private EmployeeRepository $employees;
    private DepartmentRepository $departments;
    private PayrollRepository $payroll;
    private TaxSlabRepository $slabs;

    public function __construct(App $app)
    {
        parent::__construct($app);
        $this->employees = new EmployeeRepository($app->db);
        $this->departments = new DepartmentRepository($app->db);
        $this->payroll = new PayrollRepository($app->db);
        $this->slabs = new TaxSlabRepository($app->db);
    }

    /** GET /api/me/profile */
    public function profile(Request $request): void
    {
        $user = $this->requireUser($request);
        $employeeId = (string) ($user['employee_id'] ?? '');
        if ($employeeId === '') {
            Response::error('not_found', 'No employee record is linked to this account.', 404);
            return;
        }

        $asOf = (new \DateTimeImmutable('now'))->format('Y-m-d');
        $row = $this->employees->find($employeeId, $asOf);
        if ($row === null) {
            Response::error('not_found', 'Employee record not found.', 404);
            return;
        }

        $employee = Mapper::employee($row);
        $department = $this->departments->find($employee['departmentId']);
        $employee['department'] = $department !== null ? Mapper::department($department) : null;

        Response::json($employee);
    }

    /** GET /api/me/payslips */
    public function payslips(Request $request): void
    {
        $user = $this->requireUser($request);
        $employeeId = (string) ($user['employee_id'] ?? '');
        if ($employeeId === '') {
            Response::json([]);
            return;
        }

        $rows = $this->payroll->payslipsForEmployee($employeeId);
        $data = array_map(
            fn (array $row): array => Mapper::payslip($row, $this->payroll->payslipLines((string) $row['id'])),
            $rows,
        );
        Response::json($data);
    }

    /** GET /api/me/tax */
    public function tax(Request $request): void
    {
        $user = $this->requireUser($request);
        $employeeId = (string) ($user['employee_id'] ?? '');
        if ($employeeId === '') {
            Response::error('not_found', 'No employee record is linked to this account.', 404);
            return;
        }

        $asOf = (new \DateTimeImmutable('now'))->format('Y-m-d');
        $row = $this->employees->find($employeeId, $asOf);
        if ($row === null) {
            Response::error('not_found', 'Employee record not found.', 404);
            return;
        }
        $employee = Mapper::employee($row);

        $ytd = 0;
        $ytdTax = 0;
        foreach ($this->payroll->payslipsForEmployee($employeeId, 24) as $payslip) {
            $ytd += (int) $payslip['gross_paise'];
            $ytdTax += (int) $payslip['tax_paise'];
        }

        $slabs = $this->slabs->withCounts($this->slabs->all());
        $slabRows = array_map(static fn (array $s): array => [
            'label' => $s['label'],
            'rate' => ($s['rateBasisPoints'] / 100) . '%',
            'count' => $s['count'],
            'notes' => $s['notes'],
        ], $slabs);

        Response::json([
            'data' => [
                'annualIncome' => $employee['ctcAnnual'],
                'taxable' => $employee['ctcAnnual'],
                'projectedTax' => Mapper::rupees($ytdTax),
                'ytd' => Mapper::rupees($ytd),
                'ytdTax' => Mapper::rupees($ytdTax),
                'slabs' => $slabRows,
                'disclaimer' => 'Figures are calculated from the configured demo rules and are not a tax assessment.',
            ],
        ]);
    }
}
