<?php

declare(strict_types=1);

/**
 * Create or update an account.
 *
 *   php backend/bin/create-admin.php admin@example.com "a strong password"
 *   php backend/bin/create-admin.php approver@example.com "a strong password" --role=approver
 *
 * The password is read from the argument, never from a file in the
 * repository, and is only ever stored as a password_hash() digest.
 */

use PayLens\Core\Env;
use PayLens\Core\Migrator;
use PayLens\Repositories\UserRepository;

/** @var \PayLens\Core\App $app */
$app = require dirname(__DIR__) . '/bootstrap.php';

$role = 'admin';
$employeeId = null;
foreach ($argv as $arg) {
    if (str_starts_with((string) $arg, '--role=')) {
        $role = substr((string) $arg, 7);
    }
    if (str_starts_with((string) $arg, '--employee=')) {
        $employeeId = substr((string) $arg, 11);
    }
}
if (! in_array($role, ['admin', 'hr', 'finance', 'approver', 'employee'], true)) {
    fwrite(STDERR, "Unknown role: {$role}\n");
    exit(1);
}

$email = $argv[1] ?? Env::get('ADMIN_EMAIL', '');
$password = $argv[2] ?? Env::get('ADMIN_PASSWORD', '');

if ($email === '' || $password === '') {
    fwrite(STDERR, "Usage: php backend/bin/create-admin.php <email> <password> [--role=admin|hr|finance|approver|employee]\n");
    exit(1);
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    fwrite(STDERR, "The email address is not valid.\n");
    exit(1);
}

$minLength = $app->config->int('security.password_min_length', 12);
if (strlen($password) < $minLength) {
    fwrite(STDERR, "The password must be at least {$minLength} characters.\n");
    exit(1);
}

$migrator = new Migrator($app->db, $app->config->string('paths.migrations'));
$migrator->migrate();

$users = new UserRepository($app->db);
$existing = $users->findByEmail($email);
$hash = password_hash($password, PASSWORD_DEFAULT);
$now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');

if ($existing !== null) {
    $app->db->execute(
        "UPDATE users SET password_hash = ?, role = ?, status = 'active', failed_login_count = 0,
                locked_until = NULL, employee_id = COALESCE(?, employee_id), updated_at = ? WHERE id = ?",
        [$hash, $role, $employeeId, $now, $existing['id']],
    );
    echo "Updated existing account {$email} to the {$role} role.\n";
    exit(0);
}

$app->db->execute(
    "INSERT INTO users (email, password_hash, name, role, status, employee_id, avatar_seed, failed_login_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, NULL, 0, ?, ?)",
    [$email, $hash, 'Administrator', $role, $employeeId, $now, $now],
);

echo "Created {$role} account {$email}.\n";
