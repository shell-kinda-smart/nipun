<?php

declare(strict_types=1);

namespace PayLens\Controllers;

use PayLens\Core\App;
use PayLens\Core\Request;
use PayLens\Core\Response;
use PayLens\Repositories\DepartmentRepository;
use PayLens\Repositories\DocumentRepository;
use PayLens\Repositories\EmployeeRepository;
use PayLens\Support\Mapper;

final class DocumentController extends Controller
{
    private DocumentRepository $documents;
    private EmployeeRepository $employees;
    private DepartmentRepository $departments;

    public function __construct(App $app)
    {
        parent::__construct($app);
        $this->documents = new DocumentRepository($app->db);
        $this->employees = new EmployeeRepository($app->db);
        $this->departments = new DepartmentRepository($app->db);
    }

    /** GET /api/documents */
    public function index(Request $request): void
    {
        $this->requirePermission($request, 'employees:read');
        $rows = $this->documents->search([
            'employeeId' => $this->stringParam($request, 'employeeId'),
            'type' => $this->stringParam($request, 'type'),
            'status' => $this->stringParam($request, 'status'),
        ]);

        $asOf = (new \DateTimeImmutable('now'))->format('Y-m-d');
        $data = [];
        foreach ($rows as $row) {
            $document = Mapper::document($row);
            $employee = $this->employees->find($document['employeeId'], $asOf);
            if ($employee !== null) {
                $mapped = Mapper::employee($employee);
                $document['employee'] = [
                    'id' => $mapped['id'],
                    'name' => $mapped['name'],
                    'avatarSeed' => $mapped['avatarSeed'],
                ];
                $department = $this->departments->find($mapped['departmentId']);
                $document['departmentName'] = (string) ($department['name'] ?? '');
            }
            $data[] = $document;
        }

        Response::json($data);
    }

    /** GET /api/documents/{id} */
    public function show(Request $request, array $params): void
    {
        $this->requirePermission($request, 'employees:read');
        $row = $this->documents->find((string) $params['id']);
        if ($row === null) {
            Response::error('not_found', 'Document not found.', 404);
            return;
        }
        Response::json(Mapper::document($row));
    }
}
