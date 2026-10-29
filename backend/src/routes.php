<?php

declare(strict_types=1);

use PayLens\Controllers\AnomalyController;
use PayLens\Controllers\AuditController;
use PayLens\Controllers\AuthController;
use PayLens\Controllers\DepartmentController;
use PayLens\Controllers\DocumentController;
use PayLens\Controllers\EmployeeController;
use PayLens\Controllers\JobController;
use PayLens\Controllers\MeController;
use PayLens\Controllers\MyTerminationController;
use PayLens\Controllers\NotificationController;
use PayLens\Controllers\PaymentController;
use PayLens\Controllers\PayslipController;
use PayLens\Controllers\PayrollController;
use PayLens\Controllers\ReportController;
use PayLens\Controllers\ScheduleController;
use PayLens\Controllers\SettlementController;
use PayLens\Controllers\SettingsController;
use PayLens\Controllers\TerminationController;
use PayLens\Core\App;
use PayLens\Core\Request;
use PayLens\Core\Response;
use PayLens\Core\Router;

/**
 * API route table.
 *
 * Every protected route carries the `auth` middleware, and every mutating
 * route additionally carries `csrf`. Permissions are enforced inside each
 * controller against the session user's role — never by the frontend.
 */
return static function (Router $router, App $app): void {
    // ── Authentication ────────────────────────────────────────────────
    $router->post('/api/auth/login', static function (Request $r) use ($app): void {
        (new AuthController($app))->login($r);
    });

    // Demo-only: signs in as a seeded role without a password. The endpoint
    // does not exist unless the server runs in demo mode.
    $router->post('/api/auth/demo-login', static function (Request $r) use ($app): void {
        (new AuthController($app))->demoLogin($r);
    });

    // Demo-only: the seeded accounts offered by the role switcher.
    $router->get('/api/auth/demo-users', static function (Request $r) use ($app): void {
        (new AuthController($app))->demoUsers($r);
    });

    $router->group(['auth', 'csrf'], static function (Router $router) use ($app): void {
        $router->get('/api/auth/me', static function (Request $r) use ($app): void {
            (new AuthController($app))->me($r);
        });
        $router->post('/api/auth/logout', static function (Request $r) use ($app): void {
            (new AuthController($app))->logout($r);
        });
        $router->post('/api/auth/password', static function (Request $r) use ($app): void {
            (new AuthController($app))->changePassword($r);
        });
        $router->get('/api/auth/password-policy', static function (Request $r) use ($app): void {
            (new AuthController($app))->passwordPolicy($r);
        });
        $router->get('/api/auth/sessions', static function (Request $r) use ($app): void {
            (new AuthController($app))->sessions($r);
        });
        $router->delete('/api/auth/sessions/{id}', static function (Request $r, array $p) use ($app): void {
            (new AuthController($app))->revokeSession($r, $p);
        });

        // ── Organisation ───────────────────────────────────────────────
        $router->get('/api/departments', static function (Request $r) use ($app): void {
            (new DepartmentController($app))->index($r);
        });

        $router->get('/api/employees', static function (Request $r) use ($app): void {
            (new EmployeeController($app))->index($r);
        });
        // Registered before /api/employees/{id} so the literal path wins.
        $router->get('/api/employees/export.csv', static function (Request $r) use ($app): void {
            (new EmployeeController($app))->export($r);
        });
        $router->post('/api/employees', static function (Request $r) use ($app): void {
            (new EmployeeController($app))->store($r);
        });
        $router->get('/api/employees/{id}', static function (Request $r, array $p) use ($app): void {
            (new EmployeeController($app))->show($r, $p);
        });
        $router->patch('/api/employees/{id}', static function (Request $r, array $p) use ($app): void {
            (new EmployeeController($app))->update($r, $p);
        });
        $router->post('/api/employees/{id}/archive', static function (Request $r, array $p) use ($app): void {
            (new EmployeeController($app))->archive($r, $p);
        });
        $router->get('/api/employees/{id}/compensation', static function (Request $r, array $p) use ($app): void {
            (new EmployeeController($app))->compensation($r, $p);
        });
        $router->put('/api/employees/{id}/compensation', static function (Request $r, array $p) use ($app): void {
            (new EmployeeController($app))->updateCompensation($r, $p);
        });
        $router->get('/api/employees/{id}/payslips', static function (Request $r, array $p) use ($app): void {
            (new EmployeeController($app))->payslips($r, $p);
        });

        // ── Payroll ────────────────────────────────────────────────────
        $router->get('/api/payroll/runs', static function (Request $r) use ($app): void {
            (new PayrollController($app))->index($r);
        });
        $router->post('/api/payroll/runs', static function (Request $r) use ($app): void {
            (new PayrollController($app))->store($r);
        });
        $router->get('/api/payroll/rules', static function (Request $r) use ($app): void {
            (new PayrollController($app))->rules($r);
        });
        $router->get('/api/payroll/approvers', static function (Request $r) use ($app): void {
            (new PayrollController($app))->approvers($r);
        });
        $router->post('/api/payroll/preview', static function (Request $r) use ($app): void {
            (new PayrollController($app))->preview($r);
        });
        $router->get('/api/payroll/runs/{id}', static function (Request $r, array $p) use ($app): void {
            (new PayrollController($app))->show($r, $p);
        });
        $router->get('/api/payroll/runs/{id}/payslips', static function (Request $r, array $p) use ($app): void {
            (new PayrollController($app))->payslips($r, $p);
        });
        $router->post('/api/payroll/runs/{id}/calculate', static function (Request $r, array $p) use ($app): void {
            (new PayrollController($app))->calculate($r, $p);
        });
        $router->post('/api/payroll/runs/{id}/approve', static function (Request $r, array $p) use ($app): void {
            (new PayrollController($app))->approve($r, $p);
        });
        $router->post('/api/payroll/runs/{id}/finalize', static function (Request $r, array $p) use ($app): void {
            (new PayrollController($app))->finalize($r, $p);
        });
        $router->post('/api/payroll/runs/{id}/reverse', static function (Request $r, array $p) use ($app): void {
            (new PayrollController($app))->reverse($r, $p);
        });
        $router->post('/api/payroll/runs/{id}/adjustments', static function (Request $r, array $p) use ($app): void {
            (new PayrollController($app))->addAdjustment($r, $p);
        });

        // ── Payslips ───────────────────────────────────────────────────
        $router->get('/api/payslips', static function (Request $r) use ($app): void {
            (new PayslipController($app))->index($r);
        });
        $router->get('/api/payslips/{id}', static function (Request $r, array $p) use ($app): void {
            (new PayslipController($app))->show($r, $p);
        });
        $router->get('/api/payslips/{id}/csv', static function (Request $r, array $p) use ($app): void {
            (new PayslipController($app))->csv($r, $p);
        });
        $router->get('/api/payslips/{id}/print', static function (Request $r, array $p) use ($app): void {
            (new PayslipController($app))->print($r, $p);
        });

        // ── Reports ────────────────────────────────────────────────────
        $router->get('/api/summary', static function (Request $r) use ($app): void {
            (new ReportController($app))->summary($r);
        });
        $router->get('/api/reports/dashboard', static function (Request $r) use ($app): void {
            (new ReportController($app))->dashboard($r);
        });
        $router->get('/api/reports/analytics', static function (Request $r) use ($app): void {
            (new ReportController($app))->analytics($r);
        });
        $router->get('/api/reports/tax-center', static function (Request $r) use ($app): void {
            (new ReportController($app))->taxCenter($r);
        });
        $router->get('/api/reports/{type}.csv', static function (Request $r, array $p) use ($app): void {
            (new ReportController($app))->csv($r, $p);
        });
        $router->get('/api/reports/{type}', static function (Request $r, array $p) use ($app): void {
            (new ReportController($app))->show($r, $p);
        });

        // ── Anomalies ──────────────────────────────────────────────────
        $router->get('/api/anomalies', static function (Request $r) use ($app): void {
            (new AnomalyController($app))->index($r);
        });
        $router->get('/api/anomalies/{id}', static function (Request $r, array $p) use ($app): void {
            (new AnomalyController($app))->show($r, $p);
        });
        $router->patch('/api/anomalies/{id}', static function (Request $r, array $p) use ($app): void {
            (new AnomalyController($app))->update($r, $p);
        });

        // ── Audit ──────────────────────────────────────────────────────
        $router->get('/api/audit-logs', static function (Request $r) use ($app): void {
            (new AuditController($app))->index($r);
        });
        $router->get('/api/audit-logs.csv', static function (Request $r) use ($app): void {
            (new AuditController($app))->csv($r);
        });

        // ── Notifications ──────────────────────────────────────────────
        $router->get('/api/notifications', static function (Request $r) use ($app): void {
            (new NotificationController($app))->index($r);
        });
        $router->post('/api/notifications/read-all', static function (Request $r) use ($app): void {
            (new NotificationController($app))->markAllRead($r);
        });
        $router->patch('/api/notifications/{id}/read', static function (Request $r, array $p) use ($app): void {
            (new NotificationController($app))->markRead($r, $p);
        });

        // ── Documents ──────────────────────────────────────────────────
        $router->get('/api/documents', static function (Request $r) use ($app): void {
            (new DocumentController($app))->index($r);
        });
        $router->get('/api/documents/{id}', static function (Request $r, array $p) use ($app): void {
            (new DocumentController($app))->show($r, $p);
        });

        // ── Own records ────────────────────────────────────────────────
        $router->get('/api/me/profile', static function (Request $r) use ($app): void {
            (new MeController($app))->profile($r);
        });
        $router->get('/api/me/payslips', static function (Request $r) use ($app): void {
            (new MeController($app))->payslips($r);
        });
        $router->get('/api/me/tax', static function (Request $r) use ($app): void {
            (new MeController($app))->tax($r);
        });

        // ── Settings ───────────────────────────────────────────────────
        $router->get('/api/settings/profile', static function (Request $r) use ($app): void {
            (new SettingsController($app))->profile($r);
        });
        $router->put('/api/settings/profile', static function (Request $r) use ($app): void {
            (new SettingsController($app))->updateProfile($r);
        });
        $router->get('/api/settings/preferences', static function (Request $r) use ($app): void {
            (new SettingsController($app))->preferences($r);
        });
        $router->put('/api/settings/preferences', static function (Request $r) use ($app): void {
            (new SettingsController($app))->updatePreferences($r);
        });
        $router->get('/api/settings/billing', static function (Request $r) use ($app): void {
            (new SettingsController($app))->billing($r);
        });
        $router->get('/api/settings/tax-slabs', static function (Request $r) use ($app): void {
            (new SettingsController($app))->taxSlabs($r);
        });

        // ── Payroll selection, approval and payments ───────────────────
        $router->get('/api/payroll/runs/{id}/selection', static function (Request $r, array $p) use ($app): void {
            (new PayrollController($app))->selection($r, $p);
        });
        $router->put('/api/payroll/runs/{id}/selection', static function (Request $r, array $p) use ($app): void {
            (new PayrollController($app))->setSelection($r, $p);
        });
        $router->post('/api/payroll/runs/{id}/submit', static function (Request $r, array $p) use ($app): void {
            (new PayrollController($app))->submit($r, $p);
        });
        $router->post('/api/payroll/runs/{id}/reject', static function (Request $r, array $p) use ($app): void {
            (new PayrollController($app))->reject($r, $p);
        });
        $router->get('/api/payroll/approvals', static function (Request $r) use ($app): void {
            (new PayrollController($app))->approvals($r);
        });
        $router->get('/api/payroll/payments', static function (Request $r) use ($app): void {
            (new PaymentController($app))->index($r);
        });
        $router->get('/api/payroll/runs/{id}/payments', static function (Request $r, array $p) use ($app): void {
            (new PaymentController($app))->forRun($r, $p);
        });
        $router->post('/api/payroll/runs/{id}/payments', static function (Request $r, array $p) use ($app): void {
            (new PaymentController($app))->record($r, $p);
        });
        $router->get('/api/payroll/payments/{id}/history', static function (Request $r, array $p) use ($app): void {
            (new PaymentController($app))->history($r, $p);
        });

        // ── Holds ───────────────────────────────────────────────────────
        $router->get('/api/holds', static function (Request $r) use ($app): void {
            (new EmployeeController($app))->listHolds($r);
        });
        $router->post('/api/holds/{id}/release', static function (Request $r, array $p) use ($app): void {
            (new EmployeeController($app))->releaseHold($r, $p);
        });
        $router->get('/api/employees/{id}/holds', static function (Request $r, array $p) use ($app): void {
            (new EmployeeController($app))->holds($r, $p);
        });
        $router->post('/api/employees/{id}/holds', static function (Request $r, array $p) use ($app): void {
            (new EmployeeController($app))->placeHold($r, $p);
        });

        // ── Schedules and background jobs ────────────────────────────────
        $router->get('/api/schedules', static function (Request $r) use ($app): void {
            (new ScheduleController($app))->index($r);
        });
        $router->post('/api/schedules', static function (Request $r) use ($app): void {
            (new ScheduleController($app))->store($r);
        });
        $router->get('/api/schedules/mail-status', static function (Request $r) use ($app): void {
            (new ScheduleController($app))->mailStatus($r);
        });
        $router->post('/api/schedules/run-due', static function (Request $r) use ($app): void {
            (new ScheduleController($app))->runDue($r);
        });
        $router->patch('/api/schedules/{id}', static function (Request $r, array $p) use ($app): void {
            (new ScheduleController($app))->update($r, $p);
        });
        $router->get('/api/jobs', static function (Request $r) use ($app): void {
            (new JobController($app))->index($r);
        });
        $router->get('/api/jobs/failed', static function (Request $r) use ($app): void {
            (new JobController($app))->failed($r);
        });
        $router->post('/api/jobs/{id}/retry', static function (Request $r, array $p) use ($app): void {
            (new JobController($app))->retry($r, $p);
        });

        // ── Termination and final settlement ────────────────────────────
        $router->get('/api/terminations', static function (Request $r) use ($app): void {
            (new TerminationController($app))->index($r);
        });
        $router->post('/api/terminations', static function (Request $r) use ($app): void {
            (new TerminationController($app))->store($r);
        });
        $router->get('/api/terminations/{id}', static function (Request $r, array $p) use ($app): void {
            (new TerminationController($app))->show($r, $p);
        });
        $router->post('/api/terminations/{id}/submit', static function (Request $r, array $p) use ($app): void {
            (new TerminationController($app))->submit($r, $p);
        });
        $router->post('/api/terminations/{id}/approve', static function (Request $r, array $p) use ($app): void {
            (new TerminationController($app))->approve($r, $p);
        });
        $router->post('/api/terminations/{id}/reject', static function (Request $r, array $p) use ($app): void {
            (new TerminationController($app))->reject($r, $p);
        });
        $router->post('/api/terminations/{id}/issue-notice', static function (Request $r, array $p) use ($app): void {
            (new TerminationController($app))->issueNotice($r, $p);
        });
        $router->get('/api/settlements', static function (Request $r) use ($app): void {
            (new SettlementController($app))->index($r);
        });
        $router->post('/api/settlements/calculate', static function (Request $r) use ($app): void {
            (new SettlementController($app))->calculate($r);
        });
        $router->get('/api/settlements/{id}', static function (Request $r, array $p) use ($app): void {
            (new SettlementController($app))->show($r, $p);
        });
        $router->post('/api/settlements/{id}/items', static function (Request $r, array $p) use ($app): void {
            (new SettlementController($app))->addItem($r, $p);
        });
        $router->post('/api/settlements/{id}/approve', static function (Request $r, array $p) use ($app): void {
            (new SettlementController($app))->approve($r, $p);
        });
        $router->post('/api/settlements/{id}/finalize', static function (Request $r, array $p) use ($app): void {
            (new SettlementController($app))->finalize($r, $p);
        });
        $router->get('/api/me/termination', static function (Request $r) use ($app): void {
            (new MyTerminationController($app))->show($r);
        });
        $router->post('/api/me/termination/acknowledge', static function (Request $r) use ($app): void {
            (new MyTerminationController($app))->acknowledge($r);
        });
    });
};
