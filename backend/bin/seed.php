<?php

declare(strict_types=1);

/**
 * Seed the development dataset.
 *
 *   php backend/bin/seed.php
 *
 * The seed is destructive only for the tables it owns, and refuses to run
 * unless the target database is empty (or --force is passed).
 *
 * The password for the seeded accounts comes from PAYLENS_SEED_PASSWORD.
 * It is a development credential and must never be used anywhere else.
 */

use PayLens\Core\Env;
use PayLens\Core\Migrator;
use PayLens\Database\Seeds\DevelopmentSeeder;

/** @var \PayLens\Core\App $app */
$app = require dirname(__DIR__) . '/bootstrap.php';

$force = in_array('--force', $argv, true);
$fresh = in_array('--fresh', $argv, true) || $force;
$password = Env::get('PAYLENS_SEED_PASSWORD', 'PayLens#Demo2026');

if ($app->config->string('app.env') === 'production') {
    fwrite(STDERR, "Refusing to seed a production environment.\n");
    exit(1);
}
if ($app->config->string('app.env') === 'production' && $password === 'PayLens#Demo2026') {
    fwrite(STDERR, "Refusing to seed production with the default password.\n");
    fwrite(STDERR, "Set PAYLENS_SEED_PASSWORD to a unique value and try again.\n");
    exit(1);
}

// The schema must exist before it can be seeded.
$migrator = new Migrator($app->db, $app->config->string('paths.migrations'));
$migrator->migrate();

$existing = (int) ($app->db->selectOne('SELECT COUNT(*) AS c FROM employees')['c'] ?? 0);
if ($existing > 0 && ! $fresh) {
    fwrite(STDERR, "The database already contains {$existing} employees.\n");
    fwrite(STDERR, "Re-run with --fresh to reset the seeded tables and reload them.\n");
    exit(1);
}

$seeder = new DevelopmentSeeder($app);
if ($fresh && $existing > 0) {
    echo "Clearing the seeded tables:\n";
    foreach (DevelopmentSeeder::SEEDED_TABLES as $table) {
        echo "  - {$table}\n";
    }
    $seeder->reset();
}

$started = microtime(true);
$summary = $seeder->run($password);

echo "Seeded development data in " . round(microtime(true) - $started, 2) . "s\n";
foreach ($summary as $key => $count) {
    printf("  %-18s %d\n", $key, $count);
}
echo "\nSign in with any seeded account and the password: {$password}\n";
echo "The admin account is the first seeded employee.\n";
