<?php

declare(strict_types=1);

namespace PayLens\Services;

use PayLens\Core\Database;

/**
 * Reads the configurable payroll rules.
 *
 * Rules are data, not code: each one has a jurisdiction, an effective
 * window and a basis, so a rule that is not verified for a jurisdiction is
 * simply left unconfigured rather than guessed at in code.
 *
 * The seeded rules reproduce the values the demo UI already displayed and
 * are explicitly labelled as demo defaults — they are not statutory rates
 * and must not be presented as tax advice.
 */
final class RuleRepository
{
    public function __construct(private Database $db)
    {
    }

    /**
     * All enabled rules in force on a given date, keyed by code.
     *
     * @return array<string,array<string,mixed>>
     */
    public function rulesFor(string $date): array
    {
        $rows = $this->db->select(
            'SELECT * FROM payroll_rules
             WHERE enabled = 1
               AND effective_from <= ?
               AND (effective_to IS NULL OR effective_to >= ?)
             ORDER BY code',
            [$date, $date],
        );

        $rules = [];
        foreach ($rows as $row) {
            $rules[(string) $row['code']] = $row;
        }
        return $rules;
    }

    /** @return array<string,mixed>|null */
    public function rule(string $code, string $date): ?array
    {
        return $this->rulesFor($date)[$code] ?? null;
    }

    /** @return array<int,array<string,mixed>> */
    public function all(): array
    {
        return $this->db->select('SELECT * FROM payroll_rules ORDER BY code');
    }

    /**
     * A JSON snapshot of the rules in force, stored on a payroll run so the
     * run can be explained later even if a rule is edited or retired.
     *
     * @return array<string,mixed>
     */
    public function snapshot(string $date): array
    {
        $snapshot = [];
        foreach ($this->rulesFor($date) as $code => $rule) {
            $snapshot[$code] = [
                'basis' => (string) $rule['basis'],
                'rate_basis_points' => $rule['rate_basis_points'] !== null ? (int) $rule['rate_basis_points'] : null,
                'amount_paise' => $rule['amount_paise'] !== null ? (int) $rule['amount_paise'] : null,
                'cap_paise' => $rule['cap_paise'] !== null ? (int) $rule['cap_paise'] : null,
                'jurisdiction' => (string) $rule['jurisdiction'],
            ];
        }
        return $snapshot;
    }
}
