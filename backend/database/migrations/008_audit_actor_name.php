<?php

declare(strict_types=1);

use PayLens\Core\Database;

/**
 * Records the display name of the actor on an audit entry.
 *
 * Added as an incremental change rather than by recreating the table: a
 * database that already holds audit history keeps it, and re-running this
 * migration on a fresh database is a no-op.
 */
return [
    'up' => static function (Database $db): void {
        $db->addColumnIfMissing('audit_logs', 'actor_name', 'VARCHAR(120) NULL');
    },
];
