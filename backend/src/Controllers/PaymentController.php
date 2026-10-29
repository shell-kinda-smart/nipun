<?php

declare(strict_types=1);

namespace PayLens\Controllers;

use PayLens\Core\App;
use PayLens\Core\HttpException;
use PayLens\Core\Request;
use PayLens\Core\Response;
use PayLens\Services\PaymentService;

/**
 * Employee payment tracking.
 *
 * Recording a payment is a statement about what happened — it never moves
 * money. A manual entry is always marked as manual.
 */
final class PaymentController extends Controller
{
    private PaymentService $payments;

    public function __construct(App $app)
    {
        parent::__construct($app);
        $this->payments = new PaymentService($app, new \PayLens\Repositories\PayrollRepository($app->db));
    }

    /** GET /api/payroll/payments */
    public function index(Request $request): void
    {
        $this->requirePermission($request, 'payroll:read');
        Response::json($this->payments->allRecords($this->stringParam($request, 'status')));
    }

    /** GET /api/payroll/runs/{id}/payments */
    public function forRun(Request $request, array $params): void
    {
        $this->requirePermission($request, 'payroll:read');
        $runId = (string) $params['id'];
        Response::json([
            'records' => $this->payments->records($runId),
            'summary' => $this->payments->summary($runId),
        ]);
    }

    /** POST /api/payroll/runs/{id}/payments */
    public function record(Request $request, array $params): void
    {
        $this->requirePermission($request, 'payroll:pay');
        $data = $this->validated($request, [
            'employeeId' => 'required|string|max:32',
            'status' => 'required|in:pending,paid,failed',
            'reference' => 'nullable|string|max:120',
            'failureReason' => 'nullable|string|max:255',
            'amount' => 'nullable|numeric|min:0',
        ]);

        try {
            $result = $this->payments->record(
                (string) $params['id'],
                (string) $data['employeeId'],
                (string) $data['status'],
                $data['reference'] ?? null,
                $data['failureReason'] ?? null,
                isset($data['amount']) ? \PayLens\Core\Money::toMinor((float) $data['amount']) : null,
                $this->actorId($request),
            );
        } catch (\InvalidArgumentException $e) {
            throw new HttpException('validation_failed', $e->getMessage(), 422);
        } catch (\RuntimeException $e) {
            throw new HttpException('conflict', $e->getMessage(), 409);
        }

        $this->app->audit->log(
            $this->actorId($request),
            'payment.recorded',
            'payment',
            (string) $params['id'] . '/' . (string) $data['employeeId'],
            'success',
            ['status' => (string) $data['status'], 'amountPaise' => $result['amountPaise']],
            $request->ip(),
        );

        $this->notifyPaymentChange((string) $params['id'], (string) $data['employeeId'], (string) $data['status'], $data['failureReason'] ?? null);

        Response::json($result);
    }

    /** GET /api/payroll/payments/{id}/history */
    public function history(Request $request, array $params): void
    {
        $this->requirePermission($request, 'payroll:read');
        Response::json($this->payments->history((int) $params['id']));
    }

    private function notifyPaymentChange(string $runId, string $employeeId, string $status, ?string $failureReason): void
    {
        $employee = $this->app->db->selectOne(
            'SELECT first_name, last_name FROM employees WHERE id = ?',
            [$employeeId],
        );
        if ($employee === null) {
            return;
        }
        $name = trim((string) $employee['first_name'] . ' ' . (string) $employee['last_name']);

        $notifications = new \PayLens\Services\NotificationService($this->app->db);
        $notifications->notifyPermission(
            'payroll:pay',
            $status === 'failed' ? \PayLens\Services\NotificationService::TYPE_WARNING : \PayLens\Services\NotificationService::TYPE_INFO,
            'payment',
            'Payment status updated',
            'A payment for ' . $name . ' is now ' . $status . '.',
            ['actionLabel' => 'View payments', 'actionHref' => '/payroll/payments'],
        );

        $mailer = new \PayLens\Services\Mailer($this->app->db, $this->app->config);
        $recipients = $this->app->db->select(
            "SELECT DISTINCT u.id, u.email FROM users u
             JOIN role_permissions rp ON rp.role_name = u.role
             WHERE rp.permission_name = 'payroll:pay' AND u.status = 'active'",
        );
        foreach ($recipients as $recipient) {
            $mailer->send('payment_status', (string) $recipient['email'], (int) $recipient['id'], [
                'employeeName' => $name,
                'period' => $runId,
                'status' => $status,
                'reason' => $failureReason,
            ]);
        }
    }
}
