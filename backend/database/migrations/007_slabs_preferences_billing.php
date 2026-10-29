<?php

declare(strict_types=1);

use PayLens\Core\Database;
use PayLens\Core\Schema;

/**
 * Tax slabs, per-user preferences and billing records.
 *
 * The slabs are configuration, not law: each row carries a jurisdiction and
 * a note. The seeded values reproduce the demo the UI already displayed and
 * are explicitly flagged as demo defaults. Employee counts are always
 * derived from the data, never stored.
 */
return [
    'up' => static function (Database $db): void {
        (new Schema($db, 'tax_slabs'))
            ->id()
            ->string('code', 40)
            ->string('label', 60)
            ->bigInt('lower_bound_paise')
            ->bigInt('upper_bound_paise', true)
            ->int('rate_basis_points', false, 0)
            ->string('jurisdiction', 64, false, 'demo')
            ->bool('enabled', true)
            ->text('notes', true)
            ->dateTime('created_at')
            ->dateTime('updated_at')
            ->unique('code')
            ->index(['lower_bound_paise', 'upper_bound_paise'])
            ->create();

        (new Schema($db, 'user_preferences'))
            ->bigInt('user_id')
            ->bool('email_notifications', true)
            ->bool('push_notifications', true)
            ->bool('desktop_alerts', true)
            ->bool('auto_lock', false)
            ->bool('new_device_alerts', true)
            ->string('timezone', 64, false, 'UTC')
            ->string('theme', 16, false, 'system')
            ->dateTime('updated_at')
            ->primary('user_id')
            ->foreignKey('user_id', 'users', 'id', 'CASCADE')
            ->create();

        (new Schema($db, 'billing_invoices'))
            ->string('id', 32)
            ->bigInt('user_id', true)
            ->bigInt('amount_paise', false, 0)
            ->string('currency', 8, false, 'INR')
            ->date('issued_at')
            ->string('status', 16, false, 'paid')
            ->dateTime('created_at')
            ->primary('id')
            ->index('user_id')
            ->create();
    },
];
