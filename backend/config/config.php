<?php

declare(strict_types=1);

/**
 * Backend configuration.
 *
 * Every value can be overridden through the environment so a deployment
 * never has to edit a tracked file. Secrets are read from the environment
 * only — there are no credentials in this file.
 */

$root = dirname(__DIR__);
$databaseUrl = getenv('DATABASE_URL') ?: '';
$defaultDriver = preg_match('#^postgres(?:ql)?://#i', $databaseUrl) === 1 ? 'pgsql' : 'mysql';

return [
    'app' => [
        'name' => 'PayLens API',
        'env' => getenv('APP_ENV') ?: 'development',
        'debug' => filter_var(getenv('APP_DEBUG') ?: 'false', FILTER_VALIDATE_BOOL),
        'url' => getenv('APP_URL') ?: 'http://localhost:8080',
        // Where the frontend lives — the links in emails point here.
        'frontend_url' => getenv('APP_FRONTEND_URL') ?: 'http://localhost:5173',
        // Demo affordances (one-click role login) are only available when
        // this is on. It is switched off in production.
        'demo_mode' => filter_var(getenv('APP_DEMO_MODE') ?: 'true', FILTER_VALIDATE_BOOL),
        'timezone' => getenv('APP_TIMEZONE') ?: 'UTC',
        // Used on the official notice and in emails.
        'organisation' => getenv('APP_ORGANISATION') ?: 'PayLens Technologies Pvt. Ltd.',
        'hr_contact' => getenv('APP_HR_CONTACT') ?: 'people@paylens.co',
        // What happens to an employee's access when they leave:
        //   restricted — they keep read access to their own records
        //   revoked    — the account is disabled entirely
        'access_after_termination' => getenv('APP_ACCESS_AFTER_TERMINATION') ?: 'restricted',
    ],

    'smtp' => [
        // Leave the host empty to run without email: every delivery is then
        // recorded as failed with the reason, never as sent.
        'host' => getenv('SMTP_HOST') ?: '',
        'port' => (int) (getenv('SMTP_PORT') ?: 587),
        'username' => getenv('SMTP_USERNAME') ?: '',
        'password' => getenv('SMTP_PASSWORD') ?: '',
        'encryption' => getenv('SMTP_ENCRYPTION') ?: 'tls', // tls | ssl | none
        'timeout' => (int) (getenv('SMTP_TIMEOUT') ?: 15),
        'from_email' => getenv('SMTP_FROM_EMAIL') ?: 'no-reply@paylens.co',
        'from_name' => getenv('SMTP_FROM_NAME') ?: 'PayLens',
    ],

    'db' => [
        'driver' => getenv('DB_DRIVER') ?: $defaultDriver,
        // DATABASE_URL is the preferred deployment setting (Neon/Vercel).
        // The individual fields remain available for MySQL and local use.
        'url' => $databaseUrl,
        // PostgreSQL deployments are isolated from other applications by
        // putting every PayLens table in this dedicated schema.
        'schema' => getenv('DB_SCHEMA') ?: 'paylens',
        'host' => getenv('DB_HOST') ?: '127.0.0.1',
        'port' => (int) (getenv('DB_PORT') ?: ($defaultDriver === 'pgsql' ? 5432 : 3306)),
        'database' => getenv('DB_DATABASE') ?: 'paylens',
        'username' => getenv('DB_USERNAME') ?: 'paylens',
        'password' => getenv('DB_PASSWORD') ?: '',
        'charset' => 'utf8mb4',
    ],

    'session' => [
        // Absolute session lifetime and idle timeout, in seconds.
        'absolute_seconds' => (int) (getenv('SESSION_ABSOLUTE_SECONDS') ?: 43200),
        'idle_seconds' => (int) (getenv('SESSION_IDLE_SECONDS') ?: 1800),
        // Set to true when serving over HTTPS.
        'cookie_secure' => filter_var(getenv('SESSION_COOKIE_SECURE') ?: 'false', FILTER_VALIDATE_BOOL),
        // Lax keeps the cookie on the same origin. Use None (with
        // cookie_secure on) when the frontend and the API are on different
        // hosts, so the browser still sends the session.
        'cookie_samesite' => getenv('SESSION_COOKIE_SAMESITE') ?: 'Lax',
    ],

    'security' => [
        'login_max_attempts' => (int) (getenv('LOGIN_MAX_ATTEMPTS') ?: 5),
        'login_window_seconds' => (int) (getenv('LOGIN_WINDOW_SECONDS') ?: 300),
        'login_lockout_seconds' => (int) (getenv('LOGIN_LOCKOUT_SECONDS') ?: 900),
        'password_min_length' => (int) (getenv('PASSWORD_MIN_LENGTH') ?: 12),
        'cors_origins' => array_values(array_filter(array_map(
            'trim',
            explode(',', (string) (getenv('CORS_ORIGINS') ?: ''))
        ))),
    ],

    'payroll' => [
        // Default working days per month, used when attendance is not recorded.
        'default_working_days' => (int) (getenv('PAYROLL_DEFAULT_WORKING_DAYS') ?: 22),
        // Jurisdiction label recorded against configured rules.
        'jurisdiction' => getenv('PAYROLL_JURISDICTION') ?: 'demo',
    ],

    'paths' => [
        'root' => $root,
        'migrations' => $root . '/database/migrations',
        'storage' => $root . '/storage',
    ],
];
