<?php

declare(strict_types=1);

namespace PayLens\Core;

/**
 * Monetary values in integer minor units (paise).
 *
 * Authoritative payroll totals must never be produced by binary floating
 * point: 0.1 + 0.2 !== 0.3. Every amount that touches the database is an
 * integer number of minor units, and the only conversion to a float happens
 * at the presentation edge.
 *
 * Rounding rule: half-up, applied to the absolute value, then the sign is
 * restored. This is applied once, at the point an input amount enters the
 * system, and once at the end of a payroll calculation.
 *
 * Formatting is done by hand because ext-intl is not guaranteed to be
 * present; the grouping follows the Indian numbering system (last three
 * digits, then pairs) used throughout the frontend.
 */
final class Money
{
    public const SCALE = 100;

    /** Convert a major-unit amount to minor units (half-up). */
    public static function toMinor(int|float|string $amount): int
    {
        if (is_int($amount)) {
            return $amount * self::SCALE;
        }
        $value = (float) $amount;
        $scaled = $value * self::SCALE;
        $rounded = $value < 0 ? -floor(abs($scaled) + 0.5) : floor(abs($scaled) + 0.5);
        return (int) $rounded;
    }

    /** Convert minor units back to a major-unit float (display only). */
    public static function fromMinor(int $minor): float
    {
        return $minor / self::SCALE;
    }

    /** Format minor units as an en-IN rupee string, e.g. ₹48,98,505.00. */
    public static function format(int $minor): string
    {
        $negative = $minor < 0;
        $abs = abs($minor);
        $rupees = intdiv($abs, self::SCALE);
        $paise = $abs % self::SCALE;

        $formatted = '₹' . self::groupIndian($rupees) . '.' . str_pad((string) $paise, 2, '0', STR_PAD_LEFT);
        return $negative ? '-' . $formatted : $formatted;
    }

    /** Format minor units without the symbol, e.g. 48,98,505.00. */
    public static function formatPlain(int $minor): string
    {
        $negative = $minor < 0;
        $abs = abs($minor);
        $formatted = self::groupIndian(intdiv($abs, self::SCALE))
            . '.' . str_pad((string) ($abs % self::SCALE), 2, '0', STR_PAD_LEFT);
        return $negative ? '-' . $formatted : $formatted;
    }

    /**
     * Group digits the Indian way: 48,98,505 (2,2,3 from the right).
     */
    public static function groupIndian(int $value): string
    {
        $sign = $value < 0 ? '-' : '';
        $digits = (string) abs($value);
        if (strlen($digits) <= 3) {
            return $sign . $digits;
        }
        $last3 = substr($digits, -3);
        $rest = substr($digits, 0, -3);

        // The remaining digits are grouped in pairs, working from the right,
        // so a leading group of one digit is preserved (1,00,000).
        $chunks = [];
        while ($rest !== '') {
            $chunks[] = substr($rest, -2);
            $rest = substr($rest, 0, -2);
        }
        $chunks = array_reverse($chunks);

        return $sign . implode(',', $chunks) . ',' . $last3;
    }

    /**
     * Round a minor-unit value to the nearest rupee (half-up).
     * Used for components that are billed per month in whole rupees.
     */
    public static function roundToRupee(int $minor): int
    {
        $rupees = $minor / self::SCALE;
        $rounded = $rupees < 0 ? -floor(abs($rupees) + 0.5) : floor(abs($rupees) + 0.5);
        return (int) $rounded * self::SCALE;
    }

    /**
     * Apply a percentage expressed in basis points, using integer maths.
     *
     * 10000 basis points = 100%. Rounding is half-up on the absolute value.
     * No float ever touches the calculation: `amount * bp` stays an integer
     * and is divided by 10000 with the remainder rounded up at the half.
     */
    public static function applyRate(int $amount, int $basisPoints): int
    {
        $product = $amount * $basisPoints;
        $sign = $product < 0 ? -1 : 1;
        $abs = abs($product);
        return $sign * intdiv($abs + 5000, 10000);
    }
}
