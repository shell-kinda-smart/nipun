<?php

declare(strict_types=1);

/**
 * Backend bootstrap.
 *
 * Loads configuration and the environment file, registers the autoloader and
 * returns the wired application. Used by the HTTP front controller, the CLI
 * tools and the test suite so all three run against identical settings.
 */

use PayLens\Core\App;
use PayLens\Core\Autoloader;
use PayLens\Core\Config;
use PayLens\Core\Env;

$baseDir = __DIR__;

// The autoloader has to be loaded by hand — it is the thing that loads
// everything else.
require_once $baseDir . '/src/Core/Autoloader.php';

Autoloader::register([
    'PayLens\\' => $baseDir . '/src',
    'PayLens\\Database\\Seeds\\' => $baseDir . '/database/seeds',
    'PayLens\\Tests\\' => $baseDir . '/tests',
]);

// The project-level file is the canonical local/Vercel import file. The
// backend-specific file remains supported as an optional local override.
Env::load(dirname($baseDir) . '/.env');
Env::load($baseDir . '/.env');

$app = App::boot($baseDir);

return $app;
