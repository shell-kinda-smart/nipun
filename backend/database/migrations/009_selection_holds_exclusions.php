<?php

declare(strict_types=1);

use PayLens\Core\Database;
use PayLens\Core\Schema;

/**
 * Employee selection, holds and exclusions for a payroll run.
 *
 * A run now records exactly who it covers, and why anyone was left out.
 * The selection is stored, so a finalized run can always explain itself.
 *
 * Incremental: the new columns on payroll_runs are added only when they are
 * missing, so an existing database keeps its history.
 */
return [
    'up' => static function (Database $db): void {
        $db->addColumnIfMissing('payroll_runs', 'submitted_at', 'DATETIME NULL');
        $db->addColumnIfMissing('payroll_runs', 'submitted_by', 'BIGINT NULL');
        $db->addColumnIfMissing('payroll_runs', 'rejected_at', 'DATETIME NULL');
        $db->addColumnIfMissing('payroll_runs', 'rejected_by', 'BIGINT NULL');
        $db->addColumnIfMissing('payroll_runs', 'rejection_reason', 'VARCHAR(500) NULL');
        $db->addColumnIfMissing('payroll_runs', 'finalized_by', 'BIGINT NULL');
        $db->addColumnIfMissing('payroll_runs', 'selection_locked', 'TINYINT(1) NOT NULL DEFAULT 0');

        // ── Who a run covers ────────────────────────────────────────────
        (new Schema($db, 'payroll_run_employees'))
            ->id()
            ->string('payroll_run_id', 32)
            ->string('employee_id', 32)
            ->string('status', 16, false, 'selected')
            ->bool('included', true)
            ->string('exclusion_reason', 255, true)
            ->string('excluded_by', 160, true)
            ->dateTime('excluded_at', true)
            ->bigInt('basic_paise', true)
            ->dateTime('created_at')
            ->dateTime('updated_at')
            ->unique(['payroll_run_id', 'employee_id'])
            ->index(['payroll_run_id', 'status'])
            ->foreignKey('payroll_run_id', 'payroll_runs', 'id', 'CASCADE')
            ->foreignKey('employee_id', 'employees', 'id', 'CASCADE')
            ->create();

        // ── Temporary holds ─────────────────────────────────────────────
        // A hold is a standing condition on an employee (on leave, on a
        // suspension, awaiting documentation). It is different from being
        // excluded from one specific run.
        (new Schema($db, 'employee_holds'))
            ->id()
            ->string('employee_id', 32)
            ->string('category', 32, false, 'temporary')
            ->string('reason', 255)
            ->text('notes', true)
            ->date('effective_from')
            ->date('effective_to', true)
            ->string('status', 16, false, 'active')
            ->bigInt('created_by', true)
            ->bigInt('released_by', true)
            ->dateTime('released_at', true)
            ->dateTime('created_at')
            ->dateTime('updated_at')
            ->index(['employee_id', 'status'])
            ->index('status')
            ->foreignKey('employee_id', 'employees', 'id', 'CASCADE')
            ->foreignKey('created_by', 'users', 'id', 'SET NULL')
            ->foreignKey('released_by', 'users', 'id', 'SET NULL')
            ->create();

        // ── Account access policy ───────────────────────────────────────
        $db->addColumnIfMissing('employees', 'access_status', "VARCHAR(16) NOT NULL DEFAULT 'active'");
        $db->addColumnIfMissing('employees', 'access_revoked_at', 'DATETIME NULL');
        $db->addColumnIfMissing('employees', 'access_revoked_reason', 'VARCHAR(255) NULL');
        $db->addColumnIfMissing('employees', 'terminated_at', 'DATETIME NULL');
    },
];
