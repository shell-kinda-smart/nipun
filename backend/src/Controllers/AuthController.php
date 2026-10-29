<?php

declare(strict_types=1);

namespace PayLens\Controllers;

use PayLens\Core\HttpException;
use PayLens\Core\Request;
use PayLens\Core\Response;
use PayLens\Core\SessionService;
use PayLens\Repositories\UserRepository;
use PayLens\Services\AuthService;
use PayLens\Support\Mapper;

final class AuthController extends Controller
{
    private AuthService $auth;
    private UserRepository $users;
    private SessionService $sessions;

    public function __construct(\PayLens\Core\App $app)
    {
        parent::__construct($app);
        $this->auth = new AuthService($app, new UserRepository($app->db), $app->sessions, $app->rateLimiter, $app->audit);
        $this->users = new UserRepository($app->db);
        $this->sessions = $app->sessions;
    }

    /** POST /api/auth/login */
    public function login(Request $request): void
    {
        $data = $this->validated($request, [
            'email' => 'required|email|max:160',
            'password' => 'required|string|max:200',
            'remember' => 'nullable|boolean',
        ]);

        $result = $this->auth->login(
            (string) $data['email'],
            (string) $data['password'],
            $request,
            (bool) ($data['remember'] ?? true),
        );

        Response::json([
            'user' => $result['user'],
            'csrfToken' => $result['csrf_token'],
            'permissions' => $this->app->rbac->permissionsFor((string) $result['user']['role']),
            'demoMode' => $this->app->config->bool('app.demo_mode', false),
        ]);
    }

    /**
     * GET /api/auth/demo-users
     *
     * The seeded accounts the demo role switcher offers. Demo mode only —
     * the endpoint does not exist in production, and it never exposes a
     * credential, only the name, address and avatar of each account.
     */
    public function demoUsers(Request $request): void
    {
        if (
            ! $this->app->config->bool('app.demo_mode', false)
            || $this->app->config->string('app.env') === 'production'
        ) {
            throw new HttpException('not_found', 'Endpoint not found.', 404);
        }

        $rows = $this->app->db->select(
            "SELECT u.id, u.name, u.email, u.role, u.avatar_seed, u.employee_id
             FROM users u WHERE u.status = 'active' ORDER BY u.id",
        );

        Response::json(array_map(static fn (array $row): array => [
            'id' => (string) $row['id'],
            'name' => (string) $row['name'],
            'email' => (string) $row['email'],
            'role' => (string) $row['role'],
            'avatarSeed' => (string) ($row['avatar_seed'] ?? ''),
            'employeeId' => $row['employee_id'] !== null ? (string) $row['employee_id'] : null,
        ], $rows));
    }

    /** POST /api/auth/logout */
    public function logout(Request $request): void
    {
        $this->auth->logout($request);
        Response::json(['ok' => true]);
    }

    /**
     * POST /api/auth/demo-login
     *
     * Signs in as the seeded demo account for a role without a password.
     * This exists only so the demo's "switch role" control keeps working
     * without shipping a credential to the browser: the endpoint only
     * exists while the server runs in demo mode, and it refuses to run in
     * a production environment. Every use is written to the audit trail.
     */
    public function demoLogin(Request $request): void
    {
        if (
            ! $this->app->config->bool('app.demo_mode', false)
            || $this->app->config->string('app.env') === 'production'
        ) {
            throw new HttpException('not_found', 'Endpoint not found.', 404);
        }

        $data = $this->validated($request, ['role' => 'required|in:admin,hr,finance,approver,employee']);
        $user = $this->users->findByRole((string) $data['role']);
        if ($user === null) {
            throw new HttpException('not_found', 'No demo account for that role.', 404);
        }

        $session = $this->app->sessions->create((int) $user['id'], $request->ip(), $request->userAgent());
        $this->app->sessions->sendCookie($session['token']);

        $this->app->audit->log(
            (int) $user['id'],
            'login',
            'user',
            (string) $user['email'],
            'success',
            ['__actor_email' => (string) $user['email'], 'demo' => true],
            $request->ip(),
        );

        Response::json([
            'user' => [
                'id' => (string) $user['id'],
                'name' => (string) $user['name'],
                'email' => (string) $user['email'],
                'role' => (string) $user['role'],
                'employeeId' => $user['employee_id'] !== null ? (string) $user['employee_id'] : null,
                'avatarSeed' => (string) ($user['avatar_seed'] ?? ''),
            ],
            'csrfToken' => $session['csrf_token'],
            'permissions' => $this->app->rbac->permissionsFor((string) $user['role']),
            'demoMode' => true,
        ]);
    }

    /** GET /api/auth/me */
    public function me(Request $request): void
    {
        $user = $this->requireUser($request);
        Response::json([
            'user' => Mapper::user([
                'id' => $user['id'],
                'name' => $user['name'],
                'email' => $user['email'],
                'role' => $user['role'],
                'employee_id' => $user['employee_id'],
                'avatar_seed' => $user['avatar_seed'],
            ]),
            'permissions' => $this->app->rbac->permissionsFor((string) $user['role']),
            'csrfToken' => (string) ($request->attribute('session')['csrf_token'] ?? ''),
            'demoMode' => $this->app->config->bool('app.demo_mode', false),
        ]);
    }

    /** POST /api/auth/password */
    public function changePassword(Request $request): void
    {
        $user = $this->requireUser($request);
        $data = $this->validated($request, [
            'currentPassword' => 'required|string|max:200',
            'newPassword' => 'required|string|min:12|max:200',
        ]);

        $minLength = $this->app->config->int('security.password_min_length', 12);
        if (mb_strlen((string) $data['newPassword']) < $minLength) {
            Response::error('validation_failed', 'The new password is too short.', 422, [
                'fields' => ['newPassword' => ["The new password must be at least {$minLength} characters."]],
            ]);
            return;
        }
        if ((string) $data['currentPassword'] === (string) $data['newPassword']) {
            Response::error('validation_failed', 'Choose a different password.', 422, [
                'fields' => ['newPassword' => ['The new password must differ from the current one.']],
            ]);
            return;
        }

        $record = $this->users->findById((int) $user['id']);
        if ($record === null || !password_verify((string) $data['currentPassword'], (string) $record['password_hash'])) {
            $this->app->audit->log((int) $user['id'], 'password.change', 'user', (string) $user['email'], 'failure', [], $request->ip());
            Response::error('invalid_credentials', 'Your current password is incorrect.', 401);
            return;
        }

        $this->users->updatePassword((int) $user['id'], password_hash((string) $data['newPassword'], PASSWORD_DEFAULT));
        // Every other session for this account is invalidated; the one making
        // the request stays signed in.
        $this->sessions->revokeAllForUserExcept(
            (int) $user['id'],
            (string) ($request->attribute('session')['id'] ?? ''),
        );
        $this->app->audit->log((int) $user['id'], 'password.change', 'user', (string) $user['email'], 'success', [], $request->ip());

        Response::json(['ok' => true, 'message' => 'Password updated. Please sign in again on other devices.']);
    }

    /** GET /api/auth/sessions */
    public function sessions(Request $request): void
    {
        $user = $this->requireUser($request);
        $rows = $this->app->db->select(
            'SELECT id, ip_address, user_agent, created_at, last_seen_at, expires_at
             FROM sessions WHERE user_id = ? AND revoked_at IS NULL ORDER BY last_seen_at DESC',
            [(int) $user['id']],
        );
        $current = (string) ($request->attribute('session')['id'] ?? '');

        Response::json(array_map(static fn (array $row): array => [
            'id' => substr((string) $row['id'], 0, 12),
            'device' => self::describeDevice((string) $row['user_agent']),
            'browser' => self::describeBrowser((string) $row['user_agent']),
            'os' => self::describeOs((string) $row['user_agent']),
            'ip' => (string) $row['ip_address'],
            'location' => null,
            'signedInAt' => (string) $row['created_at'],
            'lastActiveAt' => (string) $row['last_seen_at'],
            'current' => hash_equals((string) $row['id'], $current),
        ], $rows));
    }

    /** DELETE /api/auth/sessions/{id} */
    public function revokeSession(Request $request, array $params): void
    {
        $user = $this->requireUser($request);
        $id = (string) ($params['id'] ?? '');
        // Sessions are addressed by a short prefix; resolve it to the full
        // hash before touching anything.
        $rows = $this->app->db->select('SELECT id FROM sessions WHERE user_id = ? AND revoked_at IS NULL', [(int) $user['id']]);
        foreach ($rows as $row) {
            if (str_starts_with((string) $row['id'], $id)) {
                $this->sessions->revoke((string) $row['id']);
                $this->app->audit->log((int) $user['id'], 'session.revoked', 'session', $id, 'success', [], $request->ip());
                Response::json(['ok' => true]);
                return;
            }
        }
        Response::error('not_found', 'Session not found.', 404);
    }

    private static function describeDevice(string $userAgent): string
    {
        return str_contains($userAgent, 'Mobile') ? 'Mobile device' : 'Desktop device';
    }

    private static function describeBrowser(string $userAgent): string
    {
        foreach (['Edg', 'Chrome', 'Firefox', 'Safari'] as $browser) {
            if (str_contains($userAgent, $browser)) {
                return $browser;
            }
        }
        return 'Unknown browser';
    }

    private static function describeOs(string $userAgent): string
    {
        foreach (['Windows', 'Mac OS', 'Android', 'iPhone', 'Linux'] as $os) {
            if (str_contains($userAgent, $os)) {
                return $os;
            }
        }
        return 'Unknown OS';
    }

    /** GET /api/auth/password-policy — documents the rules the UI enforces. */
    public function passwordPolicy(Request $request): void
    {
        $this->requireUser($request);
        Response::json([
            'minLength' => $this->app->config->int('security.password_min_length', 12),
            'maxLength' => 200,
        ]);
    }
}
