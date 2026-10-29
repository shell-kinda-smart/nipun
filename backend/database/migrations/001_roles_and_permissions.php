<?php

declare(strict_types=1);

use PayLens\Core\Database;
use PayLens\Core\Schema;

/**
 * Role and permission tables.
 *
 * Seeded with exactly the matrix the frontend uses (src/data/constants.ts),
 * so authorisation on the server and the UI agree by construction.
 */
return [
    'up' => static function (Database $db): void {
        (new Schema($db, 'roles'))
            ->string('name', 32)
            ->string('label', 64)
            ->string('description', 255, true)
            ->dateTime('created_at')
            ->primary('name')
            ->create();

        (new Schema($db, 'permissions'))
            ->string('name', 64)
            ->string('description', 255, true)
            ->primary('name')
            ->create();

        (new Schema($db, 'role_permissions'))
            ->string('role_name', 32)
            ->string('permission_name', 64)
            ->primary(['role_name', 'permission_name'])
            ->foreignKey('role_name', 'roles', 'name', 'CASCADE')
            ->foreignKey('permission_name', 'permissions', 'name', 'CASCADE')
            ->create();
    },
];
