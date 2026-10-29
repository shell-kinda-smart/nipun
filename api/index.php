<?php

declare(strict_types=1);

/**
 * Vercel PHP Function entry point.
 *
 * All /api/* requests are rewritten here. The existing front controller
 * keeps routing, security headers, cookies and error handling in one place.
 */

require dirname(__DIR__) . '/backend/public/api/index.php';
