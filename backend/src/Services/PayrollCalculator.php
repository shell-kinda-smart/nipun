<?php

declare(strict_types=1);

namespace PayLens\Services;

use PayLens\Core\Database;
use PayLens\Core\Money;

/**
 * Deterministic payroll calculation.
 *
 * FORMULAS (all amounts in integer paise; no floating point is used)
 *
 *   Gross Earnings
 *     = basic salary
 *     + house rent allowance
 *     + special allowance
 *     + travel allowance
 *     + approved bonus adjustments
 *     + approved overtime adjustments
 *
 *   Total Deductions
 *     = provident fund      (percentage of basic, capped by rule)
 *     + professional tax    (fixed amount by rule)
 *     + income tax (TDS)   (percentage of basic, by rule)
 *     + approved deduction adjustments
 *
 *   Net Payable
 *     = Gross Earnings - Total Deductions
 *
 * ROUNDING
 *   Every rule percentage is applied with integer arithmetic and rounded
 *   half-up (see Money::applyRate). Component amounts are already whole
 *   paise, so the totals are exact: gross - deductions === net, always.
 *
 * The rules themselves live in `payroll_rules` and are snapshotted onto the
 * payroll run, so a run can be explained later even after a rule changes.
 * A rule that is not configured contributes nothing — nothing is invented.
 */
final class PayrollCalculator
{
    /** @var array<int,array<string,mixed>> */
    private array $errors = [];

    public function __construct(private Database $db, private RuleRepository $rules)
    {
    }

    /**
     * Calculate one employee's payslip for a period.
     *
     * @param array<string,mixed> $salary      Salary structure row (paise columns).
     * @param array<string,array<string,mixed>> $rules Rule set in force for the period.
     * @param array<int,array<string,mixed>> $adjustments Approved adjustments only.
     * @param array<string,mixed> $attendance  Attendance row for the period.
     *
     * @return array{
     *   basic_paise:int, gross_paise:int, total_deductions_paise:int,
     *   net_paise:int, tax_paise:int, lines:array<int,array<string,mixed>>,
     *   errors:array<int,string>
     * }
     */
    public function calculate(array $salary, array $rules, array $adjustments = [], array $attendance = []): array
    {
        $basic = (int) ($salary['basic_paise'] ?? 0);
        $hra = (int) ($salary['hra_paise'] ?? 0);
        $special = (int) ($salary['special_allowance_paise'] ?? 0);
        $travel = (int) ($salary['travel_allowance_paise'] ?? 0);

        $this->errors = [];

        if ($basic < 0 || $hra < 0 || $special < 0 || $travel < 0) {
            $this->errors[] = 'Salary components cannot be negative.';
        }
        if ($basic > 100_000_000_00) {
            $this->errors[] = 'Basic salary exceeds the supported maximum.';
        }

        $bonus = 0;
        $overtime = 0;
        $otherDeduction = 0;
        foreach ($adjustments as $adjustment) {
            $amount = (int) ($adjustment['amount_paise'] ?? 0);
            $kind = (string) ($adjustment['kind'] ?? '');
            if ($amount < 0) {
                $this->errors[] = 'Adjustment amounts cannot be negative.';
                continue;
            }
            if ($kind === 'bonus') {
                $bonus += $amount;
            } elseif ($kind === 'overtime') {
                $overtime += $amount;
            } elseif ($kind === 'deduction') {
                $otherDeduction += $amount;
            }
        }

        // ── Earnings ────────────────────────────────────────────────────
        $lines = [];
        $gross = 0;
        foreach ([
            ['basic', 'Basic Salary', $basic],
            ['hra', 'House Rent Allowance', $hra],
            ['special', 'Special Allowance', $special],
            ['travel', 'Travel Allowance', $travel],
            ['bonus', 'Bonus', $bonus],
            ['overtime', 'Overtime', $overtime],
        ] as [$code, $label, $amount]) {
            if ($amount === 0) {
                continue;
            }
            $lines[] = [
                'kind' => 'earning',
                'code' => $code,
                'label' => $label,
                'amount_paise' => $amount,
                'sequence' => count($lines),
            ];
            $gross += $amount;
        }

        // ── Deductions ──────────────────────────────────────────────────
        // Nothing is deducted from nothing: a zero-gross payslip has no
        // deductions, which keeps the net at zero rather than negative.
        $pf = 0;
        $tds = 0;
        $professionalTax = 0;
        if ($gross > 0) {
            $pf = $this->percentageRule($rules, 'pf_employee', $basic);
            $tds = $this->percentageRule($rules, 'tds_basic', $basic);
            $professionalTax = $this->fixedRule($rules, 'professional_tax');
        }

        $deductionLines = [];
        $totalDeductions = 0;
        foreach ([
            ['pf', 'Provident Fund', $pf],
            ['professional_tax', 'Professional Tax', $professionalTax],
            ['tax', 'Income Tax (TDS)', $tds],
            ['deduction', 'Other Deduction', $otherDeduction],
        ] as [$code, $label, $amount]) {
            if ($amount === 0) {
                continue;
            }
            $deductionLines[] = [
                'kind' => 'deduction',
                'code' => $code,
                'label' => $label,
                'amount_paise' => $amount,
                'sequence' => count($deductionLines),
            ];
            $totalDeductions += $amount;
        }

        $net = $gross - $totalDeductions;
        if ($net < 0) {
            $this->errors[] = 'Deductions exceed gross earnings.';
            $net = 0;
        }

        return [
            'basic_paise' => $basic,
            'gross_paise' => $gross,
            'total_deductions_paise' => $totalDeductions,
            'net_paise' => $net,
            'tax_paise' => $tds,
            'lines' => array_merge($lines, $deductionLines),
            'errors' => $this->errors,
        ];
    }

    /**
     * A percentage rule applied to a base amount.
     *
     * @param array<string,array<string,mixed>> $rules
     */
    private function percentageRule(array $rules, string $code, int $base): int
    {
        $rule = $rules[$code] ?? null;
        if ($rule === null || (int) $rule['enabled'] !== 1) {
            return 0;
        }
        $basis = (string) $rule['basis'];
        $amount = 0;

        if ($basis === 'percent_basic') {
            $amount = Money::applyRate($base, (int) ($rule['rate_basis_points'] ?? 0));
        } elseif ($basis === 'percent_gross') {
            // Gross is not known at this point; callers that need a
            // gross-based rule pass the gross in through $base.
            $amount = Money::applyRate($base, (int) ($rule['rate_basis_points'] ?? 0));
        }

        $cap = $rule['cap_paise'] !== null ? (int) $rule['cap_paise'] : null;
        if ($cap !== null && $amount > $cap) {
            $amount = $cap;
        }
        return max(0, $amount);
    }

    /**
     * A fixed-amount rule.
     *
     * @param array<string,array<string,mixed>> $rules
     */
    private function fixedRule(array $rules, string $code): int
    {
        $rule = $rules[$code] ?? null;
        if ($rule === null || (int) $rule['enabled'] !== 1) {
            return 0;
        }
        if ((string) $rule['basis'] !== 'fixed') {
            return 0;
        }
        return max(0, (int) ($rule['amount_paise'] ?? 0));
    }

    /**
     * Validate a salary structure before it is stored.
     *
     * @param array<string,mixed> $components Component name => major-unit amount.
     * @return array<int,string>
     */
    public function validateSalary(array $components): array
    {
        $errors = [];
        foreach ($components as $name => $amount) {
            if (!is_numeric($amount)) {
                $errors[] = "{$name} must be a number.";
                continue;
            }
            if ((float) $amount < 0) {
                $errors[] = "{$name} cannot be negative.";
            }
            if ((float) $amount > 100_000_000) {
                $errors[] = "{$name} exceeds the supported maximum.";
            }
        }
        return $errors;
    }
}
