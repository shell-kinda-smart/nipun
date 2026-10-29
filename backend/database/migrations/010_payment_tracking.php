<?php

declare(strict_types=1);

use PayLens\Core\Database;
use PayLens\Core\Schema;

/**
 * Employee payment tracking.
 *
 * A finalized payroll run says the money was *calculated and approved*.
 * It says nothing about whether the money reached the employee. Payment is
 * therefore tracked separately, per employee, with its own history.
 */
return [
    'up' => static function (Database $db): void {
        (new Schema($db, 'payment_records'))
            ->id()
            ->string('payroll_run_id', 32)
            ->string('employee_id', 32)
            ->string('status', 16, false, 'pending')
            ->bigInt('amount_paise', false, 0)
            ->string('method', 32, false, 'manual')
            ->string('reference', 120, true)
            ->dateTime('paid_at', true)
            ->string('failure_reason', 255, true)
            ->bool('is_manual', true)
            ->bigInt('recorded_by', true)
            ->dateTime('created_at')
            ->dateTime('updated_at')
            ->unique(['payroll_run_id', 'employee_id'])
            ->index(['status', 'payroll_run_id'])
            ->foreignKey('payroll_run_id', 'payroll_runs', 'id', 'CASCADE')
            ->foreignKey('employee_id', 'employees', 'id', 'RESTRICT')
            ->foreignKey('recorded_by', 'users', 'id', 'SET NULL')
            ->create();

        (new Schema($db, 'payment_status_history'))
            ->id()
            ->bigInt('payment_record_id')
            ->string('previous_status', 16, true)
            ->string('new_status', 16)
            ->bigInt('amount_paise', false, 0)
            ->string('reference', 120, true)
            ->string('note', 255, true)
            ->bigInt('changed_by', true)
            ->dateTime('changed_at')
            ->index('payment_record_id')
            ->foreignKey('payment_record_id', 'payment_records', 'id', 'CASCADE')
            ->foreignKey('changed_by', 'users', 'id', 'SET NULL')
            ->create();
    },
];
