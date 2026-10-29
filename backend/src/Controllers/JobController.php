<?php

declare(strict_types=1);

namespace PayLens\Controllers;

use PayLens\Core\App;
use PayLens\Core\HttpException;
use PayLens\Core\Request;
use PayLens\Core\Response;
use PayLens\Services\JobService;

final class JobController extends Controller
{
    private JobService $jobs;

    public function __construct(App $app)
    {
        parent::__construct($app);
        $this->jobs = new JobService($app);
    }

    /** GET /api/jobs */
    public function index(Request $request): void
    {
        $this->requirePermission($request, 'jobs:read');
        $status = $this->stringParam($request, 'status');
        Response::json($this->jobs->runs($this->intParam($request, 'limit', 50), $status === '' ? null : $status));
    }

    /** GET /api/jobs/failed */
    public function failed(Request $request): void
    {
        $this->requirePermission($request, 'jobs:read');
        Response::json($this->jobs->runs($this->intParam($request, 'limit', 50), 'failed'));
    }

    /** POST /api/jobs/{id}/retry */
    public function retry(Request $request, array $params): void
    {
        $this->requirePermission($request, 'jobs:retry');
        try {
            $result = $this->jobs->retry((int) $params['id'], $this->actorId($request));
        } catch (\RuntimeException $e) {
            throw new HttpException('conflict', $e->getMessage(), 409);
        }
        Response::json($result);
    }
}
