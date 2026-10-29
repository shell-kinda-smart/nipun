<?php

declare(strict_types=1);

namespace PayLens\Controllers;

use PayLens\Core\App;
use PayLens\Core\Request;
use PayLens\Core\Response;
use PayLens\Repositories\AnomalyRepository;
use PayLens\Support\Mapper;

final class AnomalyController extends Controller
{
    private AnomalyRepository $anomalies;

    public function __construct(App $app)
    {
        parent::__construct($app);
        $this->anomalies = new AnomalyRepository($app->db);
    }

    /** GET /api/anomalies */
    public function index(Request $request): void
    {
        $this->requirePermission($request, 'anomalies:read');
        $rows = $this->anomalies->search([
            'severity' => $this->stringParam($request, 'severity'),
            'status' => $this->stringParam($request, 'status'),
            'employeeId' => $this->stringParam($request, 'employeeId'),
        ]);
        Response::json(
            array_map([Mapper::class, 'anomaly'], $rows),
            200,
            ['counts' => $this->anomalies->counts()],
        );
    }

    /** GET /api/anomalies/{id} */
    public function show(Request $request, array $params): void
    {
        $this->requirePermission($request, 'anomalies:read');
        $row = $this->anomalies->find((string) $params['id']);
        if ($row === null) {
            Response::error('not_found', 'Anomaly not found.', 404);
            return;
        }
        Response::json(Mapper::anomaly($row));
    }

    /** PATCH /api/anomalies/{id} */
    public function update(Request $request, array $params): void
    {
        $this->requirePermission($request, 'anomalies:resolve');
        $id = (string) $params['id'];

        $data = $this->validated($request, [
            'status' => 'required|in:open,investigating,resolved,dismissed',
            'assignedTo' => 'nullable|string|max:120',
        ]);

        $existing = $this->anomalies->find($id);
        if ($existing === null) {
            Response::error('not_found', 'Anomaly not found.', 404);
            return;
        }

        $this->anomalies->updateStatus($id, (string) $data['status'], $data['assignedTo'] ?? null);

        $this->app->audit->log(
            $this->actorId($request),
            'anomaly.resolved',
            'anomaly',
            $id,
            'success',
            ['status' => (string) $data['status']],
            $request->ip(),
        );

        $row = $this->anomalies->find($id);
        Response::json($row !== null ? Mapper::anomaly($row) : null);
    }
}
