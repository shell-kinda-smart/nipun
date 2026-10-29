<?php

declare(strict_types=1);

namespace PayLens\Controllers;

use PayLens\Core\App;
use PayLens\Core\HttpException;
use PayLens\Core\Money;
use PayLens\Core\Request;
use PayLens\Core\Response;
use PayLens\Repositories\PayrollRepository;
use PayLens\Support\Mapper;

/**
 * Payslip access.
 *
 * An employee may only ever read their own payslips; the check is made here
 * on the server, not in the UI. HR, finance and admin roles with
 * `payroll:read` may read any payslip.
 */
final class PayslipController extends Controller
{
    private PayrollRepository $payroll;

    public function __construct(App $app)
    {
        parent::__construct($app);
        $this->payroll = new PayrollRepository($app->db);
    }

    /** GET /api/payslips */
    public function index(Request $request): void
    {
        $user = $this->requireUser($request);
        $role = (string) $user['role'];

        if ($role === 'employee') {
            $employeeId = $user['employee_id'] !== null ? (string) $user['employee_id'] : '';
            $rows = $employeeId === '' ? [] : $this->payroll->payslipsForEmployee($employeeId);
        } else {
            $this->requirePermission($request, 'payroll:read');
            $employeeId = $this->stringParam($request, 'employeeId');
            $rows = $employeeId === ''
                ? $this->allPayslips()
                : $this->payroll->payslipsForEmployee($employeeId);
        }

        $data = array_map(
            fn (array $row): array => Mapper::payslip($row, $this->payroll->payslipLines((string) $row['id'])),
            $rows,
        );
        Response::json($data);
    }

    /**
     * Whether the signed-in user may read a given payslip.
     *
     * The employee role is restricted to its own records even though it
     * holds the `payroll:read` permission — the permission allows reading
     * payroll, it does not widen the employee's own scope.
     *
     * @param array<string,mixed> $user
     * @param array<string,mixed> $payslip
     */
    private function canRead(array $user, array $payslip): bool
    {
        $isOwner = (string) $payslip['employee_id'] === (string) ($user['employee_id'] ?? '');
        if ($isOwner) {
            return true;
        }
        if ((string) $user['role'] === 'employee') {
            return false;
        }
        return $this->app->rbac->has((string) $user['role'], 'payroll:read');
    }

    /** GET /api/payslips/{id} */
    public function show(Request $request, array $params): void
    {
        $user = $this->requireUser($request);
        $payslip = $this->payroll->payslip((string) $params['id']);
        if ($payslip === null) {
            throw new HttpException('not_found', 'Payslip not found.', 404);
        }
        if (! $this->canRead($user, $payslip)) {
            throw new HttpException('forbidden', 'You do not have permission to read this payslip.', 403);
        }

        $lines = $this->payroll->payslipLines((string) $payslip['id']);
        Response::json(Mapper::payslip($payslip, $lines));
    }

    /** GET /api/payslips/{id}/csv */
    public function csv(Request $request, array $params): void
    {
        $user = $this->requireUser($request);
        $payslip = $this->payroll->payslip((string) $params['id']);
        if ($payslip === null) {
            throw new HttpException('not_found', 'Payslip not found.', 404);
        }
        if (! $this->canRead($user, $payslip)) {
            throw new HttpException('forbidden', 'You do not have permission to read this payslip.', 403);
        }

        $lines = $this->payroll->payslipLines((string) $payslip['id']);
        $rows = [['Type', 'Component', 'Amount']];
        foreach ($lines as $line) {
            $rows[] = [
                (string) $line['kind'],
                (string) $line['label'],
                number_format(Money::fromMinor((int) $line['amount_paise']), 2, '.', ''),
            ];
        }
        $rows[] = ['', 'Gross', number_format(Money::fromMinor((int) $payslip['gross_paise']), 2, '.', '')];
        $rows[] = ['', 'Total deductions', number_format(Money::fromMinor((int) $payslip['total_deductions_paise']), 2, '.', '')];
        $rows[] = ['', 'Net payable', number_format(Money::fromMinor((int) $payslip['net_paise']), 2, '.', '')];

        $this->app->audit->log(
            $this->actorId($request),
            'payslip.exported',
            'payslip',
            (string) $payslip['id'],
            'success',
            [],
            $request->ip(),
        );

        Response::csv('paylens-payslip-' . (string) $payslip['id'] . '.csv', ['Type', 'Component', 'Amount'], array_slice($rows, 1));
    }

    /** GET /api/payslips/{id}/print */
    public function print(Request $request, array $params): void
    {
        $user = $this->requireUser($request);
        $payslip = $this->payroll->payslip((string) $params['id']);
        if ($payslip === null) {
            throw new HttpException('not_found', 'Payslip not found.', 404);
        }
        if (! $this->canRead($user, $payslip)) {
            throw new HttpException('forbidden', 'You do not have permission to read this payslip.', 403);
        }

        $lines = $this->payroll->payslipLines((string) $payslip['id']);
        $earnings = '';
        $deductions = '';
        foreach ($lines as $line) {
            $row = sprintf(
                '<tr><td>%s</td><td class="num">%s</td></tr>',
                htmlspecialchars((string) $line['label'], ENT_QUOTES),
                number_format(Money::fromMinor((int) $line['amount_paise']), 2),
            );
            if ((string) $line['kind'] === 'earning') {
                $earnings .= $row;
            } else {
                $deductions .= $row;
            }
        }

        $month = (int) $payslip['period_month'];
        $year = (int) $payslip['period_year'];
        $monthName = date('F', mktime(0, 0, 0, $month, 1));

        http_response_code(200);
        header('Content-Type: text/html; charset=utf-8');
        echo '<!doctype html><html lang="en"><head><meta charset="utf-8" />'
            . '<title>Payslip ' . htmlspecialchars($monthName . ' ' . $year, ENT_QUOTES) . '</title>'
            . '<style>'
            . 'body{font-family:Inter,system-ui,sans-serif;color:#060E1F;margin:0;padding:40px;background:#F4F6FA}'
            . '.card{background:#fff;border:1px solid #e2e6ee;border-radius:16px;padding:32px;max-width:760px;margin:0 auto}'
            . 'h1{font-size:20px;margin:0 0 4px} .muted{color:#64748b;font-size:13px;margin:0 0 24px}'
            . 'table{width:100%;border-collapse:collapse;margin-bottom:24px}'
            . 'td{padding:8px 0;border-bottom:1px solid #eef1f6;font-size:14px}'
            . 'td.num{text-align:right;font-variant-numeric:tabular-nums}'
            . '.total{font-weight:700;font-size:16px} .head{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#64748b}'
            . '@media print{body{background:#fff;padding:0}.card{border:0;max-width:none}}'
            . '</style></head><body><div class="card">'
            . '<h1>PayLens Technologies Pvt. Ltd.</h1>'
            . '<p class="muted">Salary slip for ' . htmlspecialchars((string) $payslip['employee_name'], ENT_QUOTES)
            . ' · ' . htmlspecialchars($monthName . ' ' . $year, ENT_QUOTES) . '</p>'
            . '<table><tr class="head"><td>Earnings</td><td class="num head">Amount</td></tr>' . $earnings . '</table>'
            . '<table><tr class="head"><td>Deductions</td><td class="num head">Amount</td></tr>' . $deductions . '</table>'
            . '<table>'
            . '<tr><td>Gross earnings</td><td class="num total">₹' . number_format(Money::fromMinor((int) $payslip['gross_paise']), 2) . '</td></tr>'
            . '<tr><td>Total deductions</td><td class="num total">₹' . number_format(Money::fromMinor((int) $payslip['total_deductions_paise']), 2) . '</td></tr>'
            . '<tr><td>Net payable</td><td class="num total">₹' . number_format(Money::fromMinor((int) $payslip['net_paise']), 2) . '</td></tr>'
            . '</table></div></body></html>';
    }

    /** @return array<int,array<string,mixed>> */
    private function allPayslips(): array
    {
        return $this->app->db->select(
            'SELECT * FROM payslips ORDER BY period_year DESC, period_month DESC, employee_id LIMIT 500',
        );
    }
}
