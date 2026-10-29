<?php

declare(strict_types=1);

namespace PayLens\Core;

/**
 * Minimal PSR-4 autoloader.
 *
 * The project has no Composer dependencies, so classes are resolved from
 * disk directly. Keeping this dependency-free means the backend runs on a
 * bare PHP install with no network access.
 */
final class Autoloader
{
    /**
     * @param array<string,string> $prefixes Namespace prefix => directory.
     */
    public static function register(array $prefixes): void
    {
        spl_autoload_register(static function (string $class) use ($prefixes): void {
            foreach ($prefixes as $prefix => $directory) {
                if (!str_starts_with($class, $prefix)) {
                    continue;
                }
                $relative = str_replace('\\', DIRECTORY_SEPARATOR, substr($class, strlen($prefix)));
                $file = rtrim($directory, '/\\') . DIRECTORY_SEPARATOR . $relative . '.php';
                if (is_file($file)) {
                    require $file;
                    return;
                }
            }
        });
    }
}
