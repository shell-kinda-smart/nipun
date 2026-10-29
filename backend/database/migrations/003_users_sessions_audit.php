<?php

declare(strict_types=1);

use PayLens\Core\Database;
use PayLens\Core\Schema;

/**
 * Users, sessions, rate limits and the audit trail.
 *
 * Passwords are stored only as password_hash() digests. Sessions are
 * server-side records; the browser holds an opaque token whose SHA-256
 * digest is the primary key, so a database dump cannot be replayed.
 */
return [
    'up' => static function (Database $db): void {
        (new Schema($db, 'users'))
            ->id()
            ->string('email', 160)
            ->string('password_hash', 255)
            ->string('name', 120)
            ->string('role', 32)
            ->string('status', 16, false, 'active')
            ->string('employee_id', 32, true)
            ->string('avatar_seed', 64, true)
            ->int('failed_login_count', false, 0)
            ->dateTime('locked_until', true)
            ->dateTime('last_login_at', true)
            ->dateTime('created_at')
            ->dateTime('updated_at')
            ->unique('email')
            ->index('role')
            ->foreignKey('role', 'roles', 'name', 'RESTRICT')
            ->foreignKey('employee_id', 'employees', 'id', 'SET NULL')
            ->create();

        (new Schema($db, 'sessions'))
            ->string('id', 64)
            ->bigInt('user_id')
            ->string('csrf_token', 64)
            ->string('ip_address', 45, true)
            ->string('user_agent', 255, true)
            ->dateTime('created_at')
            ->dateTime('last_seen_at')
            ->dateTime('expires_at')
            ->dateTime('revoked_at', true)
            ->primary('id')
            ->index('user_id')
            ->index('expires_at')
            ->foreignKey('user_id', 'users', 'id', 'CASCADE')
            ->create();

        (new Schema($db, 'rate_limits'))
            ->string('id', 64)
            ->int('attempts', false, 0)
            ->dateTime('window_started_at')
            ->primary('id')
            ->create();

        (new Schema($db, 'audit_logs'))
            ->id()
            ->bigInt('actor_user_id', true)
            ->string('actor_email', 160, true)
            ->string('action', 64)
            ->string('entity_type', 64)
            ->string('entity_id', 64, true)
            ->string('outcome', 16, false, 'success')
            ->json('metadata')
            ->string('ip_address', 45, true)
            ->dateTime('created_at')
            ->index('actor_user_id')
            ->index('entity_type', 'entity_id')
            ->index('created_at')
            ->foreignKey('actor_user_id', 'users', 'id', 'SET NULL')
            ->create();
    },
];
