<?php

declare(strict_types=1);

namespace PayLens\Controllers;

use PayLens\Core\App;
use PayLens\Core\HttpException;
use PayLens\Core\Money;
use PayLens\Core\Request;
use PayLens\Core\Response;
use PayLens\Repositories\DepartmentRepository;
use PayLens\Repositories\EmployeeRepository;
use PayLens\Repositories\PayrollRepository;
use PayLens\Services\NotificationService;
use PayLens\Services\PayrollEligibility;
use PayLens\Support\Mapper;

final class EmployeeController extends Controller
{
    private EmployeeRepository $employees;
    private DepartmentRepository $departments;
    private PayrollRepository $payroll;

    public function __construct(App $app)
    {
        parent::__construct($app);
        $this->employees = new EmployeeRepository($app->db);
        $this->departments = new DepartmentRepository($app->db);
        $this->payroll = new PayrollRepository($app->db);
    }

    /** GET /api/employees */
    public function index(Request $request): void
    {
        $this->requirePermission($request, 'employees:read');
        $asOf = (new \DateTimeImmutable('now'))->format('Y-m-d');

        $result = $this->employees->search([
            'search' => $this->stringParam($request, 'q'),
            'department' => $this->stringParam($request, 'department'),
            'status' => $this->stringParam($request, 'status'),
            'sort' => $this->stringParam($request, 'sort', 'name'),
            'page' => $this->intParam($request, 'page', 1),
            'perPage' => $this->intParam($request, 'perPage', 25),
        ], $asOf);

        Response::json(
            array_map([Mapper::class, 'employee'], $result['items']),
            200,
            [
                'total' => $result['total'],
                'page' => $this->intParam($request, 'page', 1),
                'perPage' => $this->intParam($request, 'perPage', 25),
            ],
        );
    }

    /** GET /api/employees/export.csv */
    public function export(Request $request): void
    {
        $this->requirePermission($request, 'employees:read');
        $asOf = (new \DateTimeImmutable('now'))->format('Y-m-d');
        $result = $this->employees->search([
            'search' => $this->stringParam($request, 'q'),
            'department' => $this->stringParam($request, 'department'),
            'status' => $this->stringParam($request, 'status'),
            'perPage' => 200,
        ], $asOf);

        $rows = [];
        foreach ($result['items'] as $row) {
            $employee = Mapper::employee($row);
            $rows[] = [
                $employee['id'],
                $employee['name'],
                $employee['email'],
                $employee['designation'],
                (string) ($this->departments->find($employee['departmentId'])['name'] ?? ''),
                $employee['status'],
                $employee['joinedAt'],
                number_format($employee['ctcAnnual'], 2, '.', ''),
                number_format($employee['monthlyGross'], 2, '.', ''),
            ];
        }

        $this->app->audit->log(
            $this->actorId($request),
            'report.generated',
            'employee',
            null,
            'success',
            ['report' => 'employee_directory', 'rows' => count($rows)],
            $request->ip(),
        );

        Response::csv(
            'paylens-employees-' . date('Y-m-d') . '.csv',
            ['Employee ID', 'Name', 'Email', 'Designation', 'Department', 'Status', 'Joined', 'Annual CTC', 'Monthly Gross'],
            $rows,
        );
    }

    /** GET /api/employees/{id} */
    public function show(Request $request, array $params): void
    {
        $this->requirePermission($request, 'employees:read');
        $asOf = (new \DateTimeImmutable('now'))->format('Y-m-d');
        $row = $this->employees->find((string) $params['id'], $asOf);
        if ($row === null) {
            Response::error('not_found', 'Employee not found.', 404);
            return;
        }

        $employee = Mapper::employee($row);
        $department = $this->departments->find($employee['departmentId']);
        $employee['department'] = $department !== null ? Mapper::department($department) : null;
        $employee['colleagues'] = array_map(
            [Mapper::class, 'employee'],
            $this->employees->byDepartment($employee['departmentId'], $asOf),
        );
        $employee['salaryHistory'] = array_map(
            static fn (array $r): array => [
                'effectiveFrom' => (string) $r['effective_from'],
                'effectiveTo' => $r['effective_to'] !== null ? (string) $r['effective_to'] : null,
                'basic' => Mapper::rupees($r['basic_paise']),
                'ctcAnnual' => Mapper::rupees($r['ctc_annual_paise'] ?? 0),
            ],
            $this->employees->salaryHistory($employee['id']),
        );

        Response::json($employee);
    }

    /** POST /api/employees */
    public function store(Request $request): void
    {
        $this->requirePermission($request, 'employees:write');

        $data = $this->validated($request, [
            'firstName' => 'required|string|max:60',
            'lastName' => 'required|string|max:60',
            'email' => 'required|email|max:160',
            'phone' => 'nullable|string|max:32',
            'departmentId' => 'required|string|max:32',
            'designation' => 'required|string|max:80',
            'status' => 'nullable|in:active,on_leave,probation,exited',
            'employmentType' => 'nullable|in:full_time,part_time,contract',
            'joinedAt' => 'required|date',
            'dateOfBirth' => 'nullable|date',
            'gender' => 'nullable|in:female,male,non_binary,undisclosed',
            'performanceRating' => 'nullable|integer|min:1|max:5',
            'basic' => 'required|numeric|min:0',
            'hra' => 'nullable|numeric|min:0',
            'specialAllowance' => 'nullable|numeric|min:0',
            'travelAllowance' => 'nullable|numeric|min:0',
            'ctcAnnual' => 'nullable|numeric|min:0',
        ]);

        if (!$this->departments->exists((string) $data['departmentId'])) {
            Response::error('validation_failed', 'Unknown department.', 422, [
                'fields' => ['departmentId' => ['The selected department does not exist.']],
            ]);
            return;
        }
        if ($this->employees->emailExists((string) $data['email'])) {
            Response::error('validation_failed', 'That email address is already in use.', 422, [
                'fields' => ['email' => ['An employee with that email already exists.']],
            ]);
            return;
        }

        $id = $this->employees->nextId();
        $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');

        $this->app->db->transaction(function () use ($id, $data, $now, $request): void {
            $this->employees->create([
                'id' => $id,
                'first_name' => (string) $data['firstName'],
                'last_name' => (string) $data['lastName'],
                'email' => strtolower((string) $data['email']),
                'phone' => $data['phone'] ?? null,
                'department_id' => (string) $data['departmentId'],
                'designation' => (string) $data['designation'],
                'employment_status' => (string) ($data['status'] ?? 'active'),
                'employment_type' => (string) ($data['employmentType'] ?? 'full_time'),
                'date_of_joining' => (string) $data['joinedAt'],
                'date_of_birth' => $data['dateOfBirth'] ?? null,
                'gender' => $data['gender'] ?? null,
                'app_role' => 'employee',
                'performance_rating' => $data['performanceRating'] ?? null,
                'avatar_seed' => strtolower(str_replace(' ', '-', (string) $data['firstName'] . '-' . (string) $data['lastName'])),
            ]);

            $basic = Money::toMinor((float) $data['basic']);
            $hra = Money::toMinor((float) ($data['hra'] ?? 0));
            $special = Money::toMinor((float) ($data['specialAllowance'] ?? 0));
            $travel = Money::toMinor((float) ($data['travelAllowance'] ?? 0));

            $this->employees->addSalaryVersion(
                $id,
                (string) $data['joinedAt'],
                [
                    'basic_paise' => $basic,
                    'hra_paise' => $hra,
                    'special_allowance_paise' => $special,
                    'travel_allowance_paise' => $travel,
                    'pf_paise' => 0,
                    'professional_tax_paise' => 0,
                ],
                isset($data['ctcAnnual']) ? Money::toMinor((float) $data['ctcAnnual']) : null,
                $this->actorId($request),
            );
        });

        $this->app->audit->log(
            $this->actorId($request),
            'employee.created',
            'employee',
            $id,
            'success',
            ['department' => (string) $data['departmentId']],
            $request->ip(),
        );

        $row = $this->employees->find($id, (new \DateTimeImmutable('now'))->format('Y-m-d'));
        Response::json($row !== null ? Mapper::employee($row) : null, 201);
    }

    /** PATCH /api/employees/{id} */
    public function update(Request $request, array $params): void
    {
        $this->requirePermission($request, 'employees:write');
        $id = (string) $params['id'];

        $existing = $this->employees->find($id, (new \DateTimeImmutable('now'))->format('Y-m-d'));
        if ($existing === null) {
            Response::error('not_found', 'Employee not found.', 404);
            return;
        }

        $data = $this->validated($request, [
            'firstName' => 'nullable|string|max:60',
            'lastName' => 'nullable|string|max:60',
            'email' => 'nullable|email|max:160',
            'phone' => 'nullable|string|max:32',
            'departmentId' => 'nullable|string|max:32',
            'designation' => 'nullable|string|max:80',
            'status' => 'nullable|in:active,on_leave,probation,exited',
            'employmentType' => 'nullable|in:full_time,part_time,contract',
            'joinedAt' => 'nullable|date',
            'dateOfBirth' => 'nullable|date',
            'gender' => 'nullable|in:female,male,non_binary,undisclosed',
            'performanceRating' => 'nullable|integer|min:1|max:5',
        ]);

        if (isset($data['email']) && $this->employees->emailExists((string) $data['email'], $id)) {
            Response::error('validation_failed', 'That email address is already in use.', 422, [
                'fields' => ['email' => ['An employee with that email already exists.']],
            ]);
            return;
        }
        if (isset($data['departmentId']) && !$this->departments->exists((string) $data['departmentId'])) {
            Response::error('validation_failed', 'Unknown department.', 422, [
                'fields' => ['departmentId' => ['The selected department does not exist.']],
            ]);
            return;
        }

        $map = [
            'firstName' => 'first_name',
            'lastName' => 'last_name',
            'email' => 'email',
            'phone' => 'phone',
            'departmentId' => 'department_id',
            'designation' => 'designation',
            'status' => 'employment_status',
            'employmentType' => 'employment_type',
            'joinedAt' => 'date_of_joining',
            'dateOfBirth' => 'date_of_birth',
            'gender' => 'gender',
            'performanceRating' => 'performance_rating',
        ];
        $update = [];
        foreach ($map as $input => $column) {
            if (array_key_exists($input, $data) && $data[$input] !== null) {
                $update[$column] = $data[$input];
            }
        }
        if ($update !== []) {
            $this->employees->update($id, $update);
        }

        $this->app->audit->log(
            $this->actorId($request),
            'employee.updated',
            'employee',
            $id,
            'success',
            ['fields' => array_keys($update)],
            $request->ip(),
        );

        $row = $this->employees->find($id, (new \DateTimeImmutable('now'))->format('Y-m-d'));
        Response::json($row !== null ? Mapper::employee($row) : null);
    }

    /** POST /api/employees/{id}/archive */
    public function archive(Request $request, array $params): void
    {
        $this->requirePermission($request, 'employees:write');
        $id = (string) $params['id'];

        $existing = $this->employees->find($id, (new \DateTimeImmutable('now'))->format('Y-m-d'));
        if ($existing === null) {
            Response::error('not_found', 'Employee not found.', 404);
            return;
        }

        // Archiving keeps finalized payroll records intact; employees are
        // never hard-deleted.
        $this->employees->archive($id);
        $this->app->audit->log(
            $this->actorId($request),
            'employee.archived',
            'employee',
            $id,
            'success',
            ['hadFinalizedPayslips' => $this->employees->hasFinalizedPayslips($id)],
            $request->ip(),
        );

        Response::json(['ok' => true]);
    }

    /** GET /api/employees/{id}/compensation */
    public function compensation(Request $request, array $params): void
    {
        $this->requirePermission($request, 'employees:read');
        $id = (string) $params['id'];
        $asOf = (new \DateTimeImmutable('now'))->format('Y-m-d');
        $salary = $this->employees->currentSalary($id, $asOf);
        if ($salary === null) {
            Response::error('not_found', 'No compensation record for that employee.', 404);
            return;
        }

        Response::json([
            'data' => [
                'effectiveFrom' => (string) $salary['effective_from'],
                'effectiveTo' => $salary['effective_to'] !== null ? (string) $salary['effective_to'] : null,
                'basic' => Mapper::rupees($salary['basic_paise']),
                'hra' => Mapper::rupees($salary['hra_paise']),
                'specialAllowance' => Mapper::rupees($salary['special_allowance_paise']),
                'travelAllowance' => Mapper::rupees($salary['travel_allowance_paise']),
                'pf' => Mapper::rupees($salary['pf_paise']),
                'professionalTax' => Mapper::rupees($salary['professional_tax_paise']),
                'ctcAnnual' => Mapper::rupees($salary['ctc_annual_paise'] ?? 0),
                'history' => array_map(
                    static fn (array $r): array => [
                        'effectiveFrom' => (string) $r['effective_from'],
                        'effectiveTo' => $r['effective_to'] !== null ? (string) $r['effective_to'] : null,
                        'basic' => Mapper::rupees($r['basic_paise']),
                        'ctcAnnual' => Mapper::rupees($r['ctc_annual_paise'] ?? 0),
                    ],
                    $this->employees->salaryHistory($id),
                ),
            ],
        ]);
    }

    /** PUT /api/employees/{id}/compensation */
    public function updateCompensation(Request $request, array $params): void
    {
        $this->requirePermission($request, 'employees:write');
        $id = (string) $params['id'];

        if ($this->employees->find($id, (new \DateTimeImmutable('now'))->format('Y-m-d')) === null) {
            Response::error('not_found', 'Employee not found.', 404);
            return;
        }

        $data = $this->validated($request, [
            'effectiveFrom' => 'required|date',
            'basic' => 'required|numeric|min:0',
            'hra' => 'nullable|numeric|min:0',
            'specialAllowance' => 'nullable|numeric|min:0',
            'travelAllowance' => 'nullable|numeric|min:0',
            'ctcAnnual' => 'nullable|numeric|min:0',
        ]);

        // A change never overwrites history: a new version is inserted and
        // the previous one is closed off the day before.
        $this->employees->addSalaryVersion(
            $id,
            (string) $data['effectiveFrom'],
            [
                'basic_paise' => Money::toMinor((float) $data['basic']),
                'hra_paise' => Money::toMinor((float) ($data['hra'] ?? 0)),
                'special_allowance_paise' => Money::toMinor((float) ($data['specialAllowance'] ?? 0)),
                'travel_allowance_paise' => Money::toMinor((float) ($data['travelAllowance'] ?? 0)),
                'pf_paise' => 0,
                'professional_tax_paise' => 0,
            ],
            isset($data['ctcAnnual']) ? Money::toMinor((float) $data['ctcAnnual']) : null,
            $this->actorId($request),
        );

        $this->app->audit->log(
            $this->actorId($request),
            'salary.changed',
            'employee',
            $id,
            'success',
            ['effectiveFrom' => (string) $data['effectiveFrom']],
            $request->ip(),
        );

        Response::json(['ok' => true]);
    }

    // ── Holds ───────────────────────────────────────────────────────────────

    /** GET /api/employees/{id}/holds */
    public function holds(Request $request, array $params): void
    {
        $this->requirePermission($request, 'employees:read');
        $eligibility = new PayrollEligibility($this->app->db);
        Response::json($eligibility->holdsFor((string) $params['id']));
    }

    /** POST /api/employees/{id}/holds */
    public function placeHold(Request $request, array $params): void
    {
        $this->requirePermission($request, 'employees:hold');
        $id = (string) $params['id'];

        $data = $this->validated($request, [
            'reason' => 'required|string|max:255',
            'category' => 'nullable|in:temporary,disciplinary,medical,documentation',
            'effectiveFrom' => 'required|date',
            'effectiveTo' => 'nullable|date',
            'notes' => 'nullable|string|max:2000',
        ]);

        if (isset($data['effectiveTo']) && (string) $data['effectiveTo'] < (string) $data['effectiveFrom']) {
            throw new HttpException('validation_failed', 'A hold cannot end before it starts.', 422);
        }

        // The hold references the employee, so an unknown id is a bad
        // request rather than a server error.
        $employee = $this->employees->find($id, (new \DateTimeImmutable('now'))->format('Y-m-d'));
        if ($employee === null) {
            throw new HttpException('not_found', 'Employee not found.', 404);
        }

        $eligibility = new PayrollEligibility($this->app->db);
        $holdId = $eligibility->hold(
            $id,
            (string) $data['reason'],
            (string) $data['effectiveFrom'],
            $data['effectiveTo'] ?? null,
            (string) ($data['category'] ?? 'temporary'),
            $data['notes'] ?? null,
            $this->actorId($request),
        );

        $this->app->audit->log(
            $this->actorId($request),
            'employee.held',
            'employee',
            $id,
            'success',
            ['hold' => $holdId, 'reason' => (string) $data['reason']],
            $request->ip(),
        );

        // The employee is told that their pay is on hold, and the people who
        // prepare payroll are told, because a hold keeps someone out of the
        // next run.
        $name = trim((string) $employee['first_name'] . ' ' . (string) $employee['last_name']);
        $notifications = new NotificationService($this->app->db);
        $notifications->notify(
            $this->userIdForEmployee($id),
            NotificationService::TYPE_WARNING,
            'employee',
            'Your pay is on hold',
            'A hold has been placed on your record, so you will not be paid for the period it covers.',
            ['actionLabel' => 'View payslips', 'actionHref' => '/me/payslips'],
        );
        $notifications->notifyPermission(
            'payroll:process',
            NotificationService::TYPE_WARNING,
            'employee',
            'An employee has been placed on hold',
            $name . ' is on hold and will be left out of any run the hold covers.',
            ['actionLabel' => 'Review', 'actionHref' => '/employees/holds'],
        );

        Response::json(['id' => $holdId, 'holds' => $eligibility->holdsFor($id)], 201);
    }

    /** The user account linked to an employee, if there is one. */
    private function userIdForEmployee(string $employeeId): ?int
    {
        $row = $this->app->db->selectOne(
            "SELECT id FROM users WHERE employee_id = ? AND status = 'active' ORDER BY id LIMIT 1",
            [$employeeId],
        );
        return $row === null ? null : (int) $row['id'];
    }

    /** POST /api/holds/{id}/release */
    public function releaseHold(Request $request, array $params): void
    {
        $this->requirePermission($request, 'employees:hold');
        $eligibility = new PayrollEligibility($this->app->db);

        $hold = $this->app->db->selectOne('SELECT * FROM employee_holds WHERE id = ?', [(int) $params['id']]);
        if ($hold === null) {
            throw new HttpException('not_found', 'Hold not found.', 404);
        }

        $released = $eligibility->release((int) $params['id'], $this->actorId($request));
        if (! $released) {
            throw new HttpException('conflict', 'That hold is not active.', 409);
        }

        $this->app->audit->log(
            $this->actorId($request),
            'employee.hold_released',
            'hold',
            (string) $params['id'],
            'success',
            [],
            $request->ip(),
        );

        // The employee is told that they are payable again.
        (new NotificationService($this->app->db))->notify(
            $this->userIdForEmployee((string) $hold['employee_id']),
            NotificationService::TYPE_SUCCESS,
            'employee',
            'Your pay is no longer on hold',
            'The hold on your record has been released, so you are eligible for payroll again.',
            ['actionLabel' => 'View payslips', 'actionHref' => '/me/payslips'],
        );

        Response::json(['ok' => true]);
    }

    /** GET /api/holds */
    public function listHolds(Request $request): void
    {
        $this->requirePermission($request, 'employees:read');
        $rows = $this->app->db->select(
            'SELECT h.*, e.first_name, e.last_name, e.designation, d.name AS department_name
             FROM employee_holds h
             JOIN employees e ON e.id = h.employee_id
             LEFT JOIN departments d ON d.id = e.department_id
             ORDER BY h.status = \'released\', h.id DESC',
        );

        // The shape matches the other two hold endpoints — the raw rows of
        // `GET /api/employees/{id}/holds` and of a run's selection — so the
        // client reads one hold record the same way everywhere.
        Response::json(array_map(static fn (array $row): array => [
            'id' => (int) $row['id'],
            'employee_id' => (string) $row['employee_id'],
            'employee_name' => trim((string) $row['first_name'] . ' ' . (string) $row['last_name']),
            'designation' => (string) ($row['designation'] ?? ''),
            'department_name' => (string) ($row['department_name'] ?? ''),
            'category' => (string) $row['category'],
            'reason' => (string) $row['reason'],
            'notes' => $row['notes'] !== null ? (string) $row['notes'] : null,
            'effective_from' => (string) $row['effective_from'],
            'effective_to' => $row['effective_to'],
            'status' => (string) $row['status'],
            'created_at' => (string) $row['created_at'],
            'released_at' => $row['released_at'],
        ], $rows));
    }

    /** GET /api/employees/{id}/payslips */
    public function payslips(Request $request, array $params): void
    {
        $this->requirePermission($request, 'payroll:read');
        $id = (string) $params['id'];

        // An employee may only read their own payslips, even though the
        // role holds `payroll:read`.
        if ($this->isSelfScoped($request) && $id !== $this->ownEmployeeId($request)) {
            throw new HttpException(
                'forbidden',
                'You do not have permission to read this payslip.',
                403,
            );
        }

        $rows = $this->payroll->payslipsForEmployee($id);
        $data = array_map(
            fn (array $row): array => Mapper::payslip($row, $this->payroll->payslipLines((string) $row['id'])),
            $rows,
        );
        Response::json($data);
    }
}
