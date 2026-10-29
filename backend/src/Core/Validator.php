<?php

declare(strict_types=1);

namespace PayLens\Core;

/**
 * Server-side input validation.
 *
 * The frontend validates for the user's benefit; this validates because the
 * server is the authority. Every write endpoint runs through here before a
 * repository is touched.
 *
 * Supported rules (pipe separated): required, nullable, string, int,
 * integer, numeric, boolean, email, date, in:a,b,c, min:<n>, max:<n>,
 * length:<n>, minlen:<n>, maxlen:<n>, slug, uuid, regex:/.../
 */
final class Validator
{
    /** @var array<string,mixed> */
    private array $data;

    /** @var array<string,array<int,string>> */
    private array $errors = [];

    /** @param array<string,mixed> $data */
    public function __construct(array $data)
    {
        $this->data = $data;
    }

    /**
     * @param array<string,string> $rules
     * @throws ValidationException
     */
    public function validate(array $rules): array
    {
        $this->errors = [];
        $clean = [];

        foreach ($rules as $field => $ruleString) {
            $ruleList = explode('|', $ruleString);
            $present = array_key_exists($field, $this->data);
            $value = $present ? $this->data[$field] : null;
            $isNullable = in_array('nullable', $ruleList, true);

            if (!$present || $value === null || $value === '') {
                if (in_array('required', $ruleList, true)) {
                    $this->fail($field, "{$field} is required.");
                    continue;
                }
                if ($isNullable || !$present) {
                    $clean[$field] = $value;
                    continue;
                }
            }

            $result = $this->checkField($field, $value, $ruleList);
            if ($result['error'] !== null) {
                $this->fail($field, $result['error']);
                continue;
            }
            $clean[$field] = $result['value'];
        }

        if ($this->errors !== []) {
            throw new ValidationException($this->errors);
        }
        return $clean;
    }

    /**
     * @param array<int,string> $rules
     * @return array{value:mixed,error:?string}
     */
    private function checkField(string $field, mixed $value, array $rules): array
    {
        // Trim first: a stray space should not make an otherwise valid
        // email or number fail.
        if (is_string($value)) {
            $value = trim($value);
        }

        $typeRule = null;
        foreach (['integer', 'int', 'numeric', 'boolean', 'email', 'date', 'slug', 'string'] as $candidate) {
            if (in_array($candidate, $rules, true)) {
                $typeRule = $candidate;
                break;
            }
        }

        if ($typeRule === 'integer' || $typeRule === 'int') {
            if (!is_int($value) && !(is_string($value) && preg_match('/^-?\d+$/', $value))) {
                return ['value' => $value, 'error' => "{$field} must be an integer."];
            }
            $value = (int) $value;
        } elseif ($typeRule === 'numeric') {
            if (!is_numeric($value)) {
                return ['value' => $value, 'error' => "{$field} must be a number."];
            }
            $value = (float) $value;
        } elseif ($typeRule === 'boolean') {
            if (!is_bool($value) && !in_array($value, [0, 1, '0', '1', 'true', 'false'], true)) {
                return ['value' => $value, 'error' => "{$field} must be a boolean."];
            }
            $value = in_array($value, [true, 1, '1', 'true'], true);
        } elseif ($typeRule === 'email') {
            if (!is_string($value) || !filter_var($value, FILTER_VALIDATE_EMAIL)) {
                return ['value' => $value, 'error' => "{$field} must be a valid email address."];
            }
            $value = strtolower(trim($value));
        } elseif ($typeRule === 'date') {
            if (!is_string($value) || !self::isDate($value)) {
                return ['value' => $value, 'error' => "{$field} must be a valid date (YYYY-MM-DD)."];
            }
        } elseif ($typeRule === 'slug') {
            if (!is_string($value) || !preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $value)) {
                return ['value' => $value, 'error' => "{$field} must be a lowercase slug."];
            }
        } elseif ($typeRule === 'string') {
            if (!is_string($value)) {
                return ['value' => $value, 'error' => "{$field} must be a string."];
            }
            $value = trim($value);
        }

        foreach ($rules as $rule) {
            if (str_starts_with($rule, 'in:')) {
                // The allowed values are comma separated: the pipe is the
                // rule separator, so it cannot be used inside a rule.
                $allowed = explode(',', substr($rule, 3));
                if (!in_array((string) $value, $allowed, true)) {
                    return ['value' => $value, 'error' => "{$field} must be one of: " . implode(', ', $allowed) . '.'];
                }
            } elseif (str_starts_with($rule, 'min:')) {
                $min = (float) substr($rule, 4);
                if (is_numeric($value) && (float) $value < $min) {
                    return ['value' => $value, 'error' => "{$field} must be at least {$min}."];
                }
                if (is_string($value) && mb_strlen($value) < (int) $min) {
                    return ['value' => $value, 'error' => "{$field} must be at least {$min} characters."];
                }
            } elseif (str_starts_with($rule, 'max:')) {
                $max = (float) substr($rule, 4);
                if (is_numeric($value) && (float) $value > $max) {
                    return ['value' => $value, 'error' => "{$field} must not exceed {$max}."];
                }
                if (is_string($value) && mb_strlen($value) > (int) $max) {
                    return ['value' => $value, 'error' => "{$field} must not exceed {$max} characters."];
                }
            } elseif (str_starts_with($rule, 'minlen:')) {
                $min = (int) substr($rule, 7);
                if (is_string($value) && mb_strlen($value) < $min) {
                    return ['value' => $value, 'error' => "{$field} must be at least {$min} characters."];
                }
            } elseif (str_starts_with($rule, 'maxlen:')) {
                $max = (int) substr($rule, 7);
                if (is_string($value) && mb_strlen($value) > $max) {
                    return ['value' => $value, 'error' => "{$field} must not exceed {$max} characters."];
                }
            } elseif (str_starts_with($rule, 'length:')) {
                $length = (int) substr($rule, 7);
                if (is_string($value) && mb_strlen($value) !== $length) {
                    return ['value' => $value, 'error' => "{$field} must be exactly {$length} characters."];
                }
            } elseif (str_starts_with($rule, 'regex:')) {
                $pattern = substr($rule, 6);
                if (!is_string($value) || !preg_match($pattern, $value)) {
                    return ['value' => $value, 'error' => "{$field} has an invalid format."];
                }
            }
        }

        return ['value' => $value, 'error' => null];
    }

    private function fail(string $field, string $message): void
    {
        $this->errors[$field][] = $message;
    }

    private static function isDate(string $value): bool
    {
        // A plain calendar date...
        $date = \DateTimeImmutable::createFromFormat('!Y-m-d', $value);
        if ($date !== false && $date->format('Y-m-d') === $value) {
            return true;
        }
        // ...or a date and time.
        if (preg_match('/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/', $value) === 1) {
            $parsed = \DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', substr($value, 0, 19));
            return $parsed !== false;
        }
        return false;
    }
}
