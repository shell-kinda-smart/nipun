<?php

declare(strict_types=1);

namespace PayLens\Controllers;

use PayLens\Core\App;
use PayLens\Core\Request;
use PayLens\Core\Response;
use PayLens\Repositories\TaxSlabRepository;
use PayLens\Repositories\UserRepository;
use PayLens\Support\Mapper;

/**
 * Settings: the signed-in user's own profile, preferences and billing.
 *
 * Everything here is scoped to the session's user; a user can only ever
 * change their own settings.
 */
final class SettingsController extends Controller
{
    private UserRepository $users;
    private TaxSlabRepository $slabs;

    public function __construct(App $app)
    {
        parent::__construct($app);
        $this->users = new UserRepository($app->db);
        $this->slabs = new TaxSlabRepository($app->db);
    }

    /** GET /api/settings/profile */
    public function profile(Request $request): void
    {
        $user = $this->requireUser($request);
        $record = $this->users->findById((int) $user['id']);
        Response::json([
            'data' => [
                'id' => (string) $user['id'],
                'name' => (string) ($record['name'] ?? $user['name']),
                'email' => (string) ($record['email'] ?? $user['email']),
                'role' => (string) $user['role'],
                'employeeId' => $user['employee_id'],
                'avatarSeed' => (string) ($record['avatar_seed'] ?? ''),
                'permissions' => $this->app->rbac->permissionsFor((string) $user['role']),
            ],
        ]);
    }

    /** PUT /api/settings/profile */
    public function updateProfile(Request $request): void
    {
        $user = $this->requireUser($request);
        $data = $this->validated($request, [
            'name' => 'nullable|string|max:120',
        ]);

        if (isset($data['name']) && trim((string) $data['name']) !== '') {
            $this->users->updateProfile((int) $user['id'], (string) $data['name'], $user['avatar_seed'] ?? null);
            $this->app->audit->log(
                $this->actorId($request),
                'settings.updated',
                'user',
                (string) $user['email'],
                'success',
                ['fields' => ['name']],
                $request->ip(),
            );
        }

        $record = $this->users->findById((int) $user['id']);
        Response::json($record !== null ? \PayLens\Support\Mapper::user($record) : null);
    }

    /** GET /api/settings/preferences */
    public function preferences(Request $request): void
    {
        $user = $this->requireUser($request);
        $row = $this->app->db->selectOne(
            'SELECT * FROM user_preferences WHERE user_id = ?',
            [(int) $user['id']],
        ) ?? [];

        Response::json([
            'data' => [
                'emailNotifications' => (bool) ($row['email_notifications'] ?? true),
                'pushNotifications' => (bool) ($row['push_notifications'] ?? true),
                'desktopAlerts' => (bool) ($row['desktop_alerts'] ?? true),
                'autoLock' => (bool) ($row['auto_lock'] ?? false),
                'newDeviceAlerts' => (bool) ($row['new_device_alerts'] ?? true),
                'timezone' => (string) ($row['timezone'] ?? 'UTC'),
            ],
        ]);
    }

    /** PUT /api/settings/preferences */
    public function updatePreferences(Request $request): void
    {
        $user = $this->requireUser($request);
        $data = $this->validated($request, [
            'emailNotifications' => 'nullable|boolean',
            'pushNotifications' => 'nullable|boolean',
            'desktopAlerts' => 'nullable|boolean',
            'autoLock' => 'nullable|boolean',
            'newDeviceAlerts' => 'nullable|boolean',
            'timezone' => 'nullable|string|max:64',
        ]);

        $this->app->db->upsert(
            'user_preferences',
            [
                'user_id' => (int) $user['id'],
                'email_notifications' => (int) (bool) ($data['emailNotifications'] ?? true),
                'push_notifications' => (int) (bool) ($data['pushNotifications'] ?? true),
                'desktop_alerts' => (int) (bool) ($data['desktopAlerts'] ?? true),
                'auto_lock' => (int) (bool) ($data['autoLock'] ?? false),
                'new_device_alerts' => (int) (bool) ($data['newDeviceAlerts'] ?? true),
                'timezone' => (string) ($data['timezone'] ?? 'UTC'),
                'updated_at' => (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s'),
            ],
            [
                'email_notifications', 'push_notifications', 'desktop_alerts',
                'auto_lock', 'new_device_alerts', 'timezone', 'updated_at',
            ],
            ['user_id'],
        );

        $this->app->audit->log(
            $this->actorId($request),
            'settings.updated',
            'user',
            (string) $user['email'],
            'success',
            ['fields' => array_keys($data)],
            $request->ip(),
        );

        $this->preferences($request);
    }

    /** GET /api/settings/billing */
    public function billing(Request $request): void
    {
        $user = $this->requireUser($request);

        $invoices = $this->app->db->select(
            'SELECT * FROM billing_invoices WHERE user_id IS NULL OR user_id = ? ORDER BY issued_at DESC',
            [(int) $user['id']],
        );

        Response::json([
            'data' => [
                'plan' => 'Growth',
                'seatsUsed' => (int) ($this->app->db->selectOne(
                    "SELECT COUNT(*) AS c FROM employees WHERE is_deleted = 0 AND employment_status <> 'exited'",
                )['c'] ?? 0),
                'seatLimit' => 250,
                'invoices' => array_map(static fn (array $row): array => [
                    'id' => (string) $row['id'],
                    'amount' => Mapper::rupees($row['amount_paise']),
                    'date' => (string) $row['issued_at'],
                    'status' => (string) $row['status'],
                ], $invoices),
            ],
        ]);
    }

    /** GET /api/settings/tax-slabs */
    public function taxSlabs(Request $request): void
    {
        // The tax slab table is part of the settings, so it is behind the
        // settings permission rather than open to any signed-in account.
        $this->requirePermission($request, 'settings:read');
        $slabs = $this->slabs->withCounts($this->slabs->all());
        Response::json(array_map(static fn (array $s): array => [
            'label' => $s['label'],
            'rate' => ($s['rateBasisPoints'] / 100) . '%',
            'count' => $s['count'],
            'jurisdiction' => $s['jurisdiction'],
            'notes' => $s['notes'],
        ], $slabs));
    }
}
