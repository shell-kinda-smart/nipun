<?php

declare(strict_types=1);

/**
 * The role and permission matrix — the single source of truth.
 *
 * Both the development seed and the migration that keeps existing
 * databases in step read this file, so the two can never drift apart.
 *
 * `finance` prepares payroll and records payments but cannot approve it:
 * approval belongs to `approver`, which is what gives the payroll process
 * its separation of duties.
 */
return [
    'roles' => [
        'admin' => ['Admin', 'Complete system control · users · settings · audit'],
        'hr' => ['HR Manager', 'Employees · workforce analytics · documents'],
        'finance' => ['Finance Manager', 'Payroll preparation · payments · reports'],
        'approver' => ['Payroll Approver', 'Approval decisions · final settlement sign-off'],
        'employee' => ['Employee', 'Your salary · payslips · tax information'],
    ],

    'permissions' => [
        'employees:read' => 'View employee records',
        'employees:write' => 'Create and edit employee records',
        'employees:hold' => 'Place and release employee holds',
        'payroll:read' => 'View payroll and payslips',
        'payroll:process' => 'Calculate payroll',
        'payroll:select' => 'Select the employees a run covers',
        'payroll:submit' => 'Submit payroll for approval',
        'payroll:approve' => 'Approve payroll',
        'payroll:reject' => 'Reject a submitted payroll',
        'payroll:pay' => 'Record employee payments',
        'reports:read' => 'View reports',
        'reports:export' => 'Export reports',
        'reports:schedule' => 'Schedule recurring reports',
        'analytics:read' => 'View analytics',
        'audit:read' => 'View the audit trail',
        'audit:export' => 'Export the audit trail',
        'settings:read' => 'View settings',
        'settings:write' => 'Change settings',
        'anomalies:read' => 'View anomalies',
        'anomalies:resolve' => 'Resolve anomalies',
        'schedules:read' => 'View schedules',
        'schedules:write' => 'Manage schedules',
        'jobs:read' => 'View background jobs',
        'jobs:retry' => 'Retry failed jobs',
        'termination:read' => 'View termination requests',
        'termination:write' => 'Raise and manage termination requests',
        'termination:approve' => 'Approve terminations and issue notices',
        'settlement:read' => 'View final settlements',
        'settlement:approve' => 'Approve final settlements',
    ],

    'matrix' => [
        'admin' => [
            'employees:read', 'employees:write', 'employees:hold',
            'payroll:read', 'payroll:process', 'payroll:select', 'payroll:submit',
            'payroll:approve', 'payroll:reject', 'payroll:pay',
            'reports:read', 'reports:export', 'reports:schedule',
            'analytics:read',
            'audit:read', 'audit:export',
            'settings:read', 'settings:write',
            'anomalies:read', 'anomalies:resolve',
            'schedules:read', 'schedules:write',
            'jobs:read', 'jobs:retry',
            'termination:read', 'termination:write', 'termination:approve',
            'settlement:read', 'settlement:approve',
        ],
        'hr' => [
            'employees:read', 'employees:write', 'employees:hold',
            'payroll:read',
            'reports:read', 'reports:export', 'reports:schedule',
            'analytics:read',
            'audit:read',
            'anomalies:read',
            'termination:read', 'termination:write',
            'settlement:read',
        ],
        'finance' => [
            'employees:read',
            'payroll:read', 'payroll:process', 'payroll:select', 'payroll:submit', 'payroll:pay',
            'reports:read', 'reports:export', 'reports:schedule',
            'analytics:read',
            'audit:read', 'audit:export',
            'anomalies:read', 'anomalies:resolve',
            'schedules:read', 'schedules:write',
            'settlement:read',
        ],
        'approver' => [
            'payroll:read', 'payroll:approve', 'payroll:reject',
            'reports:read',
            'analytics:read',
            'audit:read',
            'schedules:read',
            'termination:read', 'termination:approve',
            'settlement:read', 'settlement:approve',
        ],
        'employee' => ['payroll:read'],
    ],
];
