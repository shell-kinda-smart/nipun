<?php

declare(strict_types=1);

use PayLens\Core\Database;

/**
 * Bring the role matrix in line with `database/roles.php`.
 *
 * Migration 013 only ever adds what is missing, so a database seeded from an
 * older matrix keeps every grant it had — including grants that the current
 * matrix no longer allows. The clearest example is `payroll:approve`: the
 * matrix gives it to `approver` and `admin` only, because approving a run is
 * the one duty that has to sit with somebody other than the person who
 * prepared it.
 *
 * This migration removes the grants that contradict the matrix and leaves
 * everything else alone. It only ever deletes rows from `role_permissions`,
 * so no account, no role, no permission and no payroll record is affected.
 */
return [
    'up' => static function (Database $db): void {
        /** @var array{roles:array<string,array{0:string,1:string}>,permissions:array<string,string>,matrix:array<string,array<int,string>>} $config */
        $config = require dirname(__DIR__) . '/roles.php';

        $allowed = [];
        foreach ($config['matrix'] as $role => $permissions) {
            foreach ($permissions as $permission) {
                $allowed[$role . "\0" . $permission] = true;
            }
        }

        $rows = $db->select('SELECT role_name, permission_name FROM role_permissions');
        foreach ($rows as $row) {
            $role = (string) $row['role_name'];
            $permission = (string) $row['permission_name'];

            if (isset($allowed[$role . "\0" . $permission])) {
                continue;
            }

            $db->execute(
                'DELETE FROM role_permissions WHERE role_name = ? AND permission_name = ?',
                [$role, $permission],
            );
        }
    },
];
