<?php

declare(strict_types=1);

/**
 * Router script for the PHP built-in server.
 *
 *   php -S 127.0.0.1:8080 -t backend/public backend/public/router.php
 *
 * Static files under public/ are served as-is; everything else is routed
 * into the API front controller.
 */

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$file = __DIR__ . $path;

if ($path !== '/' && is_file($file)) {
    return false; // Let the built-in server serve the file.
}

require __DIR__ . '/api/index.php';
