<?php

declare(strict_types=1);

namespace PayLens\Core;

/**
 * Application configuration.
 *
 * Values come from config/config.php, with environment overrides applied on
 * top so a deployment never has to edit tracked files.
 *
 * Nested arrays are flattened into dot keys ("db.driver"), so call sites read
 * `$config->string('db.driver')` regardless of how the file is organised.
 */
final class Config
{
    /** @param array<string,mixed> $values */
    public function __construct(private array $values = [])
    {
        $this->values = self::flatten($values);
    }

    /**
     * @param array<string,mixed> $values
     * @return array<string,mixed>
     */
    private static function flatten(array $values, string $prefix = ''): array
    {
        $flat = [];
        foreach ($values as $key => $value) {
            $full = $prefix === '' ? (string) $key : $prefix . '.' . $key;
            if (is_array($value) && ! array_is_list($value)) {
                $flat += self::flatten($value, $full);
                continue;
            }
            $flat[$full] = $value;
        }
        return $flat;
    }

    public function get(string $key, mixed $default = null): mixed
    {
        $value = $this->values[$key] ?? null;
        return $value === null ? $default : $value;
    }

    public function string(string $key, string $default = ''): string
    {
        $value = $this->get($key, $default);
        return is_scalar($value) ? (string) $value : $default;
    }

    public function int(string $key, int $default = 0): int
    {
        $value = $this->get($key, $default);
        return is_numeric($value) ? (int) $value : $default;
    }

    public function bool(string $key, bool $default = false): bool
    {
        $value = $this->get($key, $default);
        if (is_bool($value)) {
            return $value;
        }
        if (is_string($value)) {
            return in_array(strtolower($value), ['1', 'true', 'yes', 'on'], true);
        }
        return $default;
    }

    /** @return array<string,mixed> */
    public function all(): array
    {
        return $this->values;
    }
}
