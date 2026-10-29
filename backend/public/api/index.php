<?php

declare(strict_types=1);

/**
 * API front controller.
 *
 * Everything under /api is handled here. The response is always JSON with
 * a consistent envelope, and unexpected failures are logged server-side
 * while the client receives a generic message — stack traces, SQL errors
 * and credentials never reach the browser.
 */

use PayLens\Core\Kernel;
use PayLens\Core\Request;

/** @var \PayLens\Core\App $app */
$app = require dirname(__DIR__, 2) . '/bootstrap.php';

// ── CORS ──────────────────────────────────────────────────────────────────
// Only origins that are explicitly configured may call the API. The default
// (empty) means same-origin only, which is what the Vite dev proxy uses.
$allowedOrigins = $app->config->get('security.cors_origins', []);
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && in_array($origin, (array) $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
    header('Vary: Origin');
    header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');
    header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Security headers ─────────────────────────────────────────────────────
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: same-origin');

(new Kernel($app))->handle(Request::capture());
