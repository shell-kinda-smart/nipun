<?php

declare(strict_types=1);

/**
 * One-time Vercel database setup endpoint.
 *
 * Enable it temporarily with a random APP_SETUP_TOKEN of at least 32
 * characters, call it once with a Bearer token, then remove the environment
 * variable and redeploy. When disabled it deliberately looks like a 404.
 */

use PayLens\Core\Migrator;
use PayLens\Core\Response;
use PayLens\Database\Seeds\DevelopmentSeeder;

$setupToken = getenv('APP_SETUP_TOKEN') ?: '';
$authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
$providedToken = str_starts_with($authorization, 'Bearer ')
    ? substr($authorization, 7)
    : '';

if (strlen($setupToken) < 32) {
    http_response_code(404);
    exit;
}

if (!hash_equals($setupToken, $providedToken)) {
    http_response_code(401);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => [
        'code' => 'unauthorized',
        'message' => 'Invalid setup token.',
        'details' => [],
    ]]);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    header('Allow: POST');
    http_response_code(405);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => [
        'code' => 'method_not_allowed',
        'message' => 'Use POST for database setup.',
        'details' => [],
    ]]);
    exit;
}

try {
    /** @var \PayLens\Core\App $app */
    $app = require dirname(__DIR__) . '/backend/bootstrap.php';
    $password = getenv('PAYLENS_SEED_PASSWORD') ?: 'PayLens#Demo2026';

    if ($app->config->string('app.env') === 'production' && $password === 'PayLens#Demo2026') {
        Response::error(
            'unsafe_seed_password',
            'Set a unique PAYLENS_SEED_PASSWORD before setup.',
            500,
        );
        exit;
    }

    $migrator = new Migrator($app->db, $app->config->string('paths.migrations'));
    $applied = $migrator->migrate();
    $existing = (int) ($app->db->selectOne('SELECT COUNT(*) AS c FROM employees')['c'] ?? 0);

    if ($existing === 0) {
        $seeded = (new DevelopmentSeeder($app))->run($password);
    } else {
        $seeded = [
            'existingEmployees' => $existing,
            'demoAccountsCreated' => (new DevelopmentSeeder($app))->ensureDemoAccounts($password),
        ];
    }

    Response::json([
        'schema' => $app->config->string('db.schema', 'paylens'),
        'migrationsApplied' => $applied,
        'seeded' => $seeded,
        'next' => 'Remove APP_SETUP_TOKEN from Vercel and redeploy.',
    ]);
} catch (\Throwable $error) {
    error_log((string) $error);
    Response::error('setup_failed', 'Database setup failed. Check the Vercel function logs.', 500);
}
