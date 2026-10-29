<?php

declare(strict_types=1);

namespace PayLens\Controllers;

use PayLens\Core\App;
use PayLens\Core\HttpException;
use PayLens\Core\Request;
use PayLens\Core\Response;
use PayLens\Services\TerminationService;

/**
 * HR-side termination workflow.
 *
 * Creating a request does not terminate anybody. The request has to be
 * submitted, approved, and the notice issued before the offboarding starts.
 */
final class TerminationController extends Controller
{
    private TerminationService $terminations;

    public function __construct(App $app)
    {
        parent::__construct($app);
        $this->terminations = new TerminationService($app);
    }

    /** GET /api/terminations */
    public function index(Request $request): void
    {
        $this->requirePermission($request, 'termination:read');
        $requests = $this->terminations->list([
            'status' => $this->stringParam($request, 'status'),
            'employeeId' => $this->stringParam($request, 'employeeId'),
        ]);

        $data = array_map(function (array $item): array {
            $item['letters'] = $this->terminations->lettersFor((string) $item['id']);
            $item['settlement'] = $this->settlementFor((string) $item['id']);
            return $item;
        }, $requests);

        Response::json($data);
    }

    /** GET /api/terminations/{id} */
    public function show(Request $request, array $params): void
    {
        $this->requirePermission($request, 'termination:read');
        $item = $this->terminations->request((string) $params['id']);
        $item['letters'] = $this->terminations->lettersFor((string) $params['id']);
        $item['settlement'] = $this->settlementFor((string) $params['id']);
        Response::json($item);
    }

    /** POST /api/terminations */
    public function store(Request $request): void
    {
        $this->requirePermission($request, 'termination:write');
        $data = $this->validated($request, [
            'employeeId' => 'required|string|max:32',
            'category' => 'required|in:resignation,termination,retirement,end_of_contract',
            'reason' => 'required|string|max:2000',
            'hrNotes' => 'nullable|string|max:2000',
            'lastWorkingDay' => 'required|date',
            'noticePeriodDays' => 'required|integer|min:0|max:365',
            'noticeServedFrom' => 'nullable|date',
        ]);

        if ((string) $data['lastWorkingDay'] > date('Y-m-d', strtotime('+1 year'))) {
            throw new HttpException('validation_failed', 'The last working day is more than a year away.', 422);
        }

        try {
            $request2 = $this->terminations->create(
                (string) $data['employeeId'],
                $data,
                $this->actorId($request),
            );
        } catch (\RuntimeException $e) {
            throw new HttpException('validation_failed', $e->getMessage(), 422);
        }

        Response::json($request2, 201);
    }

    /** POST /api/terminations/{id}/submit */
    public function submit(Request $request, array $params): void
    {
        $this->requirePermission($request, 'termination:write');
        $item = $this->guard(fn () => $this->terminations->submit((string) $params['id'], $this->actorId($request)));
        Response::json($item);
    }

    /** POST /api/terminations/{id}/approve */
    public function approve(Request $request, array $params): void
    {
        $this->requirePermission($request, 'termination:approve');
        $item = $this->guard(fn () => $this->terminations->approve((string) $params['id'], $this->actorId($request)));
        Response::json($item);
    }

    /** POST /api/terminations/{id}/reject */
    public function reject(Request $request, array $params): void
    {
        $this->requirePermission($request, 'termination:approve');
        $data = $this->validated($request, ['reason' => 'required|string|max:500']);
        $item = $this->guard(fn () => $this->terminations->reject((string) $params['id'], (string) $data['reason'], $this->actorId($request)));
        Response::json($item);
    }

    /** POST /api/terminations/{id}/issue-notice */
    public function issueNotice(Request $request, array $params): void
    {
        $this->requirePermission($request, 'termination:approve');
        $item = $this->guard(fn () => $this->terminations->issueNotice((string) $params['id'], $this->actorId($request)));
        Response::json($item);
    }

    /** @return array<string,mixed>|null */
    private function settlementFor(string $terminationRequestId): ?array
    {
        $settlements = new \PayLens\Services\SettlementService($this->app);
        return $settlements->forTermination($terminationRequestId);
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
