<?php

declare(strict_types=1);

/**
 * Apply pending database migrations.
 *
 *   php backend/bin/migrate.php          apply pending migrations
 *   php backend/bin/migrate.php --status list applied and pending migrations
 *
 * Migrations never drop or reset an existing database.
 */

use PayLens\Core\Migrator;

/** @var \PayLens\Core\App $app */
$app = require dirname(__DIR__) . '/bootstrap.php';

$migrator = new Migrator($app->db, $app->config->string('paths.migrations'));

if (in_array('--status', $argv, true)) {
    foreach ($migrator->status() as $row) {
        printf("%s  %s\n", $row['applied'] ? '[applied]' : '[pending]', $row['name']);
    }
    exit(0);
}

$applied = $migrator->migrate();
if ($applied === []) {
    echo "Nothing to migrate — the database is already up to date.\n";
    exit(0);
}
foreach ($applied as $name) {
    echo "Applied: {$name}\n";
}
echo count($applied) . " migration(s) applied.\n";
