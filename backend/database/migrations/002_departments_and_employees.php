<?php

declare(strict_types=1);

use PayLens\Core\Database;
use PayLens\Core\Schema;

/**
 * Organisation: departments and employees.
 *
 * Employee identifiers are stable strings (EMP001) rather than auto-increment
 * integers, because they appear on payslips, exports and audit records where
 * a stable, human-readable code matters.
 *
 * Employees are never hard-deleted: `is_deleted` archives them, so historical
 * payroll records keep their foreign keys intact.
 */
return [
    'up' => static function (Database $db): void {
        (new Schema($db, 'departments'))
            ->string('id', 32)
            ->string('name', 80)
            ->string('color', 64)
            ->string('icon', 40, true)
            ->dateTime('created_at')
            ->dateTime('updated_at')
            ->primary('id')
            ->create();

        (new Schema($db, 'employees'))
            ->string('id', 32)
            ->string('first_name', 60)
            ->string('last_name', 60)
            ->string('email', 160)
            ->string('phone', 32, true)
            ->string('department_id', 32)
            ->string('designation', 80)
            ->string('employment_status', 24, false, 'active')
            ->string('employment_type', 24, true)
            ->date('date_of_joining')
            ->date('date_of_birth', true)
            ->string('gender', 16, true)
            ->string('app_role', 32, true)
            ->int('performance_rating', true)
            ->string('avatar_seed', 64, true)
            ->bool('is_deleted', false)
            ->dateTime('created_at')
            ->dateTime('updated_at')
            ->primary('id')
            ->unique('email')
            ->index('department_id')
            ->index('employment_status')
            ->foreignKey('department_id', 'departments', 'id', 'RESTRICT')
            ->create();
    },
];
