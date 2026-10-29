<?php

declare(strict_types=1);

namespace PayLens\Core;

use PayLens\Database\Seeds\DevelopmentSeeder;

/**
 * Idempotent first-run setup for immutable serverless deployments.
 *
 * PostgreSQL schema isolation is established by Database before this runs.
 * Migrations are tracked, the seed leaves existing data alone, and a database
 * advisory lock serialises concurrent cold starts.
 */
final class DeploymentSetup
{
    private static bool $ready = false;

    public static function ensure(App $app): void
    {
        if (self::$ready || ! $app->config->bool('deployment.auto_setup', false)) {
            return;
        }

        $locked = false;
        try {
            if ($app->db->driver() === 'pgsql') {
                $app->db->selectOne('SELECT pg_advisory_lock(716582113)');
                $locked = true;
            }

            $migrator = new Migrator(
                $app->db,
                $app->config->string('paths.migrations'),
            );
            $migrator->migrate();

            $existing = (int) (
                $app->db->selectOne('SELECT COUNT(*) AS c FROM employees')['c'] ?? 0
            );
            $password = getenv('PAYLENS_SEED_PASSWORD') ?: 'PayLens#Demo2026';

            if ($existing === 0) {
                (new DevelopmentSeeder($app))->run($password);
            } else {
                (new DevelopmentSeeder($app))->ensureDemoAccounts($password);
            }

            self::$ready = true;
        } finally {
            if ($locked) {
                $app->db->selectOne('SELECT pg_advisory_unlock(716582113)');
            }
        }
    }
}
