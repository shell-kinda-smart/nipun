<?php

declare(strict_types=1);

namespace PayLens\Core;

/**
 * Role-based access control.
 *
 * The permission matrix lives in the database (roles / permissions /
 * role_permissions) so it can be administered without a code change, but it
 * is seeded with exactly the matrix the frontend already uses, so the two
 * can never silently drift:
 *
 *   admin    — everything
 *   hr       — employees, read-only payroll, reports, analytics, audit
 *   finance  — payroll processing and approval, reports, analytics, audit
 *   employee — read-only payroll (own records only; enforced by scoping)
 */
final class Rbac
{
    public const ROLE_ADMIN = 'admin';
    public const ROLE_HR = 'hr';
    public const ROLE_FINANCE = 'finance';
    public const ROLE_EMPLOYEE = 'employee';

    /** @var array<string,array<int,string>>|null */
    private ?array $matrix = null;

    public function __construct(private Database $db)
    {
    }

    /** @return array<int,string> */
    public function permissionsFor(string $role): array
    {
        $matrix = $this->matrix();
        return $matrix[$role] ?? [];
    }

    public function has(string $role, string $permission): bool
    {
        return in_array($permission, $this->permissionsFor($role), true);
    }

    /** @return array<string,array<int,string>> */
    public function matrix(): array
    {
        if ($this->matrix !== null) {
            return $this->matrix;
        }

        $matrix = [];
        try {
            $rows = $this->db->select(
                'SELECT rp.role_name, p.name
                 FROM role_permissions rp
                 JOIN permissions p ON p.name = rp.permission_name
                 ORDER BY rp.role_name, p.name',
            );
            foreach ($rows as $row) {
                $matrix[(string) $row['role_name']][] = (string) $row['name'];
            }
        } catch (\Throwable) {
            // Before the schema is migrated there is no matrix to read;
            // authorisation then fails closed.
            $matrix = [];
        }

        $this->matrix = $matrix;
        return $matrix;
    }

    public function forget(): void
    {
        $this->matrix = null;
    }
}
