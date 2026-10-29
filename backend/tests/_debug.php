<?php
/** Temporary debug. */
require dirname(__DIR__) . '/bootstrap.php';

use PayLens\Core\TestRunner;
use PayLens\Tests\TestCase;

$t = new TestRunner();
$case = new TestCase($t);
$case->boot();

$email = $case->table('users')[0]['email'];
$login = $case->request('POST', '/api/auth/login', ['email' => $email, 'password' => 'TestPassword#123']);
echo "login status: {$login['status']}\n";
echo "login body: " . substr($login['raw'], 0, 500) . "\n\n";

$session = $case->sessionFor('admin');
$cookie = ['paylens_session' => $session['cookie']];

$list = $case->request('GET', '/api/employees?perPage=5', [], [], $cookie);
echo "list status: {$list['status']}\n";
echo "list meta: " . json_encode($list['json']['meta'] ?? null) . "\n";
echo "list data type: " . gettype($list['json']['data'] ?? null) . " count=" . (is_array($list['json']['data'] ?? null) ? count($list['json']['data']) : 'n/a') . "\n";
echo "list raw head: " . substr($list['raw'], 0, 200) . "\n\n";

$run = $case->app->db->selectOne('SELECT id, status FROM payroll_runs WHERE id = ?', ['PR-202609']);
echo "PR-202609 status: " . json_encode($run) . "\n";
