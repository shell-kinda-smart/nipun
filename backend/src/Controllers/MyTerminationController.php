<?php

declare(strict_types=1);

namespace PayLens\Controllers;

use PayLens\Core\App;
use PayLens\Core\HttpException;
use PayLens\Core\Request;
use PayLens\Core\Response;
use PayLens\Services\TerminationService;

/**
 * The employee's own termination notice.
 *
 * Only the employee the notice is addressed to may read it, and only their
 * current version. The acknowledgement records receipt — nothing more.
 */
final class MyTerminationController extends Controller
{
    private TerminationService $terminations;

    public function __construct(App $app)
    {
        parent::__construct($app);
        $this->terminations = new TerminationService($app);
    }

    /**
     * GET /api/me/termination
     *
     * The employee's notice, if there is one, plus the settlement statement.
     */
    public function show(Request $request): void
    {
        $user = $this->requireUser($request);
        $employeeId = (string) ($user['employee_id'] ?? '');
        if ($employeeId === '') {
            Response::json(['data' => null]);
            return;
        }

        $notice = $this->terminations->latestNoticeFor($employeeId);
        if ($notice === null) {
            Response::json(null);
            return;
        }

        $request_ = $this->terminations->request((string) $notice['terminationRequestId']);
        $settlement = (new \PayLens\Services\SettlementService($this->app))->forTermination((string) $notice['terminationRequestId']);

        $acknowledged = $this->app->db->selectOne(
            'SELECT acknowledged_at FROM termination_acknowledgements
             WHERE termination_letter_id = ? AND employee_id = ?',
            [$notice['id'], $employeeId],
        );

        Response::json([
            'notice' => $notice,
            'request' => $request_,
            'settlement' => $settlement,
            'acknowledgedAt' => $acknowledged !== null ? (string) $acknowledged['acknowledged_at'] : null,
            'acknowledgementWording' => 'I acknowledge that I have received and viewed this notice.',
        ]);
    }

    /** POST /api/me/termination/acknowledge */
    public function acknowledge(Request $request): void
    {
        $user = $this->requireUser($request);
        $data = $this->validated($request, ['letterId' => 'required|integer|min:1']);

        try {
            $result = $this->terminations->acknowledge(
                (int) $data['letterId'],
                (int) $user['id'],
                $request->ip(),
            );
        } catch (\RuntimeException $e) {
            throw new HttpException('conflict', $e->getMessage(), 409);
        }

        Response::json($result);
    }
}
