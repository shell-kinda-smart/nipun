<?php

declare(strict_types=1);

use PayLens\Core\Database;
use PayLens\Core\Schema;

/**
 * Payroll processing.
 *
 * `payroll_rules` holds the configurable calculation rules (jurisdiction,
 * effective dates, basis). It is deliberately seeded with the same values
 * the demo UI used, each flagged as a demo default rather than a statutory
 * rate — nothing here should be presented as tax advice.
 *
 * A run holds one period. `UNIQUE (year, month)` stops two runs being
 * created for the same period, and `UNIQUE (payroll_run_id, employee_id)`
 * on payslips stops one employee being paid twice in the same run.
 */
return [
    'up' => static function (Database $db): void {
        (new Schema($db, 'payroll_rules'))
            ->id()
            ->string('code', 64)
            ->string('name', 120)
            ->string('jurisdiction', 64, false, 'demo')
            ->string('basis', 24)
            ->int('rate_basis_points', true)
            ->bigInt('amount_paise', true)
            ->bigInt('cap_paise', true)
            ->date('effective_from')
            ->date('effective_to', true)
            ->bool('enabled', true)
            ->text('notes', true)
            ->dateTime('created_at')
            ->dateTime('updated_at')
            ->unique('code')
            ->create();

        (new Schema($db, 'payroll_runs'))
            ->string('id', 32)
            ->int('period_month')
            ->int('period_year')
            ->string('status', 24, false, 'draft')
            ->int('employee_count', false, 0)
            ->bigInt('total_gross_paise', false, 0)
            ->bigInt('total_deductions_paise', false, 0)
            ->bigInt('total_net_paise', false, 0)
            ->bigInt('total_tax_paise', false, 0)
            ->json('rules_snapshot')
            ->bigInt('processed_by', true)
            ->bigInt('approved_by', true)
            ->dateTime('processed_at', true)
            ->dateTime('approved_at', true)
            ->dateTime('finalized_at', true)
            ->dateTime('created_at')
            ->dateTime('updated_at')
            ->primary('id')
            ->unique(['period_year', 'period_month'])
            ->index('status')
            ->foreignKey('processed_by', 'users', 'id', 'SET NULL')
            ->foreignKey('approved_by', 'users', 'id', 'SET NULL')
            ->create();

        (new Schema($db, 'payslips'))
            ->string('id', 64)
            ->string('payroll_run_id', 32)
            ->string('employee_id', 32)
            ->int('period_month')
            ->int('period_year')
            ->string('employee_name', 120)
            ->string('designation', 80)
            ->string('department_id', 32)
            ->string('department_name', 80)
            ->bigInt('basic_paise', false, 0)
            ->bigInt('gross_paise', false, 0)
            ->bigInt('total_deductions_paise', false, 0)
            ->bigInt('net_paise', false, 0)
            ->bigInt('tax_paise', false, 0)
            ->string('status', 24, false, 'draft')
            ->int('working_days', false, 0)
            ->int('days_present', false, 0)
            ->json('compensation_snapshot')
            ->dateTime('generated_at')
            ->dateTime('created_at')
            ->dateTime('updated_at')
            ->primary('id')
            ->unique(['payroll_run_id', 'employee_id'])
            ->index('employee_id')
            ->index(['period_year', 'period_month'])
            ->foreignKey('payroll_run_id', 'payroll_runs', 'id', 'CASCADE')
            ->foreignKey('employee_id', 'employees', 'id', 'RESTRICT')
            ->create();

        (new Schema($db, 'payslip_lines'))
            ->id()
            ->string('payslip_id', 64)
            ->string('kind', 16)
            ->string('code', 40)
            ->string('label', 120)
            ->bigInt('amount_paise', false, 0)
            ->int('sequence', false, 0)
            ->index('payslip_id')
            ->foreignKey('payslip_id', 'payslips', 'id', 'CASCADE')
            ->create();

        // Corrections to a finalized run are explicit adjustments, never an
        // in-place rewrite of the original payslip. A run-level reversal
        // (as opposed to a per-employee adjustment) has no employee.
        (new Schema($db, 'payroll_adjustments'))
            ->id()
            ->string('payroll_run_id', 32)
            ->string('employee_id', 32, true)
            ->string('kind', 24)
            ->bigInt('amount_paise', false, 0)
            ->text('reason')
            ->string('status', 16, false, 'pending')
            ->bigInt('created_by', true)
            ->bigInt('approved_by', true)
            ->dateTime('created_at')
            ->dateTime('approved_at', true)
            ->index('payroll_run_id')
            ->foreignKey('payroll_run_id', 'payroll_runs', 'id', 'CASCADE')
            ->foreignKey('employee_id', 'employees', 'id', 'RESTRICT')
            ->create();
    },
];
