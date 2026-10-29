<?php

declare(strict_types=1);

namespace PayLens\Controllers;

use PayLens\Core\App;
use PayLens\Core\Request;
use PayLens\Core\Response;
use PayLens\Repositories\DepartmentRepository;
use PayLens\Support\Mapper;

final class DepartmentController extends Controller
{
    private DepartmentRepository $departments;

    public function __construct(App $app)
    {
        parent::__construct($app);
        $this->departments = new DepartmentRepository($app->db);
    }

    /** GET /api/departments */
    public function index(Request $request): void
    {
        $this->requirePermission($request, 'employees:read');
        $rows = $this->departments->all($this->asOf($request));
        Response::json(array_map([Mapper::class, 'department'], $rows));
    }

    /** The date that decides which compensation version is in force. */
    protected function asOf(Request $request): string
    {
        $asOf = $this->stringParam($request, 'asOf');
        if ($asOf !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $asOf)) {
            return $asOf;
        }
        return (new \DateTimeImmutable('now'))->format('Y-m-d');
    }
}
