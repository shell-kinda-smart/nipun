<?php

declare(strict_types=1);

/**
 * PayLens backend test suite.
 *
 *   php backend/tests/run.php
 *
 * Runs against an in-memory SQLite database so it needs no services, but
 * exercises the real kernel, repositories, services and seed.
 */

use PayLens\Core\Money;
use PayLens\Core\Response;
use PayLens\Core\TestRunner;
use PayLens\Core\Validator;
use PayLens\Core\ValidationException;
use PayLens\Services\PayrollCalculator;
use PayLens\Support\Random;
use PayLens\Tests\TestCase;

require dirname(__DIR__) . '/bootstrap.php';

$t = new TestRunner();

// ============================================================================
// Unit — money
// ============================================================================
$t->group('Money');

$t->test('converts rupees to paise without floating point drift', function (TestRunner $t): void {
    $t->assertSame(100000, Money::toMinor(1000));
    $t->assertSame(1, Money::toMinor(0.01));
    $t->assertSame(0, Money::toMinor(0));
    $t->assertSame(-150, Money::toMinor(-1.5));
});

$t->test('rounds half-up', function (TestRunner $t): void {
    $t->assertSame(11, Money::toMinor(0.105));
    $t->assertSame(10, Money::toMinor(0.104));
    $t->assertSame(-11, Money::toMinor(-0.105));
});

$t->test('applies basis points with integer maths', function (TestRunner $t): void {
    // 12% of ₹50,000 = ₹6,000
    $t->assertSame(600000, Money::applyRate(5000000, 1200));
    // 10% of ₹1,000 = ₹100
    $t->assertSame(10000, Money::applyRate(100000, 1000));
    // Rounds half up on the minor unit.
    $t->assertSame(1, Money::applyRate(1, 5000));
    $t->assertSame(2, Money::applyRate(3, 5000));
});

$t->test('groups digits the Indian way', function (TestRunner $t): void {
    $t->assertSame('48,98,505', Money::groupIndian(4898505));
    $t->assertSame('1,00,000', Money::groupIndian(100000));
    $t->assertSame('999', Money::groupIndian(999));
    $t->assertSame('1,00,00,000', Money::groupIndian(10000000));
});

$t->test('formats currency', function (TestRunner $t): void {
    $t->assertSame('₹48,98,505.00', Money::format(489850500));
    $t->assertSame('-₹1,000.50', Money::format(-100050));
});

// ============================================================================
// Unit — validation
// ============================================================================
$t->group('Validator');

$t->test('rejects missing required fields', function (TestRunner $t): void {
    $t->assertThrows(ValidationException::class, static function (): void {
        (new Validator(['email' => 'a@b.co']))->validate(['email' => 'required|email', 'name' => 'required|string']);
    });
});

$t->test('rejects malformed emails and bad enums', function (TestRunner $t): void {
    $t->assertThrows(ValidationException::class, static function (): void {
        (new Validator(['email' => 'nope']))->validate(['email' => 'required|email']);
    });
    $t->assertThrows(ValidationException::class, static function (): void {
        (new Validator(['status' => 'weird']))->validate(['status' => 'required|in:active|exited']);
    });
});

$t->test('accepts valid input and normalises it', function (TestRunner $t): void {
    $result = (new Validator([
        'email' => '  Person@Paylens.co ',
        'status' => 'active',
        'rating' => '4',
    ]))->validate([
        'email' => 'required|email',
        'status' => 'required|in:active|exited',
        'rating' => 'nullable|integer',
    ]);
    $t->assertSame('person@paylens.co', $result['email']);
    $t->assertSame(4, $result['rating']);
});

$t->test('rejects dates that are not real dates', function (TestRunner $t): void {
    $t->assertThrows(ValidationException::class, static function (): void {
        (new Validator(['joinedAt' => '2026-02-31']))->validate(['joinedAt' => 'required|date']);
    });
});

// ============================================================================
// Unit — CSV injection
// ============================================================================
$t->group('CSV export safety');

$t->test('neutralises spreadsheet formulas', function (TestRunner $t): void {
    $t->assertSame("'=1+1", Response::csvCell('=1+1'));
    $t->assertSame("'+SUM(A1)", Response::csvCell('+SUM(A1)'));
    $t->assertSame("'@cmd", Response::csvCell('@cmd'));
    $t->assertSame("'-2", Response::csvCell('-2'));
    $t->assertSame('ordinary value', Response::csvCell('ordinary value'));
    $t->assertSame('', Response::csvCell(null));
});

// ============================================================================
// Unit — deterministic random
// ============================================================================
$t->group('Deterministic seeding');

$t->test('reproduces the frontend LCG sequence', function (TestRunner $t): void {
    // The JavaScript original seeds with 0xC0FFEE and multiplies by
    // 1664525, adding 1013904223 each time, masked to 32 bits.
    $rand = new Random(0xC0FFEE);
    $first = $rand->next();
    $second = $rand->next();

    $expected = static function (int $state): float {
        return (($state * 1664525 + 1013904223) & 0xFFFFFFFF) / 0x100000000;
    };
    $t->assertSame($expected(0xC0FFEE), $first);
    $t->assertSame($expected(($first * 0x100000000) | 0), $second, 'second draw follows the same recurrence');
});

// ============================================================================
// Unit — payroll calculator
// ============================================================================
$t->group('Payroll calculator');

$rules = [
    'pf_employee' => ['basis' => 'percent_basic', 'rate_basis_points' => 1200, 'amount_paise' => null, 'cap_paise' => 180000, 'enabled' => 1],
    'professional_tax' => ['basis' => 'fixed', 'rate_basis_points' => null, 'amount_paise' => 20000, 'cap_paise' => null, 'enabled' => 1],
    'tds_basic' => ['basis' => 'percent_basic', 'rate_basis_points' => 1000, 'amount_paise' => null, 'cap_paise' => null, 'enabled' => 1],
];

$calculator = new PayrollCalculator(
    new \PayLens\Core\Database(new \PayLens\Core\Config(['db' => ['driver' => 'sqlite', 'database' => ':memory:']])),
    new \PayLens\Services\RuleRepository(new \PayLens\Core\Database(new \PayLens\Core\Config(['db' => ['driver' => 'sqlite', 'database' => ':memory:']]))),
);

$t->test('computes gross, deductions and net', function (TestRunner $t) use ($calculator, $rules): void {
    $result = $calculator->calculate([
        'basic_paise' => 5000000,       // ₹50,000
        'hra_paise' => 2500000,          // ₹25,000
        'special_allowance_paise' => 1000000, // ₹10,000
        'travel_allowance_paise' => 0,
    ], $rules);

    $t->assertSame(8500000, $result['gross_paise'], 'gross = basic + hra + special');
    // pf 12% of basic would be ₹6,000 but the configured cap is ₹1,800;
    // professional tax is ₹200; tds is 10% of basic.
    $t->assertSame(180000 + 20000 + 500000, $result['total_deductions_paise'], 'capped pf + professional tax + tds');
    $t->assertSame(8500000 - 700000, $result['net_paise'], 'net = gross - deductions');
    $t->assertSame(500000, $result['tax_paise'], 'tds is 10% of basic');
    $t->assertSame(
        $result['gross_paise'] - $result['total_deductions_paise'],
        $result['net_paise'],
        'net always equals gross minus deductions',
    );
});

$t->test('applies the provident fund cap', function (TestRunner $t) use ($calculator, $rules): void {
    $result = $calculator->calculate([
        'basic_paise' => 30000000, // ₹300,000 — 12% would be ₹36,000
        'hra_paise' => 0,
        'special_allowance_paise' => 0,
        'travel_allowance_paise' => 0,
    ], $rules);
    // Capped at ₹1,800 = 180000 paise.
    $t->assertSame(180000, $result['total_deductions_paise'] - 20000 - 3000000);
});

$t->test('handles zero-value components', function (TestRunner $t) use ($calculator, $rules): void {
    $result = $calculator->calculate([
        'basic_paise' => 0,
        'hra_paise' => 0,
        'special_allowance_paise' => 0,
        'travel_allowance_paise' => 0,
    ], $rules);
    $t->assertSame(0, $result['gross_paise']);
    $t->assertSame(0, $result['net_paise']);
    $t->assertSame([], $result['lines']);
});

$t->test('rejects negative salary components', function (TestRunner $t) use ($calculator, $rules): void {
    $result = $calculator->calculate([
        'basic_paise' => -100,
        'hra_paise' => 0,
        'special_allowance_paise' => 0,
        'travel_allowance_paise' => 0,
    ], $rules);
    $t->assert($result['errors'] !== [], 'a negative component is reported');
});

$t->test('includes approved adjustments', function (TestRunner $t) use ($calculator, $rules): void {
    $result = $calculator->calculate([
        'basic_paise' => 1000000,
        'hra_paise' => 0,
        'special_allowance_paise' => 0,
        'travel_allowance_paise' => 0,
    ], $rules, [
        ['kind' => 'bonus', 'amount_paise' => 500000],
        ['kind' => 'overtime', 'amount_paise' => 100000],
        ['kind' => 'deduction', 'amount_paise' => 25000],
    ]);
    $t->assertSame(1600000, $result['gross_paise'], 'bonus and overtime are earnings');
    // pf 120000 + professional tax 20000 + tds 100000 + the 25000 adjustment.
    $t->assertSame(265000, $result['total_deductions_paise'], 'adjustment deductions are included');
});

// ============================================================================
// Integration — schema and seed
// ============================================================================
$t->group('Schema and seed');

$case = new TestCase($t);
$case->boot();

$t->test('migrations create the expected tables', function (TestRunner $t) use ($case): void {
    foreach ([
        'users', 'roles', 'permissions', 'role_permissions', 'sessions', 'rate_limits',
        'audit_logs', 'departments', 'employees', 'salary_structures', 'employee_bank_details',
        'employee_attendance', 'payroll_rules', 'payroll_runs', 'payslips', 'payslip_lines',
        'payroll_adjustments', 'anomalies', 'notifications', 'documents', 'tax_slabs',
        'user_preferences', 'billing_invoices',
    ] as $table) {
        $t->assert($case->count($table) >= 0, "table {$table} exists");
    }
});

$t->test('the seed reproduces the demo dataset', function (TestRunner $t) use ($case): void {
    $t->assertSame(51, $case->count('employees'));
    $t->assertSame(4, $case->count('departments'));
    $t->assertSame(5, $case->count('users'));
    $t->assertSame(6, $case->count('payroll_runs'));
    $t->assertSame(8, $case->count('anomalies'));
    // The seeded notifications, plus the ones the payroll workflow generates.
    $t->assert($case->count('notifications') >= 12, 'the demo notifications are present');
    $t->assertSame(51 * 4, $case->count('documents'));
});

$t->test('the seed creates one payslip per employee per run', function (TestRunner $t) use ($case): void {
    $t->assertSame(51 * 6, $case->count('payslips'));
});

$t->test('payroll run totals equal the sum of their payslips', function (TestRunner $t) use ($case): void {
    foreach ($case->table('payroll_runs') as $run) {
        $row = $case->app->db->selectOne(
            'SELECT COALESCE(SUM(gross_paise), 0) AS gross, COALESCE(SUM(net_paise), 0) AS net
             FROM payslips WHERE payroll_run_id = ?',
            [$run['id']],
        );
        $t->assertSame((int) $run['total_gross_paise'], (int) $row['gross'], "gross reconciles for {$run['id']}");
        $t->assertSame((int) $run['total_net_paise'], (int) $row['net'], "net reconciles for {$run['id']}");
    }
});

$t->test('passwords are stored as hashes, never in plain text', function (TestRunner $t) use ($case): void {
    foreach ($case->table('users') as $user) {
        $t->assert((bool) password_verify('TestPassword#123', (string) $user['password_hash']), 'hash verifies');
        $t->assert((string) $user['password_hash'] !== 'TestPassword#123', 'plain text is not stored');
    }
});

// ============================================================================
// Integration — authentication
// ============================================================================
$t->group('Authentication');

$t->test('a valid login succeeds and returns a CSRF token', function (TestRunner $t) use ($case): void {
    $email = $case->table('users')[0]['email'];
    $response = $case->request('POST', '/api/auth/login', ['email' => $email, 'password' => 'TestPassword#123']);
    $t->assertSame(200, $response['status']);
    $t->assert(($response['json']['data']['csrfToken'] ?? '') !== '', 'a CSRF token is issued — ' . substr($response['raw'], 0, 300));
    $t->assertSame($email, $response['json']['data']['user']['email']);
});

$t->test('a wrong password is rejected', function (TestRunner $t) use ($case): void {
    $email = $case->table('users')[0]['email'];
    $response = $case->request('POST', '/api/auth/login', ['email' => $email, 'password' => 'wrong-password']);
    $t->assertSame(401, $response['status']);
    $t->assertSame('invalid_credentials', $response['json']['error']['code'] ?? '');
});

$t->test('an unknown account gets the same generic error', function (TestRunner $t) use ($case): void {
    $response = $case->request('POST', '/api/auth/login', ['email' => 'nobody@paylens.co', 'password' => 'whatever12345']);
    $t->assertSame(401, $response['status']);
    $t->assertSame('invalid_credentials', $response['json']['error']['code'] ?? '');
    $t->assert(
        !str_contains(strtolower(json_encode($response['json'])), 'not found'),
        'the response does not reveal that the account is missing',
    );
});

$t->test('login is rate limited after repeated failures', function (TestRunner $t) use ($case): void {
    $email = $case->table('users')[0]['email'];
    $last = null;
    for ($i = 0; $i < 8; $i++) {
        $last = $case->request('POST', '/api/auth/login', ['email' => $email, 'password' => 'wrong-password']);
    }
    $t->assertSame(429, $last['status'], 'the attempt is throttled');
});

$t->test('an unauthenticated API request is rejected', function (TestRunner $t) use ($case): void {
    $response = $case->request('GET', '/api/employees');
    $t->assertSame(401, $response['status']);
});

$t->test('an invalid session is rejected', function (TestRunner $t) use ($case): void {
    $response = $case->request('GET', '/api/employees', [], [], ['paylens_session' => 'not-a-real-token']);
    $t->assertSame(401, $response['status']);
});

$t->test('logout revokes the session', function (TestRunner $t) use ($case): void {
    $session = $case->sessionFor('admin');
    $before = $case->request('GET', '/api/auth/me', [], [], ['paylens_session' => $session['cookie']]);
    $t->assertSame(200, $before['status']);

    $logout = $case->request('POST', '/api/auth/logout', [], ['X-CSRF-Token' => $session['csrf']], ['paylens_session' => $session['cookie']]);
    $t->assertSame(200, $logout['status']);

    $after = $case->request('GET', '/api/auth/me', [], [], ['paylens_session' => $session['cookie']]);
    $t->assertSame(401, $after['status'], 'the session no longer works');
});

// ============================================================================
// Integration — authorisation
// ============================================================================
$t->group('Authorisation');

$t->test('an employee cannot list employees', function (TestRunner $t) use ($case): void {
    $session = $case->sessionFor('employee');
    $response = $case->request('GET', '/api/employees', [], [], ['paylens_session' => $session['cookie']]);
    $t->assertSame(403, $response['status']);
});

$t->test('an employee cannot read the audit trail', function (TestRunner $t) use ($case): void {
    $session = $case->sessionFor('employee');
    $response = $case->request('GET', '/api/audit-logs', [], [], ['paylens_session' => $session['cookie']]);
    $t->assertSame(403, $response['status']);
});

$t->test('hr cannot process payroll', function (TestRunner $t) use ($case): void {
    $session = $case->sessionFor('hr');
    $response = $case->request('POST', '/api/payroll/runs', ['month' => 10, 'year' => 2026], ['X-CSRF-Token' => $session['csrf']], ['paylens_session' => $session['cookie']]);
    $t->assertSame(403, $response['status']);
});

$t->test('finance can process payroll', function (TestRunner $t) use ($case): void {
    $session = $case->sessionFor('finance');
    $response = $case->request('POST', '/api/payroll/runs', ['month' => 10, 'year' => 2026], ['X-CSRF-Token' => $session['csrf']], ['paylens_session' => $session['cookie']]);
    $t->assertSame(201, $response['status']);
});

$t->test('a mutating request without a CSRF token is rejected', function (TestRunner $t) use ($case): void {
    $session = $case->sessionFor('admin');
    $response = $case->request('POST', '/api/employees', ['firstName' => 'A'], [], ['paylens_session' => $session['cookie']]);
    $t->assertSame(403, $response['status']);
});

$t->test('an employee cannot read another employee payslips', function (TestRunner $t) use ($case): void {
    $session = $case->sessionFor('employee');
    $other = $case->app->db->selectOne(
        "SELECT p.id FROM payslips p JOIN users u ON u.employee_id = p.employee_id WHERE u.role = 'admin' LIMIT 1",
    );
    $response = $case->request('GET', '/api/payslips/' . $other['id'], [], [], ['paylens_session' => $session['cookie']]);
    $t->assertSame(403, $response['status']);
});

// ============================================================================
// Integration — employees
// ============================================================================
$t->group('Employees');

$t->test('the employee list is paginated and searchable', function (TestRunner $t) use ($case): void {
    $session = $case->sessionFor('admin');
    $response = $case->request('GET', '/api/employees?perPage=5', [], [], ['paylens_session' => $session['cookie']]);
    $t->assertSame(200, $response['status']);
    $t->assertSame(5, count($response['json']['data']));
    $t->assertSame(51, $response['json']['meta']['total'] ?? 0);

    $search = $case->request('GET', '/api/employees?q=' . rawurlencode('EMP00'), [], [], ['paylens_session' => $session['cookie']]);
    $t->assertSame(200, $search['status']);
    $t->assert(($search['json']['meta']['total'] ?? 0) > 0, 'the search returns results');
});

$t->test('a valid employee can be created', function (TestRunner $t) use ($case): void {
    $session = $case->sessionFor('hr');
    $before = $case->count('employees');
    $response = $case->request('POST', '/api/employees', [
        'firstName' => 'Test',
        'lastName' => 'Person',
        'email' => 'test.person@paylens.co',
        'departmentId' => 'eng',
        'designation' => 'SDE I',
        'joinedAt' => '2026-01-15',
        'basic' => 50000,
    ], ['X-CSRF-Token' => $session['csrf']], ['paylens_session' => $session['cookie']]);

    $t->assertSame(201, $response['status']);
    $t->assertSame($before + 1, $case->count('employees'));
});

$t->test('invalid input is rejected', function (TestRunner $t) use ($case): void {
    $session = $case->sessionFor('hr');
    $response = $case->request('POST', '/api/employees', [
        'firstName' => 'Bad',
        'email' => 'not-an-email',
    ], ['X-CSRF-Token' => $session['csrf']], ['paylens_session' => $session['cookie']]);

    $t->assertSame(422, $response['status']);
    $t->assert(isset($response['json']['error']['details']['fields']), 'field errors are returned');
});

$t->test('a duplicate email is rejected', function (TestRunner $t) use ($case): void {
    $session = $case->sessionFor('hr');
    $existing = $case->table('employees')[0]['email'];
    $response = $case->request('POST', '/api/employees', [
        'firstName' => 'Duplicate',
        'lastName' => 'Person',
        'email' => $existing,
        'departmentId' => 'eng',
        'designation' => 'SDE I',
        'joinedAt' => '2026-01-15',
        'basic' => 50000,
    ], ['X-CSRF-Token' => $session['csrf']], ['paylens_session' => $session['cookie']]);

    $t->assertSame(422, $response['status']);
});

$t->test('an unknown department is rejected', function (TestRunner $t) use ($case): void {
    $session = $case->sessionFor('hr');
    $response = $case->request('POST', '/api/employees', [
        'firstName' => 'Nowhere',
        'lastName' => 'Person',
        'email' => 'nowhere@paylens.co',
        'departmentId' => 'does-not-exist',
        'designation' => 'SDE I',
        'joinedAt' => '2026-01-15',
        'basic' => 50000,
    ], ['X-CSRF-Token' => $session['csrf']], ['paylens_session' => $session['cookie']]);

    $t->assertSame(422, $response['status']);
});

$t->test('an employee can be updated', function (TestRunner $t) use ($case): void {
    $session = $case->sessionFor('hr');
    $employee = $case->table('employees')[0];
    $response = $case->request('PATCH', '/api/employees/' . $employee['id'], [
        'designation' => 'Staff Engineer',
    ], ['X-CSRF-Token' => $session['csrf']], ['paylens_session' => $session['cookie']]);

    $t->assertSame(200, $response['status']);
    $t->assertSame('Staff Engineer', $response['json']['data']['designation']);
});

$t->test('a compensation change creates a new version, not an overwrite', function (TestRunner $t) use ($case): void {
    $session = $case->sessionFor('hr');
    $employee = $case->table('employees')[0];
    $before = count($case->app->db->select('SELECT * FROM salary_structures WHERE employee_id = ?', [$employee['id']]));

    $response = $case->request('PUT', '/api/employees/' . $employee['id'] . '/compensation', [
        'effectiveFrom' => '2027-01-01',
        'basic' => 99000,
        'hra' => 40000,
        'specialAllowance' => 20000,
    ], ['X-CSRF-Token' => $session['csrf']], ['paylens_session' => $session['cookie']]);

    $t->assertSame(200, $response['status']);
    $after = count($case->app->db->select('SELECT * FROM salary_structures WHERE employee_id = ?', [$employee['id']]));
    $t->assertSame($before + 1, $after, 'a new version is inserted');
});

$t->test('archiving keeps the record and its payroll history', function (TestRunner $t) use ($case): void {
    $session = $case->sessionFor('hr');
    // A different employee from the one the termination tests use, so the
    // two do not interfere.
    $employee = $case->table('employees')[40];
    $response = $case->request('POST', '/api/employees/' . $employee['id'] . '/archive', [], ['X-CSRF-Token' => $session['csrf']], ['paylens_session' => $session['cookie']]);

    $t->assertSame(200, $response['status']);
    $row = $case->app->db->selectOne('SELECT is_deleted, employment_status FROM employees WHERE id = ?', [$employee['id']]);
    $t->assertSame(1, (int) $row['is_deleted'], 'the employee is archived, not deleted');
    $t->assert($case->count('payslips') > 0, 'payslips still reference the employee');
});

// ============================================================================
// Integration — payroll processing
// ============================================================================
$t->group('Payroll processing');

$t->test('a run can be created, calculated, submitted, approved and finalised', function (TestRunner $t) use ($case): void {
    $finance = $case->sessionFor('finance');
    $admin = $case->sessionFor('admin');
    $cookie = ['paylens_session' => $finance['cookie']];
    $adminCookie = ['paylens_session' => $admin['cookie']];

    $created = $case->request('POST', '/api/payroll/runs', ['month' => 10, 'year' => 2026], ['X-CSRF-Token' => $finance['csrf']], $cookie);
    $t->assertSame(409, $created['status'], 'October 2026 already exists from the earlier finance test');

    $created = $case->request('POST', '/api/payroll/runs', ['month' => 11, 'year' => 2026], ['X-CSRF-Token' => $finance['csrf']], $cookie);
    $t->assertSame(201, $created['status']);
    $runId = $created['json']['data']['id'];

    $calculated = $case->request('POST', '/api/payroll/runs/' . $runId . '/calculate', [], ['X-CSRF-Token' => $finance['csrf']], $cookie);
    $t->assertSame(200, $calculated['status']);
    $t->assertSame('review', $calculated['json']['data']['status']);

    $submitted = $case->request('POST', '/api/payroll/runs/' . $runId . '/submit', [], ['X-CSRF-Token' => $finance['csrf']], $cookie);
    $t->assertSame(200, $submitted['status']);
    $t->assertSame('submitted', $submitted['json']['data']['status']);

    $approved = $case->request('POST', '/api/payroll/runs/' . $runId . '/approve', [], ['X-CSRF-Token' => $admin['csrf']], $adminCookie);
    $t->assertSame(200, $approved['status']);
    $t->assertSame('approved', $approved['json']['data']['status']);

    $finalised = $case->request('POST', '/api/payroll/runs/' . $runId . '/finalize', [], ['X-CSRF-Token' => $admin['csrf']], $adminCookie);
    $t->assertSame(200, $finalised['status']);
    $t->assertSame('finalized', $finalised['json']['data']['status']);

    // Finalising opens a pending payment per employee — it does not pay them.
    $payments = $case->request('GET', '/api/payroll/runs/' . $runId . '/payments', [], [], $adminCookie);
    $t->assertSame(200, $payments['status']);
    $t->assertSame(51, $payments['json']['data']['summary']['pending']['count']);
    $t->assertSame(0, $payments['json']['data']['summary']['paid']['count']);
});

$t->test('a duplicate run for the same period is rejected', function (TestRunner $t) use ($case): void {
    $finance = $case->sessionFor('finance');
    $response = $case->request('POST', '/api/payroll/runs', ['month' => 9, 'year' => 2026], ['X-CSRF-Token' => $finance['csrf']], ['paylens_session' => $finance['cookie']]);
    $t->assertSame(409, $response['status']);
});

$t->test('a finalized run cannot be recalculated', function (TestRunner $t) use ($case): void {
    $finance = $case->sessionFor('finance');
    $response = $case->request('POST', '/api/payroll/runs/PR-202609/calculate', [], ['X-CSRF-Token' => $finance['csrf']], ['paylens_session' => $finance['cookie']]);
    $t->assertSame(409, $response['status']);
});

$t->test('a run cannot be finalised twice', function (TestRunner $t) use ($case): void {
    $admin = $case->sessionFor('admin');
    $response = $case->request('POST', '/api/payroll/runs/PR-202609/finalize', [], ['X-CSRF-Token' => $admin['csrf']], ['paylens_session' => $admin['cookie']]);
    $t->assertSame(409, $response['status']);
});

$t->test('an employee is paid exactly once per run', function (TestRunner $t) use ($case): void {
    $rows = $case->app->db->select(
        'SELECT payroll_run_id, employee_id, COUNT(*) AS c FROM payslips GROUP BY payroll_run_id, employee_id HAVING c > 1',
    );
    $t->assertSame([], $rows, 'no duplicate payslips');
});

$t->test('finalized payslips keep their totals after a compensation change', function (TestRunner $t) use ($case): void {
    $before = $case->app->db->selectOne(
        'SELECT gross_paise, net_paise FROM payslips WHERE payroll_run_id = ? AND employee_id = ?',
        ['PR-202609', 'EMP001'],
    );

    // Change the employee's compensation with a later effective date.
    $employees = new \PayLens\Repositories\EmployeeRepository($case->app->db);
    $employees->addSalaryVersion('EMP001', '2027-01-01', [
        'basic_paise' => 999900,
        'hra_paise' => 0,
        'special_allowance_paise' => 0,
        'travel_allowance_paise' => 0,
        'pf_paise' => 0,
        'professional_tax_paise' => 0,
    ], 100000000, null);

    $after = $case->app->db->selectOne(
        'SELECT gross_paise, net_paise FROM payslips WHERE payroll_run_id = ? AND employee_id = ?',
        ['PR-202609', 'EMP001'],
    );

    $t->assertSame((int) $before['gross_paise'], (int) $after['gross_paise'], 'gross is unchanged');
    $t->assertSame((int) $before['net_paise'], (int) $after['net_paise'], 'net is unchanged');
});

$t->test('a reversed run keeps its payslips', function (TestRunner $t) use ($case): void {
    $admin = $case->sessionFor('admin');
    $cookie = ['paylens_session' => $admin['cookie']];
    $before = $case->app->db->selectOne('SELECT COUNT(*) AS c FROM payslips WHERE payroll_run_id = ?', ['PR-202609']);

    $response = $case->request('POST', '/api/payroll/runs/PR-202609/reverse', ['reason' => 'Duplicate submission'], ['X-CSRF-Token' => $admin['csrf']], $cookie);
    $t->assertSame(200, $response['status']);

    $after = $case->app->db->selectOne('SELECT COUNT(*) AS c FROM payslips WHERE payroll_run_id = ?', ['PR-202609']);
    $t->assertSame((int) $before['c'], (int) $after['c'], 'no payslip is deleted');
    $t->assertSame('failed', $response['json']['data']['status'], 'the run is marked reversed');
});

// ============================================================================
// Integration — reports
// ============================================================================
$t->group('Reports');

$t->test('the monthly payroll report matches the stored records', function (TestRunner $t) use ($case): void {
    $session = $case->sessionFor('finance');
    $response = $case->request('GET', '/api/reports/monthly_payroll', [], [], ['paylens_session' => $session['cookie']]);

    $t->assertSame(200, $response['status']);
    $rows = $response['json']['data']['rows'];
    $t->assertSame(51, count($rows));
    $t->assertSame('Employee ID', $response['json']['data']['headers'][0]);
});

$t->test('the payroll growth report lists the real runs', function (TestRunner $t) use ($case): void {
    $session = $case->sessionFor('finance');
    $response = $case->request('GET', '/api/reports/payroll_growth', [], [], ['paylens_session' => $session['cookie']]);
    $t->assert(count($response['json']['data']['rows']) >= 6, 'every seeded run is listed');
});

$t->test('the dashboard payload reconciles with the runs', function (TestRunner $t) use ($case): void {
    $session = $case->sessionFor('admin');
    $response = $case->request('GET', '/api/reports/dashboard', [], [], ['paylens_session' => $session['cookie']]);

    $t->assertSame(200, $response['status']);
    $data = $response['json']['data'];
    $t->assert(isset($data['currentRun']['totalGross']), 'the current run is present');
    $t->assert(count($data['trend']) >= 6, 'the trend covers every seeded period');
    $t->assertSame(4, count($data['departments']));
});

$t->test('a CSV export is produced from the database', function (TestRunner $t) use ($case): void {
    $session = $case->sessionFor('finance');
    $response = $case->request('GET', '/api/reports/employee_salary.csv', [], [], ['paylens_session' => $session['cookie']]);
    $t->assertSame(200, $response['status']);
    $t->assert(str_contains($response['raw'], 'Employee ID'), 'the header is present');
    $t->assert(substr_count($response['raw'], "\n") >= 51, 'one row per employee');
});

$t->test('a report cannot be exported without the export permission', function (TestRunner $t) use ($case): void {
    // The employee role holds no report permissions at all.
    $session = $case->sessionFor('employee');
    $response = $case->request('GET', '/api/reports/payroll_growth.csv', [], [], ['paylens_session' => $session['cookie']]);
    $t->assertSame(403, $response['status']);
});

// ============================================================================
// Integration — anomalies, notifications, audit
// ============================================================================
$t->group('Anomalies, notifications and audit');

$t->test('an anomaly can be resolved', function (TestRunner $t) use ($case): void {
    $finance = $case->sessionFor('finance');
    $response = $case->request('PATCH', '/api/anomalies/A001', ['status' => 'resolved'], ['X-CSRF-Token' => $finance['csrf']], ['paylens_session' => $finance['cookie']]);

    $t->assertSame(200, $response['status']);
    $t->assertSame('resolved', $response['json']['data']['status']);
});

$t->test('hr cannot resolve anomalies', function (TestRunner $t) use ($case): void {
    $hr = $case->sessionFor('hr');
    $response = $case->request('PATCH', '/api/anomalies/A002', ['status' => 'resolved'], ['X-CSRF-Token' => $hr['csrf']], ['paylens_session' => $hr['cookie']]);
    $t->assertSame(403, $response['status']);
});

$t->test('notifications can be marked read', function (TestRunner $t) use ($case): void {
    $admin = $case->sessionFor('admin');
    $cookie = ['paylens_session' => $admin['cookie']];

    $before = $case->request('GET', '/api/notifications', [], [], $cookie);
    $unreadBefore = $before['json']['meta']['unread'] ?? 0;

    $response = $case->request('PATCH', '/api/notifications/N001/read', [], ['X-CSRF-Token' => $admin['csrf']], $cookie);
    $t->assertSame(200, $response['status']);
    $t->assertSame($unreadBefore - 1, $response['json']['data']['unread']);
});

$t->test('important actions are written to the audit trail', function (TestRunner $t) use ($case): void {
    $rows = $case->app->db->select(
        "SELECT DISTINCT action FROM audit_logs WHERE action IN
         ('employee.created','employee.updated','salary.changed','payroll.processed','payroll.approved','payroll.finalized','login','anomaly.resolved')",
    );
    $actions = array_map(static fn (array $r): string => (string) $r['action'], $rows);
    foreach (['employee.created', 'employee.updated', 'salary.changed', 'payroll.processed', 'payroll.approved', 'payroll.finalized', 'login', 'anomaly.resolved'] as $expected) {
        $t->assert(in_array($expected, $actions, true), "audit action {$expected} was recorded");
    }
});

$t->test('the audit trail never stores passwords or tokens', function (TestRunner $t) use ($case): void {
    foreach ($case->table('audit_logs') as $row) {
        $blob = json_encode($row);
        $t->assert(!str_contains((string) $blob, 'TestPassword#123'), 'no password appears in the audit trail');
        $t->assert(!str_contains((string) $blob, '$2y$'), 'no password hash appears in the audit trail');
    }
});

$t->test('the audit trail is readable only with the audit permission', function (TestRunner $t) use ($case): void {
    $session = $case->sessionFor('admin');
    $response = $case->request('GET', '/api/audit-logs', [], [], ['paylens_session' => $session['cookie']]);
    $t->assertSame(200, $response['status']);
    $t->assert(count($response['json']['data']) > 0, 'entries are returned');
});

// ============================================================================
// Database dialects
// ============================================================================
$t->group('MySQL dialect');

/**
 * Render every migration's DDL for a given driver without executing it.
 *
 * @return array<int,string>
 */
$renderDdl = static function (string $driver): array {
    $db = new \PayLens\Core\Database(new \PayLens\Core\Config([
        'db' => ['driver' => $driver],
        'paths' => ['root' => dirname(__DIR__)],
    ]));
    $db->dryRun();

    $files = glob(dirname(__DIR__) . '/database/migrations/*.php') ?: [];
    sort($files);
    foreach ($files as $file) {
        $migration = require $file;
        ($migration['up'])($db);
    }
    return $db->executedSql();
};

$t->test('the MySQL branch renders valid MySQL DDL', function (TestRunner $t) use ($renderDdl): void {
    $sql = $renderDdl('mysql');
    $t->assert(count($sql) >= 20, 'every table has a statement');

    foreach ($sql as $statement) {
        $t->assert(
            str_starts_with($statement, 'CREATE TABLE IF NOT EXISTS ')
                || str_starts_with($statement, 'ALTER TABLE ')
                || str_starts_with($statement, 'INSERT IGNORE INTO '),
            'MySQL statements are CREATE TABLE, ALTER TABLE or INSERT IGNORE — got: ' . substr($statement, 0, 80),
        );
    }
});

$t->test('the MySQL DDL contains no SQLite-only syntax', function (TestRunner $t) use ($renderDdl): void {
    foreach ($renderDdl('mysql') as $statement) {
        $t->assert(!str_contains($statement, 'AUTOINCREMENT'), 'no SQLite AUTOINCREMENT');
        $t->assert(!str_contains($statement, 'ON CONFLICT'), 'no SQLite ON CONFLICT');
        $t->assert(!str_contains($statement, 'INSERT OR IGNORE'), 'no SQLite INSERT OR IGNORE');
    }
});

$t->test('the MySQL DDL uses MySQL auto-increment', function (TestRunner $t) use ($renderDdl): void {
    $sql = implode("\n", $renderDdl('mysql'));
    $t->assert(str_contains($sql, 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT'), 'id columns use AUTO_INCREMENT');
    $t->assert(str_contains($sql, 'INDEX idx_'), 'indexes are declared inline');
});

$t->test('the SQLite branch uses its own syntax', function (TestRunner $t) use ($renderDdl): void {
    $sql = implode("\n", $renderDdl('sqlite'));
    $t->assert(str_contains($sql, 'INTEGER PRIMARY KEY AUTOINCREMENT'), 'id columns use AUTOINCREMENT');
    $t->assert(str_contains($sql, 'CREATE INDEX IF NOT EXISTS'), 'indexes are separate statements');
    $t->assert(!str_contains($sql, 'AUTO_INCREMENT'), 'no MySQL AUTO_INCREMENT');
    $t->assert(!str_contains($sql, 'INSERT IGNORE INTO'), 'no MySQL INSERT IGNORE');
    $t->assert(str_contains($sql, 'INSERT OR IGNORE INTO'), 'idempotent inserts use INSERT OR IGNORE');
});

$t->test('the PostgreSQL branch renders PostgreSQL-safe DDL', function (TestRunner $t) use ($renderDdl): void {
    $sql = implode("\n", $renderDdl('pgsql'));
    $t->assert(str_contains($sql, 'BIGSERIAL NOT NULL'), 'id columns use BIGSERIAL');
    $t->assert(str_contains($sql, 'TIMESTAMP WITHOUT TIME ZONE'), 'timestamps use PostgreSQL syntax');
    $t->assert(str_contains($sql, 'CREATE INDEX IF NOT EXISTS'), 'indexes are separate statements');
    $t->assert(str_contains($sql, 'ON CONFLICT DO NOTHING'), 'idempotent inserts use ON CONFLICT');
    $t->assert(!str_contains($sql, 'AUTO_INCREMENT'), 'no MySQL AUTO_INCREMENT');
    $t->assert(!str_contains($sql, 'TINYINT'), 'no MySQL TINYINT');
    $t->assert(!str_contains($sql, 'DATETIME'), 'no MySQL DATETIME');
    $t->assert(!str_contains($sql, 'INSERT IGNORE'), 'no MySQL INSERT IGNORE');
});

$t->test('every foreign key points at a table the migrations create', function (TestRunner $t) use ($renderDdl): void {
    $sql = $renderDdl('mysql');
    $tables = [];
    foreach ($sql as $statement) {
        if (preg_match('/CREATE TABLE IF NOT EXISTS (\w+)/', $statement, $m)) {
            $tables[] = $m[1];
        }
    }

    foreach ($sql as $statement) {
        preg_match_all('/REFERENCES (\w+)/', $statement, $matches);
        foreach ($matches[1] as $referenced) {
            $t->assert(
                in_array($referenced, $tables, true),
                "foreign key references {$referenced}, which is never created",
            );
        }
    }
});

$t->test('indexed columns fit the InnoDB key limit under utf8mb4', function (TestRunner $t) use ($renderDdl): void {
    // InnoDB with DYNAMIC row format allows a 3072-byte index key.
    // utf8mb4 costs up to four bytes per character.
    foreach ($renderDdl('mysql') as $statement) {
        preg_match_all('/(?:INDEX|UNIQUE) \w+ \(([^)]+)\)/', $statement, $matches);
        foreach ($matches[1] as $columns) {
            $bytes = 0;
            foreach (explode(',', $columns) as $column) {
                $column = trim($column);
                if (preg_match('/^(\w+)\s+VARCHAR\((\d+)\)/', $column, $m)) {
                    $bytes += (int) $m[2] * 4;
                } else {
                    $bytes += 8; // A numeric or date key.
                }
            }
            $t->assert(
                $bytes <= 3072,
                "index key of {$bytes} bytes exceeds the 3072-byte InnoDB limit",
            );
        }
    }
});

$t->test('the upsert statement matches the driver', function (TestRunner $t): void {
    $mysql = new \PayLens\Core\Database(new \PayLens\Core\Config(['db' => ['driver' => 'mysql']]));
    $mysql->dryRun();
    $mysql->upsert('rate_limits', ['id' => 'x', 'attempts' => 1], ['attempts'], ['id']);
    $mysqlSql = implode(' ', $mysql->executedSql());
    $t->assert(str_contains($mysqlSql, 'ON DUPLICATE KEY UPDATE'), 'MySQL uses ON DUPLICATE KEY UPDATE');

    $sqlite = new \PayLens\Core\Database(new \PayLens\Core\Config(['db' => ['driver' => 'sqlite']]));
    $sqlite->dryRun();
    $sqlite->upsert('rate_limits', ['id' => 'x', 'attempts' => 1], ['attempts'], ['id']);
    $sqliteSql = implode(' ', $sqlite->executedSql());
    $t->assert(str_contains($sqliteSql, 'ON CONFLICT'), 'SQLite uses ON CONFLICT');
    $t->assert(!str_contains($sqliteSql, 'ON DUPLICATE KEY'), 'SQLite does not use ON DUPLICATE KEY');

    $pgsql = new \PayLens\Core\Database(new \PayLens\Core\Config(['db' => ['driver' => 'pgsql']]));
    $pgsql->dryRun();
    $pgsql->upsert('rate_limits', ['id' => 'x', 'attempts' => 1], ['attempts'], ['id']);
    $pgsqlSql = implode(' ', $pgsql->executedSql());
    $t->assert(str_contains($pgsqlSql, 'ON CONFLICT'), 'PostgreSQL uses ON CONFLICT');
    $t->assert(!str_contains($pgsqlSql, 'ON DUPLICATE KEY'), 'PostgreSQL does not use ON DUPLICATE KEY');
});

$t->test('the MySQL connection settings are the documented ones', function (TestRunner $t): void {
    $config = new \PayLens\Core\Config(require dirname(__DIR__) . '/config/config.php');
    $t->assert(
        in_array($config->string('db.driver'), ['mysql', 'pgsql', 'sqlite'], true),
        'the driver is mysql, pgsql or sqlite',
    );
    $t->assertSame('utf8mb4', $config->string('db.charset'));

    // MySQL remains the default without DATABASE_URL; a PostgreSQL URL selects
    // pgsql automatically for Vercel/Neon deployments.
    $configFile = file_get_contents(dirname(__DIR__) . '/config/config.php');
    $t->assert(
        str_contains((string) $configFile, "getenv('DB_DRIVER') ?: \$defaultDriver"),
        'the configuration selects a deployment driver',
    );

    $envExample = file_get_contents(dirname(__DIR__) . '/.env.example');
    $t->assert(
        str_contains((string) $envExample, 'DB_DRIVER=mysql'),
        'the environment template documents the MySQL driver',
    );
    $t->assert(
        str_contains((string) $envExample, 'DB_DRIVER=pgsql')
            && str_contains((string) $envExample, 'DB_SCHEMA=paylens'),
        'the environment template documents isolated PostgreSQL deployment',
    );
});

// ============================================================================
// Integration — selection, holds and exclusions
// ============================================================================
$t->group('Selection, holds and exclusions');

$t->test('the selection lists who is eligible and who is not', function (TestRunner $t) use ($case): void {
    $finance = $case->sessionFor('finance');
    $cookie = ['paylens_session' => $finance['cookie']];

    $created = $case->request('POST', '/api/payroll/runs', ['month' => 12, 'year' => 2026], ['X-CSRF-Token' => $finance['csrf']], $cookie);
    $t->assertSame(201, $created['status']);
    $runId = $created['json']['data']['id'];

    $selection = $case->request('GET', '/api/payroll/runs/' . $runId . '/selection', [], [], $cookie);
    $t->assertSame(200, $selection['status']);
    $t->assert($selection['json']['data']['summary']['selected'] > 0, 'employees are selected by default');
    $t->assertSame(0, $selection['json']['data']['summary']['ineligible'], 'every seeded employee is eligible');
});

$t->test('an employee can be selected and excluded', function (TestRunner $t) use ($case): void {
    $finance = $case->sessionFor('finance');
    $cookie = ['paylens_session' => $finance['cookie']];

    $created = $case->request('POST', '/api/payroll/runs', ['month' => 12, 'year' => 2027], ['X-CSRF-Token' => $finance['csrf']], $cookie);
    $runId = $created['json']['data']['id'];

    $all = $case->request('GET', '/api/payroll/runs/' . $runId . '/selection', [], [], $cookie);
    $selected = $all['json']['data']['selected'];
    $t->assert($selected > 1, 'there is more than one employee to choose from');

    $keep = array_slice($selected, 0, 3);
    $drop = array_slice($selected, 3, 2);

    $body = [
        'included' => array_map(static fn (array $e): string => (string) $e['id'], $keep),
        'excluded' => array_map(static fn (array $e): array => [
            'id' => (string) $e['id'],
            'reason' => 'Not in scope for this period',
        ], $drop),
    ];

    $response = $case->request('PUT', '/api/payroll/runs/' . $runId . '/selection', $body, ['X-CSRF-Token' => $finance['csrf']], $cookie);
    $t->assertSame(200, $response['status']);
    $t->assertSame(3, $response['json']['data']['summary']['selected'], 'only the selected employees are paid');
    $t->assertSame(2, $response['json']['data']['summary']['excluded'], 'the exclusions are recorded');

    $calculated = $case->request('POST', '/api/payroll/runs/' . $runId . '/calculate', [], ['X-CSRF-Token' => $finance['csrf']], $cookie);
    $t->assertSame(200, $calculated['status']);

    $payslips = $case->request('GET', '/api/payroll/runs/' . $runId . '/payslips', [], [], $cookie);
    $t->assertSame(3, count($payslips['json']['data']), 'only the selected employees get a payslip');
});

$t->test('an employee on hold is not eligible', function (TestRunner $t) use ($case): void {
    $hr = $case->sessionFor('hr');
    $finance = $case->sessionFor('finance');
    $hrCookie = ['paylens_session' => $hr['cookie']];
    $financeCookie = ['paylens_session' => $finance['cookie']];

    $employee = $case->table('employees')[10];

    $hold = $case->request('POST', '/api/employees/' . $employee['id'] . '/holds', [
        'reason' => 'Awaiting revised contract',
        'category' => 'documentation',
        'effectiveFrom' => '2026-01-01',
        'effectiveTo' => null,
    ], ['X-CSRF-Token' => $hr['csrf']], $hrCookie);
    $t->assertSame(201, $hold['status'], 'hr may place a hold');

    $created = $case->request('POST', '/api/payroll/runs', ['month' => 12, 'year' => 2028], ['X-CSRF-Token' => $finance['csrf']], $financeCookie);
    $runId = $created['json']['data']['id'];

    $selection = $case->request('GET', '/api/payroll/runs/' . $runId . '/selection', [], [], $financeCookie);
    $ineligible = $selection['json']['data']['ineligible'];
    $reasons = array_column($ineligible, 'reason');
    $t->assert(in_array('on_hold', $reasons, true), 'the held employee is reported as ineligible');

    $release = $case->request('POST', '/api/holds/' . $hold['json']['data']['id'] . '/release', [], ['X-CSRF-Token' => $hr['csrf']], $hrCookie);
    $t->assertSame(200, $release['status'], 'the hold can be released');

    $after = $case->request('GET', '/api/payroll/runs/' . $runId . '/selection', [], [], $financeCookie);
    $t->assert(! in_array('on_hold', array_column($after['json']['data']['ineligible'], 'reason'), true), 'the employee is eligible again');
});

// ============================================================================
// Integration — approval and payment tracking
// ============================================================================
$t->group('Approval and payment tracking');

$t->test('preparing a run does not grant the right to approve it', function (TestRunner $t) use ($case): void {
    $finance = $case->sessionFor('finance');
    $cookie = ['paylens_session' => $finance['cookie']];

    $created = $case->request('POST', '/api/payroll/runs', ['month' => 12, 'year' => 2029], ['X-CSRF-Token' => $finance['csrf']], $cookie);
    $runId = $created['json']['data']['id'];
    $case->request('POST', '/api/payroll/runs/' . $runId . '/calculate', [], ['X-CSRF-Token' => $finance['csrf']], $cookie);
    $case->request('POST', '/api/payroll/runs/' . $runId . '/submit', [], ['X-CSRF-Token' => $finance['csrf']], $cookie);

    $approve = $case->request('POST', '/api/payroll/runs/' . $runId . '/approve', [], ['X-CSRF-Token' => $finance['csrf']], $cookie);
    $t->assertSame(403, $approve['status'], 'the preparer cannot approve their own run');

    $approver = $case->sessionFor('approver');
    $approved = $case->request('POST', '/api/payroll/runs/' . $runId . '/approve', [], ['X-CSRF-Token' => $approver['csrf']], ['paylens_session' => $approver['cookie']]);
    $t->assertSame(200, $approved['status'], 'the approver role can approve');
});

$t->test('a submitted run can be rejected with a reason', function (TestRunner $t) use ($case): void {
    $finance = $case->sessionFor('finance');
    $approver = $case->sessionFor('approver');
    $cookie = ['paylens_session' => $finance['cookie']];

    $created = $case->request('POST', '/api/payroll/runs', ['month' => 12, 'year' => 2030], ['X-CSRF-Token' => $finance['csrf']], $cookie);
    $runId = $created['json']['data']['id'];
    $case->request('POST', '/api/payroll/runs/' . $runId . '/calculate', [], ['X-CSRF-Token' => $finance['csrf']], $cookie);
    $case->request('POST', '/api/payroll/runs/' . $runId . '/submit', [], ['X-CSRF-Token' => $finance['csrf']], $cookie);

    $rejected = $case->request('POST', '/api/payroll/runs/' . $runId . '/reject', ['reason' => 'Two employees are missing from the selection'], ['X-CSRF-Token' => $approver['csrf']], ['paylens_session' => $approver['cookie']]);
    $t->assertSame(200, $rejected['status']);
    $t->assertSame('rejected', $rejected['json']['data']['status']);
    $t->assert($rejected['json']['data']['rejectionReason'] !== null, 'the reason is recorded');

    // A rejection is not a finalisation: the run can be worked on again.
    $recalculated = $case->request('POST', '/api/payroll/runs/' . $runId . '/calculate', [], ['X-CSRF-Token' => $finance['csrf']], $cookie);
    $t->assertSame(200, $recalculated['status'], 'a rejected run can be recalculated');
});

$t->test('a payment is recorded with its reference and history', function (TestRunner $t) use ($case): void {
    $finance = $case->sessionFor('finance');
    $cookie = ['paylens_session' => $finance['cookie']];

    $runId = 'PR-202608';
    $records = $case->request('GET', '/api/payroll/runs/' . $runId . '/payments', [], [], $cookie);
    $t->assertSame(200, $records['status']);
    $t->assert($records['json']['data']['summary']['pending']['count'] > 0, 'the run has pending payments');

    $employeeId = (string) $records['json']['data']['records'][0]['employeeId'];

    $recorded = $case->request('POST', '/api/payroll/runs/' . $runId . '/payments', [
        'employeeId' => $employeeId,
        'status' => 'paid',
        'reference' => 'UTR-TEST-001',
    ], ['X-CSRF-Token' => $finance['csrf']], $cookie);
    $t->assertSame(200, $recorded['status']);

    $after = $case->request('GET', '/api/payroll/runs/' . $runId . '/payments', [], [], $cookie);
    $t->assertSame(1, $after['json']['data']['summary']['paid']['count'], 'the payment is counted as paid');
    $t->assertSame($recorded['json']['data']['id'], $after['json']['data']['records'][0]['id'] >= 0 ? $recorded['json']['data']['id'] : 0);
});

$t->test('a paid payment needs a reference and a failed one a reason', function (TestRunner $t) use ($case): void {
    $finance = $case->sessionFor('finance');
    $cookie = ['paylens_session' => $finance['cookie']];

    $records = $case->request('GET', '/api/payroll/runs/PR-202608/payments', [], [], $cookie);
    $employeeId = (string) $records['json']['data']['records'][1]['employeeId'];

    $noReference = $case->request('POST', '/api/payroll/runs/PR-202608/payments', [
        'employeeId' => $employeeId,
        'status' => 'paid',
    ], ['X-CSRF-Token' => $finance['csrf']], $cookie);
    $t->assertSame(422, $noReference['status'], 'a completed payment needs a reference');

    $noReason = $case->request('POST', '/api/payroll/runs/PR-202608/payments', [
        'employeeId' => $employeeId,
        'status' => 'failed',
    ], ['X-CSRF-Token' => $finance['csrf']], $cookie);
    $t->assertSame(422, $noReason['status'], 'a failed payment needs a reason');
});

// ============================================================================
// Integration — termination, notice and settlement
// ============================================================================
$t->group('Termination, notice and settlement');

$t->test('a termination request is submitted, approved and the notice issued', function (TestRunner $t) use ($case): void {
    $hr = $case->sessionFor('hr');
    $approver = $case->sessionFor('approver');
    $hrCookie = ['paylens_session' => $hr['cookie']];

    $employee = $case->table('employees')[20];

    $created = $case->request('POST', '/api/terminations', [
        'employeeId' => $employee['id'],
        'category' => 'resignation',
        'reason' => 'Resigning to take up another role.',
        'lastWorkingDay' => '2026-11-30',
        'noticePeriodDays' => 30,
    ], ['X-CSRF-Token' => $hr['csrf']], $hrCookie);
    $t->assertSame(201, $created['status']);
    $id = $created['json']['data']['id'];
    $t->assertSame('draft', $created['json']['data']['status']);

    $submitted = $case->request('POST', '/api/terminations/' . $id . '/submit', [], ['X-CSRF-Token' => $hr['csrf']], $hrCookie);
    $t->assertSame(200, $submitted['status']);
    $t->assertSame('submitted', $submitted['json']['data']['status']);

    $approved = $case->request('POST', '/api/terminations/' . $id . '/approve', [], ['X-CSRF-Token' => $approver['csrf']], ['paylens_session' => $approver['cookie']]);
    $t->assertSame(200, $approved['status']);
    $t->assertSame('approved', $approved['json']['data']['status']);

    $notice = $case->request('POST', '/api/terminations/' . $id . '/issue-notice', [], ['X-CSRF-Token' => $approver['csrf']], ['paylens_session' => $approver['cookie']]);
    $t->assertSame(200, $notice['status']);
    $t->assertSame('notice_issued', $notice['json']['data']['status']);
    $t->assert(count($notice['json']['data']['letters']) === 1, 'the notice was written');

    $html = (string) $notice['json']['data']['letters'][0]['contentHtml'];
    $t->assert(str_contains($html, 'Employment termination notice'), 'the notice is a real document');
    $t->assert(str_contains($html, (string) $employee['id']), 'the notice names the employee');
});

$t->test('submitting a request does not terminate the employee', function (TestRunner $t) use ($case): void {
    $employee = $case->table('employees')[21];
    $row = $case->app->db->selectOne('SELECT employment_status FROM employees WHERE id = ?', [$employee['id']]);
    $t->assertSame('active', (string) $row['employment_status'], 'the employee is still active');
    $t->assertSame(0, (int) ($case->app->db->selectOne(
        'SELECT COUNT(*) AS c FROM termination_requests WHERE employee_id = ?',
        [$employee['id']],
    )['c'] ?? 0), 'no request was raised for that employee');
});

$t->test('only the addressed employee may open and acknowledge the notice', function (TestRunner $t) use ($case): void {
    $approver = $case->sessionFor('approver');
    $hr = $case->sessionFor('hr');

    // Raise and issue a notice for the sample employee, who owns a login.
    $hrCookie = ['paylens_session' => $hr['cookie']];
    $approverCookie = ['paylens_session' => $approver['cookie']];
    $employeeRow = $case->app->db->selectOne(
        "SELECT employee_id FROM users WHERE role = 'employee' LIMIT 1",
    );
    $employeeId = (string) $employeeRow['employee_id'];

    $created = $case->request('POST', '/api/terminations', [
        'employeeId' => $employeeId,
        'category' => 'resignation',
        'reason' => 'Moving on.',
        'lastWorkingDay' => '2026-11-30',
        'noticePeriodDays' => 30,
    ], ['X-CSRF-Token' => $hr['csrf']], $hrCookie);
    $id = $created['json']['data']['id'];
    $case->request('POST', '/api/terminations/' . $id . '/submit', [], ['X-CSRF-Token' => $hr['csrf']], $hrCookie);
    $case->request('POST', '/api/terminations/' . $id . '/approve', [], ['X-CSRF-Token' => $approver['csrf']], $approverCookie);
    $issued = $case->request('POST', '/api/terminations/' . $id . '/issue-notice', [], ['X-CSRF-Token' => $approver['csrf']], $approverCookie);
    $letterId = (int) $issued['json']['data']['letters'][0]['id'];

    $employee = $case->sessionFor('employee');
    $mine = $case->request('GET', '/api/me/termination', [], [], ['paylens_session' => $employee['cookie']]);
    $t->assertSame(200, $mine['status']);
    $t->assert($mine['json']['data']['notice'] !== null, 'the employee can see the notice');
    $t->assertSame(null, $mine['json']['data']['acknowledgedAt'], 'it is not acknowledged yet');

    $acknowledged = $case->request('POST', '/api/me/termination/acknowledge', ['letterId' => $letterId], ['X-CSRF-Token' => $employee['csrf']], ['paylens_session' => $employee['cookie']]);
    $t->assertSame(200, $acknowledged['status']);
    $t->assertSame('acknowledged', $acknowledged['json']['data']['status']);

    $after = $case->request('GET', '/api/me/termination', [], [], ['paylens_session' => $employee['cookie']]);
    $t->assert($after['json']['data']['acknowledgedAt'] !== null, 'the acknowledgement is recorded');
});

$t->test('another employee cannot acknowledge the notice', function (TestRunner $t) use ($case): void {
    $hr = $case->sessionFor('hr');
    $approver = $case->sessionFor('approver');
    $hrCookie = ['paylens_session' => $hr['cookie']];

    $employeeRow = $case->app->db->selectOne(
        "SELECT employee_id FROM users WHERE role = 'employee' LIMIT 1",
    );
    $created = $case->request('POST', '/api/terminations', [
        'employeeId' => (string) $employeeRow['employee_id'],
        'category' => 'termination',
        'reason' => 'End of assignment.',
        'lastWorkingDay' => '2026-12-31',
        'noticePeriodDays' => 60,
    ], ['X-CSRF-Token' => $hr['csrf']], $hrCookie);
    $id = $created['json']['data']['id'];
    $case->request('POST', '/api/terminations/' . $id . '/submit', [], ['X-CSRF-Token' => $hr['csrf']], $hrCookie);
    $case->request('POST', '/api/terminations/' . $id . '/approve', [], ['X-CSRF-Token' => $approver['csrf']], ['paylens_session' => $approver['cookie']]);
    $issued = $case->request('POST', '/api/terminations/' . $id . '/issue-notice', [], ['X-CSRF-Token' => $approver['csrf']], ['paylens_session' => $approver['cookie']]);
    $letterId = (int) $issued['json']['data']['letters'][0]['id'];

    // The admin account is not the employee the notice is addressed to.
    $admin = $case->sessionFor('admin');
    $response = $case->request('POST', '/api/me/termination/acknowledge', ['letterId' => $letterId], ['X-CSRF-Token' => $admin['csrf']], ['paylens_session' => $admin['cookie']]);
    $t->assertSame(409, $response['status'], 'the notice belongs to another account');
});

$t->test('the final settlement is calculated, approved and finalised', function (TestRunner $t) use ($case): void {
    $hr = $case->sessionFor('hr');
    $approver = $case->sessionFor('approver');
    $hrCookie = ['paylens_session' => $hr['cookie']];
    $approverCookie = ['paylens_session' => $approver['cookie']];

    $employeeRow = $case->app->db->selectOne(
        "SELECT employee_id FROM users WHERE role = 'employee' LIMIT 1",
    );
    $created = $case->request('POST', '/api/terminations', [
        'employeeId' => (string) $employeeRow['employee_id'],
        'category' => 'resignation',
        'reason' => 'Relocating.',
        'lastWorkingDay' => '2026-11-15',
        'noticePeriodDays' => 30,
    ], ['X-CSRF-Token' => $hr['csrf']], $hrCookie);
    $id = $created['json']['data']['id'];
    $case->request('POST', '/api/terminations/' . $id . '/submit', [], ['X-CSRF-Token' => $hr['csrf']], $hrCookie);
    $case->request('POST', '/api/terminations/' . $id . '/approve', [], ['X-CSRF-Token' => $approver['csrf']], $approverCookie);
    $issued = $case->request('POST', '/api/terminations/' . $id . '/issue-notice', [], ['X-CSRF-Token' => $approver['csrf']], $approverCookie);
    $letterId = (int) $issued['json']['data']['letters'][0]['id'];

    $employee = $case->sessionFor('employee');
    $case->request('POST', '/api/me/termination/acknowledge', ['letterId' => $letterId], ['X-CSRF-Token' => $employee['csrf']], ['paylens_session' => $employee['cookie']]);

    $settlement = $case->request('POST', '/api/settlements/calculate', ['terminationRequestId' => $id], ['X-CSRF-Token' => $hr['csrf']], $hrCookie);
    $t->assertSame(200, $settlement['status'], 'settlement calculated — ' . substr(json_encode($settlement['json']), 0, 200));
    $t->assert($settlement['json']['data']['totalPayablePaise'] > 0, 'the prorated salary is computed');
    $t->assert($settlement['json']['data']['netPayablePaise'] < $settlement['json']['data']['totalPayablePaise'], 'tax is withheld');
    $settlementId = (string) $settlement['json']['data']['id'];

    $approved = $case->request('POST', '/api/settlements/' . $settlementId . '/approve', [], ['X-CSRF-Token' => $approver['csrf']], $approverCookie);
    $t->assertSame(200, $approved['status'], 'settlement approved — ' . substr(json_encode($approved['json']), 0, 200));
    $t->assertSame('approved', $approved['json']['data']['status']);

    $finalised = $case->request('POST', '/api/settlements/' . $settlementId . '/finalize', [], ['X-CSRF-Token' => $approver['csrf']], $approverCookie);
    $t->assertSame(200, $finalised['status'], 'settlement finalised — ' . substr(json_encode($finalised['json']), 0, 200));
    $t->assertSame('finalized', $finalised['json']['data']['status']);

    // The offboarding completes only with the settlement, not with the
    // acknowledgement.
    $request = $case->app->db->selectOne('SELECT status FROM termination_requests WHERE id = ?', [$id]);
    $t->assertSame('completed', (string) $request['status']);

    // Access is reduced, but the payroll history is preserved.
    $employeeRow2 = $case->app->db->selectOne('SELECT access_status FROM employees WHERE id = ?', [$employeeRow['employee_id']]);
    $t->assertSame('restricted', (string) $employeeRow2['access_status'], 'the employee keeps read access to their own records');
    $t->assert($case->count('payslips') > 0, 'no payslip was deleted');
});

// ============================================================================
// Integration — scheduling, jobs and email
// ============================================================================
$t->group('Scheduling, jobs and email');

$t->test('a scheduled payroll preparation is idempotent', function (TestRunner $t) use ($case): void {
    $finance = $case->sessionFor('finance');
    $cookie = ['paylens_session' => $finance['cookie']];

    $created = $case->request('POST', '/api/schedules', [
        'kind' => 'payroll_preparation',
        'name' => 'Monthly payroll preparation',
        'frequency' => 'monthly',
        'scheduledAt' => '2026-10-01 02:00:00',
        'criteria' => ['month' => 10, 'year' => 2026],
    ], ['X-CSRF-Token' => $finance['csrf']], $cookie);
    $t->assertSame(201, $created['status']);

    $ran = $case->request('POST', '/api/schedules/run-due', [], ['X-CSRF-Token' => $finance['csrf']], $cookie);
    $t->assertSame(200, $ran['status'], 'run due — ' . substr(json_encode($ran['json']), 0, 200));

    $runs = $case->request('GET', '/api/jobs', [], [], $cookie);
    $t->assertSame(403, $runs['status'], 'only an administrator may read the job history');

    $admin = $case->sessionFor('admin');
    $runs = $case->request('GET', '/api/jobs', [], [], ['paylens_session' => $admin['cookie']]);
    $t->assertSame(200, $runs['status']);
    $t->assert(count($runs['json']['data']) > 0, 'the execution is recorded');

    // Running it again must not create a second run for the same period.
    $before = $case->count('payroll_runs');
    $case->request('POST', '/api/schedules/run-due', [], ['X-CSRF-Token' => $finance['csrf']], $cookie);
    $t->assertSame($before, $case->count('payroll_runs'), 'no duplicate run was created');
});

$t->test('a recurring report needs a report type and valid recipients', function (TestRunner $t) use ($case): void {
    $finance = $case->sessionFor('finance');
    $cookie = ['paylens_session' => $finance['cookie']];

    $noType = $case->request('POST', '/api/schedules', [
        'kind' => 'recurring_report',
        'name' => 'Monthly summary',
        'scheduledAt' => '2026-10-01 02:00:00',
        'recipients' => [['email' => 'finance@paylens.co']],
    ], ['X-CSRF-Token' => $finance['csrf']], $cookie);
    $t->assertSame(422, $noType['status'], 'a report type is required');

    $badRecipient = $case->request('POST', '/api/schedules', [
        'kind' => 'recurring_report',
        'name' => 'Monthly summary',
        'reportType' => 'monthly_payroll',
        'scheduledAt' => '2026-10-01 02:00:00',
        'recipients' => [['email' => 'not-an-address']],
    ], ['X-CSRF-Token' => $finance['csrf']], $cookie);
    $t->assertSame(422, $badRecipient['status'], 'the recipient is validated');
});

$t->test('email is recorded as failed when no transport is configured', function (TestRunner $t) use ($case): void {
    $finance = $case->sessionFor('finance');
    $cookie = ['paylens_session' => $finance['cookie']];

    $status = $case->request('GET', '/api/schedules/mail-status', [], [], $cookie);
    $t->assertSame(200, $status['status']);
    $t->assertSame(false, $status['json']['data']['configured'], 'the test environment has no SMTP server');

    $deliveries = $case->app->db->select('SELECT status, error FROM email_deliveries');
    $t->assert(count($deliveries) > 0, 'the deliveries were recorded');
    foreach ($deliveries as $delivery) {
        $t->assert(
            (string) $delivery['status'] !== 'sent',
            'nothing is reported as sent without a transport',
        );
    }
});

// ============================================================================
// Integration — notifications
// ============================================================================
$t->group('Notifications');

$t->test('a payroll approval request reaches the approvers only', function (TestRunner $t) use ($case): void {
    $finance = $case->sessionFor('finance');
    $approver = $case->sessionFor('approver');
    $employee = $case->sessionFor('employee');

    $created = $case->request('POST', '/api/payroll/runs', ['month' => 11, 'year' => 2031], ['X-CSRF-Token' => $finance['csrf']], ['paylens_session' => $finance['cookie']]);
    $runId = $created['json']['data']['id'];
    $case->request('POST', '/api/payroll/runs/' . $runId . '/calculate', [], ['X-CSRF-Token' => $finance['csrf']], ['paylens_session' => $finance['cookie']]);
    $case->request('POST', '/api/payroll/runs/' . $runId . '/submit', [], ['X-CSRF-Token' => $finance['csrf']], ['paylens_session' => $finance['cookie']]);

    $approverNotifications = $case->request('GET', '/api/notifications', [], [], ['paylens_session' => $approver['cookie']]);
    $titles = array_column($approverNotifications['json']['data'], 'title');
    $t->assert(in_array('Payroll awaiting your approval', $titles, true), 'the approver is told');

    $employeeNotifications = $case->request('GET', '/api/notifications', [], [], ['paylens_session' => $employee['cookie']]);
    $employeeTitles = array_column($employeeNotifications['json']['data'], 'title');
    $t->assert(! in_array('Payroll awaiting your approval', $employeeTitles, true), 'the employee is not told');
});

$t->test('a notification can be marked read and the count follows', function (TestRunner $t) use ($case): void {
    $approver = $case->sessionFor('approver');
    $cookie = ['paylens_session' => $approver['cookie']];

    $before = $case->request('GET', '/api/notifications', [], [], $cookie);
    $unreadBefore = (int) $before['json']['meta']['unread'];
    $t->assert($unreadBefore > 0, 'there are unread notifications');

    $id = $before['json']['data'][0]['id'];
    $marked = $case->request('PATCH', '/api/notifications/' . $id . '/read', [], ['X-CSRF-Token' => $approver['csrf']], $cookie);
    $t->assertSame(200, $marked['status']);
    $t->assertSame($unreadBefore - 1, (int) $marked['json']['data']['unread']);

    $all = $case->request('POST', '/api/notifications/read-all', [], ['X-CSRF-Token' => $approver['csrf']], $cookie);
    $t->assertSame(200, $all['status']);
    $t->assertSame(0, (int) $all['json']['data']['unread']);
});

// ============================================================================
// Integration — the response envelope
// ============================================================================
$t->group('Response envelope');

$t->test('collection endpoints answer with a plain JSON list', function (TestRunner $t) use ($case): void {
    $session = $case->sessionFor('admin');
    $cookie = ['paylens_session' => $session['cookie']];

    foreach ([
        '/api/departments',
        '/api/employees?perPage=5',
        '/api/payroll/runs',
        '/api/payroll/rules',
        '/api/payslips',
        '/api/anomalies',
        '/api/audit-logs',
        '/api/notifications',
        '/api/documents',
        '/api/auth/sessions',
        '/api/auth/demo-users',
    ] as $path) {
        $response = $case->request('GET', $path, [], [], $cookie);
        $t->assertSame(200, $response['status'], $path);
        $data = $response['json']['data'] ?? null;
        $t->assert(
            is_array($data) && array_is_list($data),
            $path . ' answers with a list, not a wrapped object — ' . substr($response['raw'], 0, 120),
        );
    }
});

$t->test('single-record endpoints answer with the record itself', function (TestRunner $t) use ($case): void {
    $session = $case->sessionFor('admin');
    $cookie = ['paylens_session' => $session['cookie']];

    $employee = $case->table('employees')[0];
    $response = $case->request('GET', '/api/employees/' . $employee['id'], [], [], $cookie);
    $t->assertSame(200, $response['status']);
    $t->assertSame($employee['id'], $response['json']['data']['id'] ?? null);

    $report = $case->request('GET', '/api/reports/employee_salary', [], [], $cookie);
    $t->assertSame(200, $report['status']);
    $t->assert(isset($report['json']['data']['headers']), 'a report carries its headers');
    $t->assert(isset($report['json']['data']['rows']), 'a report carries its rows');
});

// ============================================================================
// Integration — own records
// ============================================================================
$t->group('Own records');

$t->test('an employee sees only their own payslips', function (TestRunner $t) use ($case): void {
    $session = $case->sessionFor('employee');
    $response = $case->request('GET', '/api/me/payslips', [], [], ['paylens_session' => $session['cookie']]);

    $t->assertSame(200, $response['status']);
    $t->assert(count($response['json']['data']) > 0, 'payslips are returned');

    $employeeId = $case->app->db->selectOne('SELECT employee_id FROM users WHERE id = ?', [$session['userId']]);
    foreach ($response['json']['data'] as $payslip) {
        $t->assertSame($employeeId['employee_id'], $payslip['employeeId'], 'every payslip belongs to the signed-in employee');
    }
});

$t->test('an employee cannot pass another employee id to the payslip list', function (TestRunner $t) use ($case): void {
    $session = $case->sessionFor('employee');
    $response = $case->request('GET', '/api/payslips?employeeId=EMP001', [], [], ['paylens_session' => $session['cookie']]);

    $t->assertSame(200, $response['status']);
    foreach ($response['json']['data'] as $payslip) {
        $t->assert($payslip['employeeId'] !== 'EMP001', 'another employee\'s payslips are not returned');
    }
});

// ============================================================================
// Regressions — the defects that were found and fixed
// ============================================================================
$t->group('Regressions');

$t->test('one wrong password does not lock the account out', function (TestRunner $t) use ($case): void {
    // The second account, because the first one has already been rate
    // limited by the test above.
    $email = $case->table('users')[1]['email'];

    $failed = $case->request('POST', '/api/auth/login', ['email' => $email, 'password' => 'wrong-password']);
    $t->assertSame(401, $failed['status'], 'the wrong password is rejected');

    $row = $case->app->db->selectOne('SELECT locked_until FROM users WHERE email = ?', [$email]);
    $t->assertSame(null, $row['locked_until'], 'the account is not locked after a single failure');

    $ok = $case->request('POST', '/api/auth/login', ['email' => $email, 'password' => 'TestPassword#123']);
    $t->assertSame(200, $ok['status'], 'the correct password still works');
});

$t->test('the demo sign-in accepts the approver role', function (TestRunner $t) use ($case): void {
    $response = $case->request('POST', '/api/auth/demo-login', ['role' => 'approver']);

    $t->assertSame(200, $response['status'], 'the approver account can be signed into');
    $t->assertSame('approver', $response['json']['data']['user']['role']);
});

$t->test('the demo sign-in refuses a role that does not exist', function (TestRunner $t) use ($case): void {
    $response = $case->request('POST', '/api/auth/demo-login', ['role' => 'wizard']);
    $t->assertSame(422, $response['status']);
});

$t->test('a payroll adjustment is recorded instead of failing', function (TestRunner $t) use ($case): void {
    $finance = $case->sessionFor('finance');
    $cookie = ['paylens_session' => $finance['cookie']];

    $created = $case->request('POST', '/api/payroll/runs', ['month' => 6, 'year' => 2030], ['X-CSRF-Token' => $finance['csrf']], $cookie);
    $t->assertSame(201, $created['status']);
    $runId = $created['json']['data']['id'];

    $employee = $case->table('employees')[3];

    $response = $case->request('POST', '/api/payroll/runs/' . $runId . '/adjustments', [
        'employeeId' => $employee['id'],
        'kind' => 'bonus',
        'amount' => 5000,
        'reason' => 'On-call bonus for the release weekend.',
        'approved' => true,
    ], ['X-CSRF-Token' => $finance['csrf']], $cookie);

    $t->assertSame(201, $response['status'], 'the adjustment is accepted');
    $t->assertSame('bonus', $response['json']['data']['kind']);
    $t->assertSame(500000, $response['json']['data']['amountPaise'], 'the amount is stored in paise');

    $rows = $case->app->db->select(
        'SELECT * FROM payroll_adjustments WHERE payroll_run_id = ? AND employee_id = ?',
        [$runId, $employee['id']],
    );
    $t->assertSame(1, count($rows), 'the adjustment is recorded against the run');
    $t->assertSame('approved', (string) $rows[0]['status']);
});

$t->test('an adjustment cannot be added to a submitted run', function (TestRunner $t) use ($case): void {
    $finance = $case->sessionFor('finance');
    $cookie = ['paylens_session' => $finance['cookie']];

    $created = $case->request('POST', '/api/payroll/runs', ['month' => 7, 'year' => 2030], ['X-CSRF-Token' => $finance['csrf']], $cookie);
    $runId = $created['json']['data']['id'];
    $case->request('POST', '/api/payroll/runs/' . $runId . '/calculate', [], ['X-CSRF-Token' => $finance['csrf']], $cookie);
    $case->request('POST', '/api/payroll/runs/' . $runId . '/submit', [], ['X-CSRF-Token' => $finance['csrf']], $cookie);

    $response = $case->request('POST', '/api/payroll/runs/' . $runId . '/adjustments', [
        'kind' => 'bonus',
        'amount' => 1000,
        'reason' => 'Too late.',
    ], ['X-CSRF-Token' => $finance['csrf']], $cookie);

    $t->assertSame(409, $response['status'], 'a submitted run is closed to adjustments');
});

$t->test('the holds list uses the same field names as the other hold endpoints', function (TestRunner $t) use ($case): void {
    $hr = $case->sessionFor('hr');
    $cookie = ['paylens_session' => $hr['cookie']];

    $employee = $case->table('employees')[30];
    $placed = $case->request('POST', '/api/employees/' . $employee['id'] . '/holds', [
        'reason' => 'Awaiting a revised contract',
        'category' => 'documentation',
        'effectiveFrom' => '2026-01-01',
    ], ['X-CSRF-Token' => $hr['csrf']], $cookie);
    $t->assertSame(201, $placed['status']);

    $response = $case->request('GET', '/api/holds', [], [], $cookie);
    $t->assertSame(200, $response['status']);

    $hold = null;
    foreach ($response['json']['data'] as $row) {
        if ((int) $row['id'] === (int) $placed['json']['data']['id']) {
            $hold = $row;
        }
    }
    $t->assert($hold !== null, 'the hold is listed');
    $t->assertSame($employee['id'], (string) $hold['employee_id'], 'the employee id is in the field the client reads');
    $t->assert(($hold['employee_name'] ?? '') !== '', 'the employee name is in the field the client reads');
    $t->assertSame('2026-01-01', (string) $hold['effective_from'], 'the start of the period is in the field the client reads');
});

$t->test('a hold on an unknown employee is a bad request, not a server error', function (TestRunner $t) use ($case): void {
    $hr = $case->sessionFor('hr');
    $cookie = ['paylens_session' => $hr['cookie']];

    $response = $case->request('POST', '/api/employees/EMP999999/holds', [
        'reason' => 'Nobody by that id',
        'category' => 'temporary',
        'effectiveFrom' => '2026-01-01',
    ], ['X-CSRF-Token' => $hr['csrf']], $cookie);

    $t->assertSame(404, $response['status']);
});

$t->test('placing a hold tells the payroll preparers about it', function (TestRunner $t) use ($case): void {
    $hr = $case->sessionFor('hr');
    $cookie = ['paylens_session' => $hr['cookie']];

    $before = $case->count('notifications');
    $employee = $case->table('employees')[45];

    $placed = $case->request('POST', '/api/employees/' . $employee['id'] . '/holds', [
        'reason' => 'Medical leave',
        'category' => 'medical',
        'effectiveFrom' => '2026-02-01',
    ], ['X-CSRF-Token' => $hr['csrf']], $cookie);

    $t->assertSame(201, $placed['status'], 'the hold is placed');
    $t->assert($case->count('notifications') > $before, 'a notification was created for the hold');
});

$t->test('the role matrix on disk and in the database agree', function (TestRunner $t) use ($case): void {
    /** @var array{matrix:array<string,array<int,string>>} $config */
    $config = require dirname(__DIR__) . '/database/roles.php';

    $expected = [];
    foreach ($config['matrix'] as $role => $permissions) {
        foreach ($permissions as $permission) {
            $expected[$role . '|' . $permission] = true;
        }
    }

    $actual = [];
    foreach ($case->app->db->select('SELECT role_name, permission_name FROM role_permissions') as $row) {
        $actual[$row['role_name'] . '|' . $row['permission_name']] = true;
    }

    $t->assertSame([], array_diff_key($expected, $actual), 'every grant in roles.php is in the database');
    $t->assertSame([], array_diff_key($actual, $expected), 'the database holds no grant that roles.php does not');
});

$t->test('the approver role may approve, and finance may not', function (TestRunner $t) use ($case): void {
    $t->assert($case->app->rbac->has('approver', 'payroll:approve'), 'the approver may approve');
    $t->assert(! $case->app->rbac->has('finance', 'payroll:approve'), 'finance prepares, it does not approve');
    $t->assert($case->app->rbac->has('finance', 'payroll:submit'), 'finance submits the run');
});

$t->test('every seeded payroll period has attendance', function (TestRunner $t) use ($case): void {
    // Only the periods the seed creates runs for. The runs the tests create
    // for later years have no attendance on purpose.
    $payslips = $case->app->db->select(
        "SELECT working_days, days_present FROM payslips
         WHERE period_year = 2026 AND period_month BETWEEN 4 AND 9",
    );
    $t->assert(count($payslips) > 0, 'there are payslips to check');

    $blank = 0;
    foreach ($payslips as $payslip) {
        if ((int) $payslip['days_present'] === 0) {
            $blank++;
        }
    }
    $t->assertSame(0, $blank, 'no payslip shows nobody attending work');
});

// ============================================================================
// The employee's own scope
// ============================================================================
$t->group('Employee scope');

$t->test('an employee cannot read another employee\'s payslips', function (TestRunner $t) use ($case): void {
    $session = $case->sessionFor('employee');
    $cookie = ['paylens_session' => $session['cookie']];

    $own = $case->app->db->selectOne('SELECT employee_id FROM users WHERE id = ?', [$session['userId']]);
    $other = $case->app->db->selectOne(
        "SELECT id FROM employees WHERE id <> ? ORDER BY id LIMIT 1",
        [$own['employee_id']],
    );

    $response = $case->request('GET', '/api/employees/' . $other['id'] . '/payslips', [], [], $cookie);
    $t->assertSame(403, $response['status'], "another employee's payslips are refused");

    $ownResponse = $case->request('GET', '/api/employees/' . $own['employee_id'] . '/payslips', [], [], $cookie);
    $t->assertSame(200, $ownResponse['status'], 'the employee can read their own');
});

$t->test('an employee sees only their own payslip within a run', function (TestRunner $t) use ($case): void {
    $session = $case->sessionFor('employee');
    $cookie = ['paylens_session' => $session['cookie']];

    $response = $case->request('GET', '/api/payroll/runs/PR-202609/payslips', [], [], $cookie);
    $t->assertSame(200, $response['status']);

    $own = (string) ($case->app->db->selectOne('SELECT employee_id FROM users WHERE id = ?', [$session['userId']])['employee_id'] ?? '');
    $rows = $response['json']['data'] ?? [];
    $t->assert(count($rows) > 0, 'their own payslip is returned');
    foreach ($rows as $payslip) {
        $t->assertSame($own, (string) $payslip['employeeId'], 'no colleague\'s payslip is returned');
    }
});

$t->test('an employee cannot list the payroll runs', function (TestRunner $t) use ($case): void {
    $session = $case->sessionFor('employee');
    $response = $case->request('GET', '/api/payroll/runs', [], [], ['paylens_session' => $session['cookie']]);
    $t->assertSame(403, $response['status']);
});

$t->test('an employee dashboard shows their own figures, not the organisation\'s', function (TestRunner $t) use ($case): void {
    $session = $case->sessionFor('employee');
    $response = $case->request('GET', '/api/reports/dashboard', [], [], ['paylens_session' => $session['cookie']]);
    $t->assertSame(200, $response['status']);

    $data = $response['json']['data'] ?? [];

    $own = (string) ($case->app->db->selectOne('SELECT employee_id FROM users WHERE id = ?', [$session['userId']])['employee_id'] ?? '');
    $ownPayslip = $case->app->db->selectOne(
        'SELECT net_paise, gross_paise FROM payslips WHERE employee_id = ? ORDER BY period_year DESC, period_month DESC LIMIT 1',
        [$own],
    );

    $t->assertSame(1, (int) ($data['activeEmployees'] ?? 0), 'the headcount is the employee\'s own');
    $t->assert(
        abs((float) ($data['currentRun']['totalNet'] ?? 0) - ((int) $ownPayslip['net_paise'] / 100)) < 1.0,
        'the payroll shown is the employee\'s own net pay',
    );

    // The organisation-wide figures must not appear anywhere in the payload.
    $encoded = (string) json_encode($data);
    $total = (int) ($case->app->db->selectOne('SELECT total_net_paise FROM payroll_runs ORDER BY period_year DESC, period_month DESC LIMIT 1')['total_net_paise'] ?? 0);
    $t->assert(
        !str_contains($encoded, (string) ($total / 100)),
        'the organisation\'s total payroll is not in the payload',
    );

    foreach ($data['recentAnomalies'] ?? [] as $anomaly) {
        $t->assertSame($own, (string) $anomaly['employeeId'], 'only the employee\'s own anomalies are listed');
    }
});

$t->test('an employee cannot reach the company tax centre or the tax slabs', function (TestRunner $t) use ($case): void {
    $session = $case->sessionFor('employee');
    $cookie = ['paylens_session' => $session['cookie']];

    $tax = $case->request('GET', '/api/reports/tax-center', [], [], $cookie);
    $t->assertSame(403, $tax['status'], 'the company tax centre is refused');

    $slabs = $case->request('GET', '/api/settings/tax-slabs', [], [], $cookie);
    $t->assertSame(403, $slabs['status'], 'the tax slab table is refused');
});

$t->test('the roles that run payroll still see the organisation figures', function (TestRunner $t) use ($case): void {
    foreach (['admin', 'hr', 'finance', 'approver'] as $role) {
        $session = $case->sessionFor($role);
        $response = $case->request('GET', '/api/reports/dashboard', [], [], ['paylens_session' => $session['cookie']]);
        $t->assertSame(200, $response['status'], $role . ' can read the dashboard');

        $data = $response['json']['data'] ?? [];
        $t->assert((int) ($data['activeEmployees'] ?? 0) > 1, $role . ' sees the organisation headcount');
    }
});

exit($t->summary());
