<?php

declare(strict_types=1);

namespace PayLens\Services;

use PayLens\Core\Config;
use PayLens\Core\Database;

/**
 * Outbound email.
 *
 * Every message is recorded in `email_deliveries` with its state: queued,
 * sent or failed. A message is only ever marked `sent` when the SMTP server
 * confirmed it — when no transport is configured the delivery is recorded
 * as failed with the reason, and the feature reports itself as awaiting
 * configuration rather than pretending to have sent anything.
 *
 * The templates deliberately do not carry salary figures or termination
 * detail. They point at an authenticated page instead.
 */
final class Mailer
{
    public function __construct(private Database $db, private Config $config)
    {
    }

    public function isConfigured(): bool
    {
        return $this->config->string('smtp.host') !== '';
    }

    /**
     * Send a template and record the delivery.
     *
     * @param array<string,mixed> $variables
     * @return array{status:string,error:?string,id:int}
     */
    public function send(
        string $template,
        string $toEmail,
        ?int $toUserId,
        array $variables = [],
    ): array {
        $subject = $this->renderSubject($template, $variables);
        $html = $this->render($template, $variables);
        $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');

        $this->db->execute(
            'INSERT INTO email_deliveries
                (template, recipient_email, recipient_user_id, subject, status, attempts, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 0, ?, ?)',
            [$template, $toEmail, $toUserId, $subject, 'queued', $now, $now],
        );
        $id = (int) $this->db->lastInsertId();

        if (! $this->isConfigured()) {
            return $this->markFailed(
                $id,
                'No SMTP transport is configured. Set SMTP_HOST (and credentials) to enable delivery.',
                0,
            );
        }

        $client = new SmtpClient(
            $this->config->string('smtp.host'),
            $this->config->int('smtp.port', 587),
            $this->config->string('smtp.username'),
            $this->config->string('smtp.password'),
            $this->config->string('smtp.encryption', 'tls'),
            $this->config->int('smtp.timeout', 15),
        );

        try {
            $result = $client->send(
                $this->config->string('smtp.from_email', 'no-reply@paylens.co'),
                $this->config->string('smtp.from_name', 'PayLens'),
                $toEmail,
                $subject,
                $html,
            );
        } catch (\Throwable $e) {
            return $this->markFailed($id, 'Delivery raised an error: ' . $e->getMessage(), 1);
        }

        if (! $result['ok']) {
            return $this->markFailed($id, (string) $result['error'], 1);
        }

        $this->db->execute(
            "UPDATE email_deliveries
             SET status = 'sent', provider = ?, provider_message_id = ?, attempts = attempts + 1,
                 sent_at = ?, updated_at = ?, error = NULL
             WHERE id = ?",
            [
                $this->config->string('smtp.host'),
                $result['message_id'],
                $now,
                $now,
                $id,
            ],
        );

        return ['status' => 'sent', 'error' => null, 'id' => $id];
    }

    /** @return array{status:string,error:?string,id:int} */
    private function markFailed(int $id, string $error, int $attempts): array
    {
        $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');
        $this->db->execute(
            "UPDATE email_deliveries SET status = 'failed', error = ?, attempts = ?, updated_at = ? WHERE id = ?",
            [mb_substr($error, 0, 500), $attempts, $now, $id],
        );
        return ['status' => 'failed', 'error' => $error, 'id' => $id];
    }

    /**
     * Render a template into HTML.
     *
     * @param array<string,mixed> $variables
     */
    public function render(string $template, array $variables = []): string
    {
        $title = $this->title($template, $variables);
        $heading = $this->heading($template, $variables);
        $paragraphs = $this->paragraphs($template, $variables);
        $action = $this->action($template, $variables);
        $footer = $this->footer($template, $variables);

        $appName = $this->config->string('app.name', 'PayLens');
        $appUrl = rtrim($this->config->string('app.frontend_url', 'http://localhost:5173'), '/');

        $body = '';
        foreach ($paragraphs as $paragraph) {
            $body .= '<p style="margin:0 0 16px;line-height:1.6;color:#334155;font-size:15px;">'
                . htmlspecialchars($paragraph, ENT_QUOTES) . '</p>';
        }
        if ($action !== null) {
            $body .= '<p style="margin:24px 0;"><a href="' . htmlspecialchars($action['url'], ENT_QUOTES) . '" '
                . 'style="display:inline-block;background:#C9A54E;color:#0B1A33;text-decoration:none;'
                . 'padding:11px 22px;border-radius:8px;font-weight:600;font-size:14px;">'
                . htmlspecialchars($action['label'], ENT_QUOTES) . '</a></p>';
            $body .= '<p style="margin:0 0 16px;line-height:1.6;color:#64748B;font-size:13px;">'
                . 'This link opens the ' . htmlspecialchars($appName, ENT_QUOTES)
                . ' application, where you will be asked to sign in. '
                . 'The link does not contain any salary or personal detail.</p>';
        }

        return '<!doctype html><html><head><meta charset="utf-8">'
            . '<meta name="viewport" content="width=device-width,initial-scale=1">'
            . '<title>' . htmlspecialchars($title, ENT_QUOTES) . '</title></head>'
            . '<body style="margin:0;padding:32px 16px;background:#F4F6FA;'
            . 'font-family:Inter,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">'
            . '<div style="max-width:560px;margin:0 auto;background:#FFFFFF;border-radius:14px;'
            . 'padding:36px;border:1px solid #E2E6EE;">'
            . '<div style="font-size:18px;font-weight:700;color:#0B1A33;margin-bottom:4px;">'
            . htmlspecialchars($appName, ENT_QUOTES) . '</div>'
            . '<div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#8B661D;'
            . 'margin-bottom:24px;">Payroll Analytics</div>'
            . '<h1 style="margin:0 0 18px;font-size:21px;color:#0B1A33;line-height:1.3;">'
            . htmlspecialchars($heading, ENT_QUOTES) . '</h1>'
            . $body
            . '<hr style="border:0;border-top:1px solid #E2E6EE;margin:28px 0 16px;">'
            . '<p style="margin:0;line-height:1.6;color:#64748B;font-size:12px;">'
            . htmlspecialchars($footer, ENT_QUOTES) . '</p>'
            . '</div></body></html>';
    }

    /** @param array<string,mixed> $variables */
    private function renderSubject(string $template, array $variables): string
    {
        return match ($template) {
            'payroll_submitted' => 'Payroll for ' . ($variables['period'] ?? 'the period') . ' is awaiting approval',
            'payroll_approved' => 'Payroll for ' . ($variables['period'] ?? 'the period') . ' was approved',
            'payroll_rejected' => 'Payroll for ' . ($variables['period'] ?? 'the period') . ' was sent back',
            'payroll_finalized' => 'Payroll for ' . ($variables['period'] ?? 'the period') . ' was finalised',
            'payment_status' => 'Payment update for ' . ($variables['period'] ?? 'the period'),
            'payslip_available' => 'Your payslip is ready',
            'report_available' => 'Your scheduled report is ready',
            'scheduled_job_failed' => 'A scheduled task could not be completed',
            'termination_notice' => 'An official employment document is available for you',
            'settlement_ready' => 'Your final settlement statement is ready',
            default => 'PayLens notification',
        };
    }

    /** @param array<string,mixed> $variables */
    private function title(string $template, array $variables): string
    {
        return $this->renderSubject($template, $variables);
    }

    /** @param array<string,mixed> $variables */
    private function heading(string $template, array $variables): string
    {
        return match ($template) {
            'payroll_submitted' => 'Payroll awaiting your approval',
            'payroll_approved' => 'Payroll approved',
            'payroll_rejected' => 'Payroll sent back for review',
            'payroll_finalized' => 'Payroll finalised',
            'payment_status' => 'Payment status updated',
            'payslip_available' => 'Your payslip is available',
            'report_available' => 'Your report is available',
            'scheduled_job_failed' => 'A scheduled task failed',
            'termination_notice' => 'An official document is ready for you',
            'settlement_ready' => 'Your final settlement statement is ready',
            default => 'PayLens',
        };
    }

    /**
     * @param array<string,mixed> $variables
     * @return array<int,string>
     */
    private function paragraphs(string $template, array $variables): array
    {
        return match ($template) {
            'payroll_submitted' => [
                'A payroll run for ' . ($variables['period'] ?? 'the period') . ' has been prepared and submitted for approval.',
                'Review the run totals and the employee-level breakdown before you approve it.',
            ],
            'payroll_approved' => [
                'The payroll run for ' . ($variables['period'] ?? 'the period') . ' has been approved.',
                'It will be finalised shortly. Payment status is tracked separately and will appear here once it is recorded.',
            ],
            'payroll_rejected' => [
                'The payroll run for ' . ($variables['period'] ?? 'the period') . ' was sent back for review.',
                'Reason: ' . ($variables['reason'] ?? 'not recorded'),
            ],
            'payroll_finalized' => [
                'The payroll run for ' . ($variables['period'] ?? 'the period') . ' has been finalised.',
                'The payslips are now available in the application. Payment status is recorded separately.',
            ],
            'payment_status' => [
                'A payment for ' . ($variables['employeeName'] ?? 'an employee') . ' in ' . ($variables['period'] ?? 'the period')
                    . ' is now ' . ($variables['status'] ?? 'updated') . '.',
                ($variables['status'] ?? '') === 'failed'
                    ? 'Reason: ' . ($variables['reason'] ?? 'not recorded')
                    : 'Open the application to see the full payment record.',
            ],
            'payslip_available' => [
                'A payslip has been published for you.',
                'Open the application to view, download or print it.',
            ],
            'report_available' => [
                'The scheduled report "' . ($variables['report'] ?? 'Payroll report') . '" is ready.',
                'Open the application to view it.',
            ],
            'scheduled_job_failed' => [
                'The scheduled task "' . ($variables['job'] ?? 'scheduled task') . '" could not be completed.',
                'An administrator can inspect the failure and retry it from the background jobs screen.',
            ],
            'termination_notice' => [
                'An official employment document relating to your employment has been issued and is available to you.',
                'Open the document in the application to read it, download or print it, and acknowledge that you have received it.',
                'Acknowledging confirms receipt only. It does not mean you agree with the decision or waive any rights.',
            ],
            'settlement_ready' => [
                'Your final settlement statement is available.',
                'Open the application to review the breakdown of every component.',
            ],
            default => ['There is an update waiting for you in the application.'],
        };
    }

    /**
     * @param array<string,mixed> $variables
     * @return array{label:string,url:string}|null
     */
    private function action(string $template, array $variables): ?array
    {
        $base = rtrim($this->config->string('app.frontend_url', 'http://localhost:5173'), '/');

        return match ($template) {
            'payroll_submitted' => ['label' => 'Review the payroll run', 'url' => $base . '/payroll/runs'],
            'payroll_approved' => ['label' => 'View the payroll run', 'url' => $base . '/payroll/runs'],
            'payroll_rejected' => ['label' => 'Open the payroll run', 'url' => $base . '/payroll/runs'],
            'payroll_finalized' => ['label' => 'View the payroll run', 'url' => $base . '/payroll/runs'],
            'payment_status' => ['label' => 'View payment status', 'url' => $base . '/payroll/payments'],
            'payslip_available' => ['label' => 'View my payslips', 'url' => $base . '/me/payslips'],
            'report_available' => ['label' => 'View the report', 'url' => $base . '/reports'],
            'scheduled_job_failed' => ['label' => 'View background jobs', 'url' => $base . '/jobs'],
            'termination_notice' => ['label' => 'Open my document', 'url' => $base . '/me/termination'],
            'settlement_ready' => ['label' => 'View my settlement', 'url' => $base . '/me/settlement'],
            default => null,
        };
    }

    /** @param array<string,mixed> $variables */
    private function footer(string $template, array $variables): string
    {
        $org = $variables['organisation'] ?? 'PayLens Technologies Pvt. Ltd.';
        $contact = $variables['contact'] ?? 'people@paylens.co';
        return 'This message was sent by ' . $org . '. If you were not expecting it, '
            . 'you can safely ignore it. For any payroll question, contact ' . $contact . '.';
    }
}
