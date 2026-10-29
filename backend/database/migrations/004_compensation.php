<?php

declare(strict_types=1);

use PayLens\Core\Database;
use PayLens\Core\Schema;

/**
 * Versioned compensation.
 *
 * A salary change never overwrites an earlier row: the previous structure is
 * closed off with `effective_to` and a new row is inserted. That is what
 * lets a finalized payroll run keep the numbers it was calculated with,
 * even after an employee's compensation has changed.
 *
 * All amounts are integer paise.
 */
return [
    'up' => static function (Database $db): void {
        (new Schema($db, 'salary_structures'))
            ->id()
            ->string('employee_id', 32)
            ->date('effective_from')
            ->date('effective_to', true)
            ->bigInt('basic_paise')
            ->bigInt('hra_paise', false, 0)
            ->bigInt('special_allowance_paise', false, 0)
            ->bigInt('travel_allowance_paise', false, 0)
            ->bigInt('pf_paise', false, 0)
            ->bigInt('professional_tax_paise', false, 0)
            ->bigInt('ctc_annual_paise', true)
            ->string('status', 16, false, 'active')
            ->bigInt('created_by', true)
            ->dateTime('created_at')
            ->dateTime('updated_at')
            ->index(['employee_id', 'effective_from'])
            ->foreignKey('employee_id', 'employees', 'id', 'CASCADE')
            ->foreignKey('created_by', 'users', 'id', 'SET NULL')
            ->create();

        // Bank details are versioned for the same reason as compensation:
        // a payslip must show the account that was paid, not today's.
        (new Schema($db, 'employee_bank_details'))
            ->id()
            ->string('employee_id', 32)
            ->date('effective_from')
            ->date('effective_to', true)
            ->string('account_number', 32)
            ->string('ifsc', 16)
            ->string('bank_name', 80)
            ->dateTime('created_at')
            ->index(['employee_id', 'effective_from'])
            ->foreignKey('employee_id', 'employees', 'id', 'CASCADE')
            ->create();

        (new Schema($db, 'employee_attendance'))
            ->id()
            ->string('employee_id', 32)
            ->int('period_month')
            ->int('period_year')
            ->int('working_days', false, 0)
            ->int('days_present', false, 0)
            ->int('days_absent', false, 0)
            ->int('days_late', false, 0)
            ->int('leaves', false, 0)
            ->dateTime('created_at')
            ->unique(['employee_id', 'period_year', 'period_month'])
            ->foreignKey('employee_id', 'employees', 'id', 'CASCADE')
            ->create();
    },
];
