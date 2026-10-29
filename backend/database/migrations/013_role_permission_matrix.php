<?php

declare(strict_types=1);

use PayLens\Core\Database;

/**
 * Keep the role and permission matrix in step with `database/roles.php`.
 *
 * Additive and idempotent: it inserts the roles, permissions and mappings
 * that are missing and never removes one, so an existing database keeps
 * every account and every grant it already had.
 *
 * The writes use `insertIgnore`, so the statement is a single round trip per
 * row and never has to read the table first. That also keeps the migration
 * renderable for the MySQL dialect check, which never opens a connection.
 */
return [
    'up' => static function (Database $db): void {
        /** @var array{roles:array<string,array{0:string,1:string}>,permissions:array<string,string>,matrix:array<string,array<int,string>>} $config */
        $config = require dirname(__DIR__) . '/roles.php';
        $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');

        foreach ($config['roles'] as $name => [$label, $description]) {
            $db->insertIgnore('roles', [
                'name' => $name,
                'label' => $label,
                'description' => $description,
                'created_at' => $now,
            ]);
        }

        foreach ($config['permissions'] as $name => $description) {
            $db->insertIgnore('permissions', [
                'name' => $name,
                'description' => $description,
            ]);
        }

        foreach ($config['matrix'] as $role => $permissions) {
            foreach ($permissions as $permission) {
                $db->insertIgnore('role_permissions', [
                    'role_name' => $role,
                    'permission_name' => $permission,
                ]);
            }
        }
    },
];
