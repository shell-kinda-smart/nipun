<?php

declare(strict_types=1);

use PayLens\Core\Database;
use PayLens\Core\Schema;

/**
 * Termination, the official letter, the employee's acknowledgement and the
 * final settlement.
 *
 * The workflow is deliberately explicit:
 *
 *   draft → submitted → approved → notice_issued → acknowledged
 *         → settled → completed
 *
 * Submitting a request never terminates anybody. A letter is only issued
 * after approval, and an acknowledgement only records that the employee
 * received it — never that they agreed to it.
 */
return [
    'up' => static function (Database $db): void {
        (new Schema($db, 'termination_requests'))
            ->string('id', 32)
            ->string('employee_id', 32)
            ->string('category', 32, false, 'resignation')
            ->text('reason')
            ->text('hr_notes', true)
            ->date('last_working_day')
            ->int('notice_period_days', false, 0)
            ->date('notice_served_from', true)
            ->string('status', 24, false, 'draft')
            ->bigInt('requested_by', true)
            ->dateTime('requested_at', true)
            ->bigInt('approver_id', true)
            ->dateTime('approved_at', true)
            ->dateTime('rejected_at', true)
            ->string('rejection_reason', 500, true)
            ->dateTime('notice_issued_at', true)
            ->dateTime('acknowledged_at', true)
            ->string('settlement_id', 32, true)
            ->dateTime('completed_at', true)
            ->dateTime('created_at')
            ->dateTime('updated_at')
            ->primary('id')
            ->index('employee_id')
            ->index('status')
            ->foreignKey('employee_id', 'employees', 'id', 'RESTRICT')
            ->foreignKey('requested_by', 'users', 'id', 'SET NULL')
            ->foreignKey('approver_id', 'users', 'id', 'SET NULL')
            ->create();

        (new Schema($db, 'termination_letters'))
            ->id()
            ->string('termination_request_id', 32)
            ->int('version', false, 1)
            ->string('reference', 64)
            ->mediumText('content_html')
            ->bigInt('issued_by', true)
            ->dateTime('issued_at', true)
            ->dateTime('superseded_at', true)
            ->dateTime('created_at')
            ->unique(['termination_request_id', 'version'])
            ->index('reference')
            ->foreignKey('termination_request_id', 'termination_requests', 'id', 'CASCADE')
            ->foreignKey('issued_by', 'users', 'id', 'SET NULL')
            ->create();

        (new Schema($db, 'termination_acknowledgements'))
            ->id()
            ->bigInt('termination_letter_id')
            ->string('termination_request_id', 32)
            ->string('employee_id', 32)
            ->dateTime('acknowledged_at')
            ->string('ip_address', 45, true)
            ->unique(['termination_letter_id', 'employee_id'])
            ->index('employee_id')
            ->foreignKey('termination_letter_id', 'termination_letters', 'id', 'CASCADE')
            ->foreignKey('termination_request_id', 'termination_requests', 'id', 'CASCADE')
            ->foreignKey('employee_id', 'employees', 'id', 'RESTRICT')
            ->create();

        (new Schema($db, 'settlements'))
            ->string('id', 32)
            ->string('termination_request_id', 32)
            ->string('employee_id', 32)
            ->string('status', 24, false, 'draft')
            ->bigInt('total_payable_paise', false, 0)
            ->bigInt('total_recoverable_paise', false, 0)
            ->bigInt('net_payable_paise', false, 0)
            ->dateTime('calculated_at', true)
            ->bigInt('approved_by', true)
            ->dateTime('approved_at', true)
            ->dateTime('finalized_at', true)
            ->dateTime('created_at')
            ->dateTime('updated_at')
            ->primary('id')
            ->unique('termination_request_id')
            ->index('employee_id')
            ->index('status')
            ->foreignKey('termination_request_id', 'termination_requests', 'id', 'CASCADE')
            ->foreignKey('employee_id', 'employees', 'id', 'RESTRICT')
            ->foreignKey('approved_by', 'users', 'id', 'SET NULL')
            ->create();

        (new Schema($db, 'settlement_items'))
            ->id()
            ->string('settlement_id', 32)
            ->string('code', 48)
            ->string('label', 120)
            ->string('kind', 16, false, 'earning')
            ->bigInt('amount_paise', false, 0)
            ->string('source', 32, false, 'manual')
            ->string('note', 255, true)
            ->int('sequence', false, 0)
            ->index('settlement_id')
            ->foreignKey('settlement_id', 'settlements', 'id', 'CASCADE')
            ->create();
    },
];
