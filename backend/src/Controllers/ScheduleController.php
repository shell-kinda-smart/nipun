<?php

declare(strict_types=1);

namespace PayLens\Controllers;

use PayLens\Core\App;
use PayLens\Core\HttpException;
use PayLens\Core\Request;
use PayLens\Core\Response;
use PayLens\Services\JobService;

final class ScheduleController extends Controller
{
    private JobService $jobs;

    public function __construct(App $app)
    {
        parent::__construct($app);
        $this->jobs = new JobService($app);
    }

    /** GET /api/schedules */
    public function index(Request $request): void
    {
        $this->requirePermission($request, 'schedules:read');
        Response::json($this->jobs->listJobs($this->stringParam($request, 'kind')));
    }

    /** POST /api/schedules */
    public function store(Request $request): void
    {
        $this->requirePermission($request, 'schedules:write');
        $data = $this->validated($request, [
            'kind' => 'required|in:payroll_preparation,recurring_report',
            'name' => 'required|string|max:120',
            'reportType' => 'nullable|string|max:64',
            'frequency' => 'nullable|in:once,daily,weekly,monthly',
            'scheduledAt' => 'required|date',
            'periodMonth' => 'nullable|integer|min:1|max:12',
            'periodYear' => 'nullable|integer|min:2000|max:2100',
            'criteria' => 'nullable|array',
            'recipients' => 'nullable|array',
            'delivery' => 'nullable|in:email,none',
        ]);

        if ((string) $data['kind'] === 'recurring_report') {
            if (($data['reportType'] ?? '') === '') {
                throw new HttpException('validation_failed', 'A recurring report needs a report type.', 422);
            }
            $recipients = $data['recipients'] ?? [];
            if (! is_array($recipients) || $recipients === []) {
                throw new HttpException('validation_failed', 'A recurring report needs at least one recipient.', 422);
            }
            foreach ($recipients as $recipient) {
                $email = is_array($recipient) ? (string) ($recipient['email'] ?? '') : '';
                if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
                    throw new HttpException('validation_failed', 'A recipient address is not valid.', 422);
                }
            }
        }

        $job = $this->jobs->createJob($data, $this->actorId($request));
        Response::json($job, 201);
    }

    /** PATCH /api/schedules/{id} */
    public function update(Request $request, array $params): void
    {
        $this->requirePermission($request, 'schedules:write');
        $data = $this->validated($request, ['status' => 'required|in:active,paused,cancelled']);
        $job = $this->jobs->updateJobStatus((int) $params['id'], (string) $data['status'], $this->actorId($request));
        Response::json($job);
    }

    /** POST /api/schedules/run-due — run whatever is due right now. */
    public function runDue(Request $request): void
    {
        $this->requirePermission($request, 'schedules:write');
        $results = $this->jobs->runDue(20);
        Response::json(['data' => $results]);
    }

    /** GET /api/schedules/mail-status — whether email can actually be sent. */
    public function mailStatus(Request $request): void
    {
        $this->requirePermission($request, 'schedules:read');
        $mailer = new \PayLens\Services\Mailer($this->app->db, $this->app->config);
        Response::json([
            'configured' => $mailer->isConfigured(),
            'message' => $mailer->isConfigured()
                ? 'Email delivery is configured.'
                : 'Email delivery is not configured. Set SMTP_HOST (and credentials) to enable it; ' .
                  'until then every delivery is recorded as failed rather than sent.',
        ]);
    }
}
