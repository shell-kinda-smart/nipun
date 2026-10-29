<?php

declare(strict_types=1);

namespace PayLens\Controllers;

use PayLens\Core\App;
use PayLens\Core\Request;
use PayLens\Core\Response;
use PayLens\Repositories\AuditRepository;
use PayLens\Support\Mapper;

final class AuditController extends Controller
{
    private AuditRepository $audit;

    public function __construct(App $app)
    {
        parent::__construct($app);
        $this->audit = new AuditRepository($app->db);
    }

    /** GET /api/audit-logs */
    public function index(Request $request): void
    {
        $this->requirePermission($request, 'audit:read');
        $result = $this->audit->search([
            'actor' => $this->stringParam($request, 'actor'),
            'action' => $this->stringParam($request, 'action'),
            'page' => $this->intParam($request, 'page', 1),
            'perPage' => $this->intParam($request, 'perPage', 50),
        ]);

        Response::json(
            array_map([Mapper::class, 'auditLog'], $result['items']),
            200,
            [
                'total' => $result['total'],
                'page' => $this->intParam($request, 'page', 1),
                'perPage' => $this->intParam($request, 'perPage', 50),
                'actions' => $this->audit->actions(),
                'actors' => $this->audit->actors(),
            ],
        );
    }

    /** GET /api/audit-logs.csv */
    public function csv(Request $request): void
    {
        $this->requirePermission($request, 'audit:export');
        $result = $this->audit->search([
            'actor' => $this->stringParam($request, 'actor'),
            'action' => $this->stringParam($request, 'action'),
            'perPage' => 200,
        ]);

        $rows = [];
        foreach ($result['items'] as $row) {
            $log = Mapper::auditLog($row);
            $rows[] = [
                $log['timestamp'],
                $log['actor'],
                $log['actorRole'],
                $log['action'],
                $log['entity'],
                $log['entityId'] ?? '',
                $log['description'],
                $log['ipAddress'] ?? '',
            ];
        }

        $this->app->audit->log(
            $this->actorId($request),
            'report.generated',
            'audit_log',
            null,
            'success',
            ['report' => 'audit_trail', 'rows' => count($rows)],
            $request->ip(),
        );

        Response::csv(
            'paylens-audit-' . date('Y-m-d') . '.csv',
            ['Timestamp', 'Actor', 'Role', 'Action', 'Entity', 'Entity ID', 'Description', 'IP'],
            $rows,
        );
    }
}
