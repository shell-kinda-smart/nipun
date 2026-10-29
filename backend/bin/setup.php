<?php

declare(strict_types=1);

/**
 * One-command development setup.
 *
 *   php backend/bin/setup.php
 *
 * Creates the development database, applies the migrations and loads the
 * fictional demo dataset. It is safe to run repeatedly: migrations are
 * tracked, and the seed refuses to write over an existing dataset unless
 * --force is passed.
 *
 * For MySQL, create the database first:
 *   CREATE DATABASE paylens CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
 */

use PayLens\Core\Env;
use PayLens\Core\Migrator;
use PayLens\Database\Seeds\DevelopmentSeeder;

/** @var \PayLens\Core\App $app */
$app = require dirname(__DIR__) . '/bootstrap.php';

$force = in_array('--force', $argv, true);
$password = Env::get('PAYLENS_SEED_PASSWORD', 'PayLens#Demo2026');

if ($app->config->string('app.env') === 'production' && $password === 'PayLens#Demo2026') {
    fwrite(STDERR, "Refusing to seed production with the default password.\n");
    fwrite(STDERR, "Set PAYLENS_SEED_PASSWORD to a unique value and try again.\n");
    exit(1);
}

echo "Database: " . $app->config->string('db.driver') . ' (' . $app->config->string('db.database') . ")\n";

$migrator = new Migrator($app->db, $app->config->string('paths.migrations'));
$applied = $migrator->migrate();
echo count($applied) === 0
    ? "Schema is already up to date.\n"
    : 'Applied ' . count($applied) . " migration(s).\n";

$existing = (int) ($app->db->selectOne('SELECT COUNT(*) AS c FROM employees')['c'] ?? 0);
if ($existing > 0 && ! $force) {
    // The dataset is already there, so it is left exactly as it is. A role
    // that was added to the seed after this database was created may still
    // be missing its demo account, though, so those are topped up.
    $created = (new DevelopmentSeeder($app))->ensureDemoAccounts($password);
    echo "The database already holds {$existing} employees — nothing to seed.\n";
    if ($created > 0) {
        echo "Created {$created} missing demo account(s).\n";
    }
    echo "Re-run with --force to seed it again.\n";
    exit(0);
}

$summary = (new DevelopmentSeeder($app))->run($password);

echo "\nSeeded:\n";
foreach ($summary as $key => $count) {
    printf("  %-18s %d\n", $key, $count);
}

echo "\nSign in with any seeded account. The demo password is the value of\n";
echo "PAYLENS_SEED_PASSWORD (default: PayLens#Demo2026 — change it before\n";
echo "using this anywhere but a local development machine).\n";
