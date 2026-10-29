<?php

declare(strict_types=1);

namespace PayLens\Services;

use PayLens\Core\App;
use PayLens\Core\Money;

/**
 * Employee termination and the official notice.
 *
 * WORKFLOW
 *
 *   draft → submitted → approved → notice_issued → acknowledged
 *         → settled → completed
 *         (submitted → rejected → draft)
 *
 * Two rules the workflow never bends:
 *   1. Submitting a request never terminates an employee. Only an approved
 *      request, followed by the notice being issued, starts the offboarding.
 *   2. An acknowledgement records that the employee *received* the notice.
 *      It never records agreement, and it is never recorded on the
 *      employee's behalf.
 *
 * The notice is generated from the record itself — name, identifier,
 * department, designation, dates — and asserts nothing that is not in the
 * record. No signature is fabricated and no statutory claim is invented.
 */
final class TerminationService
{
    public const STATUS_DRAFT = 'draft';
    public const STATUS_SUBMITTED = 'submitted';
    public const STATUS_APPROVED = 'approved';
    public const STATUS_REJECTED = 'rejected';
    public const STATUS_NOTICE_ISSUED = 'notice_issued';
    public const STATUS_ACKNOWLEDGED = 'acknowledged';
    public const STATUS_SETTLED = 'settled';
    public const STATUS_COMPLETED = 'completed';

    private NotificationService $notifications;
    private Mailer $mailer;

    public function __construct(private App $app)
    {
        $this->notifications = new NotificationService($app->db);
        $this->mailer = new Mailer($app->db, $app->config);
    }

    // ── The request ─────────────────────────────────────────────────────────

    /**
     * @param array<string,mixed> $data
     * @return array<string,mixed>
     */
    public function create(string $employeeId, array $data, ?int $userId): array
    {
        $employee = $this->employee($employeeId);
        $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');
        $id = $this->nextId();

        $this->app->db->execute(
            'INSERT INTO termination_requests
                (id, employee_id, category, reason, hr_notes, last_working_day, notice_period_days,
                 notice_served_from, status, requested_by, requested_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $id,
                $employeeId,
                (string) $data['category'],
                (string) $data['reason'],
                $data['hrNotes'] ?? null,
                (string) $data['lastWorkingDay'],
                (int) $data['noticePeriodDays'],
                $data['noticeServedFrom'] ?? null,
                self::STATUS_DRAFT,
                $userId,
                $now,
                $now,
                $now,
            ],
        );

        $this->app->audit->log(
            $userId,
            'termination.requested',
            'termination_request',
            $id,
            'success',
            ['employee' => $employeeId, 'category' => (string) $data['category']],
        );

        return $this->request($id);
    }

    /** @return array<string,mixed> */
    public function submit(string $id, ?int $userId): array
    {
        $request = $this->requireRequest($id);
        if ((string) $request['status'] !== self::STATUS_DRAFT
            && (string) $request['status'] !== self::STATUS_REJECTED) {
            throw new \RuntimeException('Only a draft request can be submitted.');
        }

        $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');
        $claimed = $this->app->db->execute(
            'UPDATE termination_requests SET status = ?, requested_at = ?, requested_by = ?, updated_at = ?
             WHERE id = ? AND status IN (?, ?)',
            [self::STATUS_SUBMITTED, $now, $userId, $now, $id, self::STATUS_DRAFT, self::STATUS_REJECTED],
        );
        if ($claimed === 0) {
            throw new \RuntimeException('The request was submitted by someone else.');
        }

        $this->app->audit->log($userId, 'termination.submitted', 'termination_request', $id);

        $this->notifications->notifyPermission(
            'termination:approve',
            NotificationService::TYPE_INFO,
            'termination',
            'A termination request needs a decision',
            'A termination request is waiting for approval.',
            ['actionLabel' => 'Review', 'actionHref' => '/terminations'],
        );

        return $this->request($id);
    }

    /** @return array<string,mixed> */
    public function approve(string $id, ?int $userId): array
    {
        $request = $this->requireRequest($id);
        if ((string) $request['status'] !== self::STATUS_SUBMITTED) {
            throw new \RuntimeException('Only a submitted request can be approved.');
        }

        $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');
        $claimed = $this->app->db->execute(
            'UPDATE termination_requests SET status = ?, approver_id = ?, approved_at = ?, updated_at = ?
             WHERE id = ? AND status = ?',
            [self::STATUS_APPROVED, $userId, $now, $now, $id, self::STATUS_SUBMITTED],
        );
        if ($claimed === 0) {
            throw new \RuntimeException('The request was decided by someone else.');
        }

        $this->app->audit->log($userId, 'termination.approved', 'termination_request', $id);

        $this->notifications->notifyPermission(
            'termination:write',
            NotificationService::TYPE_SUCCESS,
            'termination',
            'Termination request approved',
            'A termination request has been approved. The official notice can now be issued.',
            ['actionLabel' => 'Open', 'actionHref' => '/terminations'],
        );

        return $this->request($id);
    }

    /** @return array<string,mixed> */
    public function reject(string $id, string $reason, ?int $userId): array
    {
        $request = $this->requireRequest($id);
        if ((string) $request['status'] !== self::STATUS_SUBMITTED) {
            throw new \RuntimeException('Only a submitted request can be sent back.');
        }
        if (trim($reason) === '') {
            throw new \InvalidArgumentException('A reason is required to send a request back.');
        }

        $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');
        $claimed = $this->app->db->execute(
            'UPDATE termination_requests SET status = ?, rejected_at = ?, rejection_reason = ?, updated_at = ?
             WHERE id = ? AND status = ?',
            [self::STATUS_REJECTED, $now, mb_substr($reason, 0, 500), $now, $id, self::STATUS_SUBMITTED],
        );
        if ($claimed === 0) {
            throw new \RuntimeException('The request was decided by someone else.');
        }

        $this->app->audit->log($userId, 'termination.rejected', 'termination_request', $id, 'success', ['reason' => $reason]);

        return $this->request($id);
    }

    // ── The notice ──────────────────────────────────────────────────────────

    /**
     * Issue the official notice.
     *
     * A new version is written on every issue; the previous version is kept
     * and marked superseded, so the history of what was sent survives.
     *
     * @return array<string,mixed>
     */
    public function issueNotice(string $id, ?int $userId): array
    {
        $request = $this->requireRequest($id);
        if ((string) $request['status'] !== self::STATUS_APPROVED) {
            throw new \RuntimeException('Only an approved request can have a notice issued.');
        }

        $employee = $this->employee((string) $request['employee_id']);
        $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');

        $version = 1 + (int) ($this->app->db->selectOne(
            'SELECT MAX(version) AS v FROM termination_letters WHERE termination_request_id = ?',
            [$id],
        )['v'] ?? 0);

        $reference = sprintf(
            'TL-%s-%s',
            date('Y', strtotime((string) $request['last_working_day'])),
            str_pad(substr($id, 3), 4, '0', STR_PAD_LEFT),
        );

        $html = $this->renderLetter($request, $employee, $reference);

        $this->app->db->transaction(function () use ($id, $version, $reference, $html, $userId, $now, $request): void {
            $this->app->db->execute(
                'UPDATE termination_letters SET superseded_at = ? WHERE termination_request_id = ? AND superseded_at IS NULL',
                [$now, $id],
            );
            $this->app->db->execute(
                'INSERT INTO termination_letters
                    (termination_request_id, version, reference, content_html, issued_by, issued_at, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)',
                [$id, $version, $reference, $html, $userId, $now, $now],
            );
            $this->app->db->execute(
                'UPDATE termination_requests SET status = ?, notice_issued_at = ?, updated_at = ? WHERE id = ?',
                [self::STATUS_NOTICE_ISSUED, $now, $now, $id],
            );
        });

        $this->app->audit->log(
            $userId,
            'termination.notice_issued',
            'termination_request',
            $id,
            'success',
            ['version' => $version, 'reference' => $reference],
        );

        // The employee is told that a document is available. The notice is
        // persistent: it stays visible on every later sign-in until it is
        // acknowledged.
        $this->notifyEmployee($request, $employee, $reference);

        return $this->request($id);
    }

    /**
     * Acknowledge receipt of the notice.
     *
     * @return array<string,mixed>
     */
    public function acknowledge(int $letterId, ?int $userId, string $ip): array
    {
        $letter = $this->app->db->selectOne('SELECT * FROM termination_letters WHERE id = ?', [$letterId]);
        if ($letter === null) {
            throw new \RuntimeException('Document not found.');
        }
        if ($letter['superseded_at'] !== null) {
            throw new \RuntimeException('This document version has been replaced. Open the current notice.');
        }

        $request = $this->requireRequest((string) $letter['termination_request_id']);

        // Only the employee the notice is addressed to may acknowledge it.
        if ($userId === null) {
            throw new \RuntimeException('Sign in to acknowledge this document.');
        }
        $user = $this->app->db->selectOne('SELECT employee_id FROM users WHERE id = ?', [$userId]);
        if ($user === null || (string) $user['employee_id'] !== (string) $request['employee_id']) {
            throw new \RuntimeException('This document does not belong to your account.');
        }
        if ((string) $request['status'] !== self::STATUS_NOTICE_ISSUED) {
            throw new \RuntimeException('This notice is not awaiting acknowledgement.');
        }

        $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');

        $this->app->db->transaction(function () use ($letter, $request, $userId, $ip, $now): void {
            $this->app->db->execute(
                'INSERT INTO termination_acknowledgements
                    (termination_letter_id, termination_request_id, employee_id, acknowledged_at, ip_address)
                 VALUES (?, ?, ?, ?, ?)',
                [
                    (int) $letter['id'],
                    (string) $request['id'],
                    (string) $request['employee_id'],
                    $now,
                    mb_substr($ip, 0, 45),
                ],
            );
            $this->app->db->execute(
                'UPDATE termination_requests SET status = ?, acknowledged_at = ?, updated_at = ? WHERE id = ?',
                [self::STATUS_ACKNOWLEDGED, $now, $now, (string) $request['id']],
            );
        });

        $this->app->audit->log(
            $userId,
            'termination.acknowledged',
            'termination_request',
            (string) $request['id'],
            'success',
            ['letter' => (int) $letter['id'], 'version' => (int) $letter['version']],
        );

        $this->notifications->notifyPermission(
            'termination:read',
            NotificationService::TYPE_SUCCESS,
            'termination',
            'Termination notice acknowledged',
            'An employee has acknowledged receipt of their official notice.',
            ['actionLabel' => 'Open', 'actionHref' => '/terminations'],
        );

        return $this->request((string) $request['id']);
    }

    // ── Reads ───────────────────────────────────────────────────────────────

    /**
     * @param array{status?:?string,employeeId?:?string} $filters
     * @return array<int,array<string,mixed>>
     */
    public function list(array $filters = []): array
    {
        $where = [];
        $params = [];
        if (!empty($filters['status'])) {
            $where[] = 'tr.status = ?';
            $params[] = (string) $filters['status'];
        }
        if (!empty($filters['employeeId'])) {
            $where[] = 'tr.employee_id = ?';
            $params[] = (string) $filters['employeeId'];
        }
        $sql = 'SELECT tr.*, e.first_name, e.last_name, e.designation, d.name AS department_name
                FROM termination_requests tr
                JOIN employees e ON e.id = tr.employee_id
                LEFT JOIN departments d ON d.id = e.department_id';
        if ($where !== []) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY tr.id DESC';

        return array_map([$this, 'mapRequest'], $this->app->db->select($sql, $params));
    }

    /** @return array<string,mixed> */
    public function request(string $id): array
    {
        $row = $this->app->db->selectOne(
            'SELECT tr.*, e.first_name, e.last_name, e.designation, e.email, d.name AS department_name
             FROM termination_requests tr
             JOIN employees e ON e.id = tr.employee_id
             LEFT JOIN departments d ON d.id = e.department_id
             WHERE tr.id = ?',
            [$id],
        );
        if ($row === null) {
            throw new \RuntimeException('Termination request not found.');
        }
        return $this->mapRequest($row);
    }

    /**
     * The current notice for an employee, if there is one.
     *
     * @return array<string,mixed>|null
     */
    public function latestNoticeFor(string $employeeId): ?array
    {
        $row = $this->app->db->selectOne(
            'SELECT l.* FROM termination_letters l
             JOIN termination_requests tr ON tr.id = l.termination_request_id
             WHERE tr.employee_id = ? AND l.superseded_at IS NULL
             ORDER BY l.version DESC LIMIT 1',
            [$employeeId],
        );
        return $row === null ? null : $this->mapLetter($row);
    }

    /** @return array<string,mixed> */
    public function letter(int $letterId): array
    {
        $row = $this->app->db->selectOne('SELECT * FROM termination_letters WHERE id = ?', [$letterId]);
        if ($row === null) {
            throw new \RuntimeException('Document not found.');
        }
        return $this->mapLetter($row);
    }

    /** @return array<int,array<string,mixed>> */
    public function lettersFor(string $requestId): array
    {
        return array_map(
            [$this, 'mapLetter'],
            $this->app->db->select(
                'SELECT * FROM termination_letters WHERE termination_request_id = ? ORDER BY version DESC',
                [$requestId],
            ),
        );
    }

    // ── Internals ───────────────────────────────────────────────────────────

    /** @return array<string,mixed> */
    private function requireRequest(string $id): array
    {
        $row = $this->app->db->selectOne('SELECT * FROM termination_requests WHERE id = ?', [$id]);
        if ($row === null) {
            throw new \RuntimeException('Termination request not found.');
        }
        return $row;
    }

    /** @return array<string,mixed> */
    private function employee(string $employeeId): array
    {
        $row = $this->app->db->selectOne(
            'SELECT e.*, d.name AS department_name FROM employees e
             LEFT JOIN departments d ON d.id = e.department_id
             WHERE e.id = ?',
            [$employeeId],
        );
        if ($row === null) {
            throw new \RuntimeException('Employee not found.');
        }
        return $row;
    }

    /**
     * Render the notice.
     *
     * @param array<string,mixed> $request
     * @param array<string,mixed> $employee
     */
    private function renderLetter(array $request, array $employee, string $reference): string
    {
        $template = dirname(__DIR__, 2) . '/database/templates/termination-letter.php';

        $variables = [
            'organisation' => $this->app->config->string('app.organisation', 'PayLens Technologies Pvt. Ltd.'),
            'hrContact' => $this->app->config->string('app.hr_contact', 'people@paylens.co'),
            'reference' => $reference,
            'issueDate' => date('j F Y'),
            'employeeName' => trim((string) $employee['first_name'] . ' ' . (string) $employee['last_name']),
            'employeeId' => (string) $employee['id'],
            'designation' => (string) $employee['designation'],
            'department' => (string) ($employee['department_name'] ?? ''),
            'category' => ucfirst(str_replace('_', ' ', (string) $request['category'])),
            'lastWorkingDay' => date('j F Y', strtotime((string) $request['last_working_day'])),
            'noticePeriodDays' => (int) $request['notice_period_days'],
            'noticeServedFrom' => $request['notice_served_from'] !== null
                ? date('j F Y', strtotime((string) $request['notice_served_from']))
                : null,
            'reason' => (string) $request['reason'],
        ];

        if (! is_file($template)) {
            throw new \RuntimeException('The termination letter template is missing.');
        }

        $html = (static function (string $__file, array $__vars): string {
            extract($__vars, EXTR_SKIP);
            ob_start();
            include $__file;
            return (string) ob_get_clean();
        })($template, $variables);

        return $html;
    }

    /**
     * @param array<string,mixed> $request
     * @param array<string,mixed> $employee
     */
    private function notifyEmployee(array $request, array $employee, string $reference): void
    {
        $user = $this->app->db->selectOne(
            'SELECT id, email FROM users WHERE employee_id = ? AND status = ?',
            [(string) $request['employee_id'], 'active'],
        );

        if ($user !== null) {
            $this->notifications->notify(
                (int) $user['id'],
                NotificationService::TYPE_WARNING,
                'termination',
                'An official employment document is available',
                'An official document relating to your employment has been issued and is available to read, download and print.',
                ['actionLabel' => 'Open document', 'actionHref' => '/me/termination', 'severity' => 'high'],
            );
            $this->mailer->send('termination_notice', (string) $user['email'], (int) $user['id'], [
                'organisation' => $this->app->config->string('app.organisation', 'PayLens Technologies Pvt. Ltd.'),
                'contact' => $this->app->config->string('app.hr_contact', 'people@paylens.co'),
            ]);
        }
    }

    private function nextId(): string
    {
        $row = $this->app->db->selectOne('SELECT COUNT(*) AS c FROM termination_requests');
        return 'TR-' . str_pad((string) ((int) ($row['c'] ?? 0) + 1), 4, '0', STR_PAD_LEFT);
    }

    /** @param array<string,mixed> $row */
    private function mapRequest(array $row): array
    {
        $id = (string) $row['id'];
        $settlement = (new SettlementService($this->app))->forTermination($id);

        return [
            'id' => $id,
            'employeeId' => (string) $row['employee_id'],
            'employeeName' => trim((string) ($row['first_name'] ?? '') . ' ' . (string) ($row['last_name'] ?? '')),
            'designation' => (string) ($row['designation'] ?? ''),
            'departmentName' => (string) ($row['department_name'] ?? ''),
            'category' => (string) $row['category'],
            'reason' => (string) $row['reason'],
            'hrNotes' => $row['hr_notes'] !== null ? (string) $row['hr_notes'] : null,
            'lastWorkingDay' => (string) $row['last_working_day'],
            'noticePeriodDays' => (int) $row['notice_period_days'],
            'noticeServedFrom' => $row['notice_served_from'],
            'status' => (string) $row['status'],
            'requestedBy' => $row['requested_by'] !== null ? (int) $row['requested_by'] : null,
            'requestedAt' => $row['requested_at'],
            'approverId' => $row['approver_id'] !== null ? (int) $row['approver_id'] : null,
            'approvedAt' => $row['approved_at'],
            'rejectedAt' => $row['rejected_at'],
            'rejectionReason' => $row['rejection_reason'],
            'noticeIssuedAt' => $row['notice_issued_at'],
            'acknowledgedAt' => $row['acknowledged_at'],
            'completedAt' => $row['completed_at'],
            'settlementId' => $row['settlement_id'],
            'settlement' => $settlement,
            'letters' => $this->lettersFor($id),
            'createdAt' => (string) $row['created_at'],
        ];
    }

    /** @param array<string,mixed> $row */
    private function mapLetter(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'terminationRequestId' => (string) $row['termination_request_id'],
            'version' => (int) $row['version'],
            'reference' => (string) $row['reference'],
            'contentHtml' => (string) $row['content_html'],
            'issuedBy' => $row['issued_by'] !== null ? (int) $row['issued_by'] : null,
            'issuedAt' => $row['issued_at'],
            'supersededAt' => $row['superseded_at'],
            'createdAt' => (string) $row['created_at'],
        ];
    }
}
