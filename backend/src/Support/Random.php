<?php

declare(strict_types=1);

namespace PayLens\Support;

/**
 * Deterministic pseudo-random generator.
 *
 * This is a faithful port of the seeded LCG the frontend used
 * (src/data/seed.ts), so the development dataset is identical to the one
 * the UI was designed against: same names, same employee ids, same
 * salaries.
 *
 * The JavaScript original:
 *
 *   state = (Math.imul(state, 1664525) + 1013904223) >>> 0
 *   return state / 0x100000000
 *
 * Math.imul() keeps the low 32 bits of the product, and >>> 0 reinterprets
 * them as unsigned — which is exactly a mask against 0xFFFFFFFF.
 */
final class Random
{
    private int $state;

    public function __construct(int $seed = 0xC0FFEE)
    {
        $this->state = $seed & 0xFFFFFFFF;
    }

    /** The next float in [0, 1). */
    public function next(): float
    {
        $this->state = ($this->state * 1664525 + 1013904223) & 0xFFFFFFFF;
        return $this->state / 0x100000000;
    }

    /**
     * @template T
     * @param array<int,T> $items
     * @return T
     */
    public function pick(array $items): mixed
    {
        return $items[(int) floor($this->next() * count($items))];
    }

    /** A float in [min, max). */
    public function between(float $min, float $max): float
    {
        return $min + $this->next() * ($max - $min);
    }

    /** An integer in [min, max] inclusive, matching Math.floor semantics. */
    public function intBetween(int $min, int $max): int
    {
        return (int) floor($this->between((float) $min, (float) $max + 1));
    }

    /** JavaScript's Math.round: halves go up. */
    public static function round(float $value): float
    {
        return floor($value + 0.5);
    }
}
