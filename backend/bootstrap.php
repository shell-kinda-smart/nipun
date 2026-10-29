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

// .env is optional; in production the values come from the real environment.
Env::load($baseDir . '/.env');

$app = App::boot($baseDir);

return $app;
