<?php

declare(strict_types=1);

namespace PayLens\Controllers;

use PayLens\Core\App;
use PayLens\Core\HttpException;
use PayLens\Core\Request;
use PayLens\Core\ValidationException;
use PayLens\Core\Validator;

/**
 * Shared controller helpers.
 */
abstract class Controller
{
    public function __construct(protected App $app)
    {
    }

    /** @return array<string,mixed> */
    protected function requireUser(Request $request): array
    {
        $user = $request->attribute('user');
        if (!is_array($user)) {
            throw new HttpException('unauthenticated', 'Sign in to continue.', 401);
        }
        return $user;
    }

    protected function requirePermission(Request $request, string $permission): void
    {
        $user = $this->requireUser($request);
        if (!$this->app->rbac->has((string) $user['role'], $permission)) {
            throw new HttpException(
                'forbidden',
                'You do not have permission to perform this action.',
                403,
                ['required' => $permission],
            );
        }
    }

    protected function actorId(Request $request): ?int
    {
        $user = $request->attribute('user');
        return is_array($user) ? (int) $user['id'] : null;
    }

    /**
     * The employee record the signed-in account is linked to.
     */
    protected function ownEmployeeId(Request $request): ?string
    {
        $user = $this->requireUser($request);
        $id = $user['employee_id'] ?? null;
        return ($id === null || $id === '') ? null : (string) $id;
    }

    /**
     * Whether the signed-in account is limited to its own records.
     *
     * The `employee` role holds `payroll:read` so that it can read its own
     * payslips, but the permission does not widen what it may see: an
     * employee reads its own records, never the organisation's. Every
     * endpoint that would otherwise expose payroll, headcount or anomalies
     * to the whole company checks this first.
     */
    protected function isSelfScoped(Request $request): bool
    {
        $user = $this->requireUser($request);
        return (string) $user['role'] === 'employee';
    }

    protected function actorEmail(Request $request): ?string
    {
        $user = $request->attribute('user');
        return is_array($user) ? (string) $user['email'] : null;
    }

    /**
     * Validate the request body against a rule set.
     *
     * @param array<string,string> $rules
     * @return array<string,mixed>
     */
    protected function validated(Request $request, array $rules): array
    {
        try {
            return (new Validator($request->all()))->validate($rules);
        } catch (ValidationException $e) {
            throw new HttpException('validation_failed', $e->getMessage(), 422, ['fields' => $e->errors()]);
        }
    }

    protected function intParam(Request $request, string $key, int $default = 0): int
    {
        $value = $request->query($key, $default);
        return is_numeric($value) ? (int) $value : $default;
    }

    protected function stringParam(Request $request, string $key, string $default = ''): string
    {
        $value = $request->query($key, $default);
        return is_scalar($value) ? trim((string) $value) : $default;
    }
}
