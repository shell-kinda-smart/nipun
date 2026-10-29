<?php

declare(strict_types=1);

namespace PayLens\Services;

use PayLens\Core\App;
use PayLens\Core\HttpException;
use PayLens\Core\Request;
use PayLens\Core\Response;
use PayLens\Core\RateLimiter;
use PayLens\Core\SessionService;
use PayLens\Repositories\UserRepository;

/**
 * Authentication.
 *
 * - Passwords are verified with password_verify() against a password_hash()
 *   digest; the plain text is never stored, logged or echoed.
 * - Failures are deliberately indistinguishable: an unknown address and a
 *   wrong password produce the same message and the same work, so the
 *   endpoint cannot be used to enumerate accounts.
 * - A new session is created on every successful login, which rotates the
 *   session identifier.
 * - Repeated failures lock the account for a cooling-off period and are
 *   additionally rate limited per IP.
 */
final class AuthService
{
    private const GENERIC_FAILURE = 'Those credentials do not match our records.';

    public function __construct(
        private App $app,
        private UserRepository $users,
        private SessionService $sessions,
        private RateLimiter $rateLimiter,
        private AuditLogger $audit,
    ) {
    }

    /**
     * @return array{user:array<string,mixed>,csrf_token:string}
     */
    public function login(string $email, string $password, Request $request, bool $remember = true): array
    {
        $ip = $request->ip();
        $limit = $this->app->config->int('security.login_max_attempts', 5);
        $window = $this->app->config->int('security.login_window_seconds', 300);

        $byIp = $this->rateLimiter->hit('login.ip', $ip, $limit * 3, $window);
        if (!$byIp['allowed']) {
            throw new HttpException(
                'too_many_requests',
                'Too many sign-in attempts. Please wait a few minutes and try again.',
                429,
                ['retry_after' => $byIp['retry_after']],
            );
        }

        $byIdentity = $this->rateLimiter->hit('login.identity', strtolower($email), $limit, $window);
        if (!$byIdentity['allowed']) {
            throw new HttpException(
                'too_many_requests',
                'Too many sign-in attempts. Please wait a few minutes and try again.',
                429,
                ['retry_after' => $byIdentity['retry_after']],
            );
        }

        $user = $this->users->findByEmail($email);

        if ($user === null) {
            // Spend comparable time so a missing account is not detectable
            // by response timing.
            password_verify($password, '$2y$12$usesomesillystringfoeueebRO.BvBaWpXHbBBNPZzLcxDkJ0GFq5j4W.');
            $this->audit->log(null, 'login', 'user', $email, 'failure', ['reason' => 'unknown_account'], $ip);
            throw new HttpException('invalid_credentials', self::GENERIC_FAILURE, 401);
        }

        $lockedUntil = $user['locked_until'] !== null
            ? new \DateTimeImmutable((string) $user['locked_until'])
            : null;
        if ($lockedUntil !== null && $lockedUntil > new \DateTimeImmutable('now')) {
            $this->audit->log((int) $user['id'], 'login', 'user', (string) $user['email'], 'failure', ['reason' => 'locked'], $ip);
            throw new HttpException('invalid_credentials', self::GENERIC_FAILURE, 401);
        }

        if (!password_verify($password, (string) $user['password_hash'])) {
            $this->users->recordFailedLogin(
                (int) $user['id'],
                $this->app->config->int('security.login_lockout_seconds', 900),
                $limit,
            );
            $this->audit->log((int) $user['id'], 'login', 'user', (string) $user['email'], 'failure', ['reason' => 'bad_password'], $ip);
            throw new HttpException('invalid_credentials', self::GENERIC_FAILURE, 401);
        }

        if ((string) $user['status'] !== 'active') {
            $this->audit->log((int) $user['id'], 'login', 'user', (string) $user['email'], 'failure', ['reason' => 'disabled'], $ip);
            throw new HttpException('invalid_credentials', self::GENERIC_FAILURE, 401);
        }

        $this->users->recordSuccessfulLogin((int) $user['id']);
        $this->rateLimiter->clear('login.identity', strtolower($email));

        $session = $this->sessions->create((int) $user['id'], $ip, $request->userAgent(), $remember);
        $this->sessions->sendCookie($session['token']);

        $this->audit->log(
            (int) $user['id'],
            'login',
            'user',
            (string) $user['email'],
            'success',
            ['__actor_email' => (string) $user['email']],
            $ip,
        );

        return [
            'user' => [
                'id' => (string) $user['id'],
                'name' => (string) $user['name'],
                'email' => (string) $user['email'],
                'role' => (string) $user['role'],
                'employeeId' => $user['employee_id'] !== null ? (string) $user['employee_id'] : null,
                'avatarSeed' => (string) ($user['avatar_seed'] ?? ''),
            ],
            'csrf_token' => $session['csrf_token'],
        ];
    }

    public function logout(Request $request): void
    {
        $session = $request->attribute('session');
        if (is_array($session) && isset($session['id'])) {
            $this->sessions->revoke((string) $session['id']);
        }
        $this->sessions->clearCookie();

        $user = $request->attribute('user');
        $this->audit->log(
            is_array($user) ? (int) $user['id'] : null,
            'logout',
            'user',
            is_array($user) ? (string) $user['email'] : null,
            'success',
            [],
            $request->ip(),
        );
    }
}
