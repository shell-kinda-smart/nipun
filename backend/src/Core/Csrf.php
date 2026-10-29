<?php

declare(strict_types=1);

namespace PayLens\Core;

/**
 * Cross-site request forgery protection.
 *
 * The API is cookie-authenticated, so a state-changing request can be
 * forged by another origin. Every mutating request must carry the session's
 * CSRF token in the `X-CSRF-Token` header; the browser cannot attach custom
 * headers cross-origin without a CORS pre-flight, which the server refuses.
 */
final class Csrf
{
    public const HEADER = 'X-CSRF-Token';

    public static function isSafeMethod(string $method): bool
    {
        return in_array(strtoupper($method), ['GET', 'HEAD', 'OPTIONS'], true);
    }

    public static function verify(Request $request): bool
    {
        if (self::isSafeMethod($request->method())) {
            return true;
        }
        $session = $request->attribute('session');
        if (!is_array($session) || !isset($session['csrf_token'])) {
            return false;
        }
        $sent = $request->header(strtolower(self::HEADER));
        if ($sent === null || $sent === '') {
            return false;
        }
        return hash_equals((string) $session['csrf_token'], $sent);
    }
}
