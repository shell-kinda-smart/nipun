<?php

declare(strict_types=1);

namespace PayLens\Controllers;

use PayLens\Core\App;
use PayLens\Core\HttpException;
use PayLens\Core\Request;
use PayLens\Core\Response;
use PayLens\Services\SettlementService;

final class SettlementController extends Controller
{
    private SettlementService $settlements;

    public function __construct(App $app)
    {
        parent::__construct($app);
        $this->settlements = new SettlementService($app);
    }

    /** GET /api/settlements */
    public function index(Request $request): void
    {
        $this->requirePermission($request, 'settlement:read');
        Response::json($this->settlements->all());
    }

    /** GET /api/settlements/{id} */
    public function show(Request $request, array $params): void
    {
        $this->requirePermission($request, 'settlement:read');
        Response::json($this->settlements->settlement((string) $params['id']));
    }

    /** POST /api/settlements/calculate */
    public function calculate(Request $request): void
    {
        $this->requirePermission($request, 'settlement:read');
        $data = $this->validated($request, ['terminationRequestId' => 'required|string|max:32']);
        $settlement = $this->guard(fn () => $this->settlements->calculate((string) $data['terminationRequestId'], $this->actorId($request)));
        Response::json($settlement);
    }

    /** POST /api/settlements/{id}/items */
    public function addItem(Request $request, array $params): void
    {
        $this->requirePermission($request, 'settlement:read');
        $data = $this->validated($request, [
            'code' => 'required|string|max:48',
            'label' => 'required|string|max:120',
            'kind' => 'required|in:earning,deduction',
            'amount' => 'required|numeric|min:0',
            'note' => 'nullable|string|max:255',
        ]);
        $settlement = $this->guard(fn () => $this->settlements->addItem((string) $params['id'], $data, $this->actorId($request)));
        Response::json($settlement);
    }

    /** POST /api/settlements/{id}/approve */
    public function approve(Request $request, array $params): void
    {
        $this->requirePermission($request, 'settlement:approve');
        $settlement = $this->guard(fn () => $this->settlements->approve((string) $params['id'], $this->actorId($request)));
        Response::json($settlement);
    }

    /** POST /api/settlements/{id}/finalize */
    public function finalize(Request $request, array $params): void
    {
        $this->requirePermission($request, 'settlement:approve');
        $settlement = $this->guard(fn () => $this->settlements->finalize((string) $params['id'], $this->actorId($request)));
        Response::json($settlement);
    }

    /** @param callable():array<string,mixed> $action */
    private function guard(callable $action): array
    {
        try {
            return $action();
        } catch (\InvalidArgumentException $e) {
            throw new HttpException('validation_failed', $e->getMessage(), 422);
        } catch (\RuntimeException $e) {
            throw new HttpException('conflict', $e->getMessage(), 409);
        }
    }
}
