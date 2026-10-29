<?php

declare(strict_types=1);

namespace PayLens\Core;

/**
 * A very small test harness.
 *
 * There is no PHPUnit in this project (the backend has no Composer
 * dependencies), so the suite is a plain PHP script with assertions and a
 * non-zero exit code when anything fails.
 */
final class TestRunner
{
    /** @var array<int,array{name:string,ok:bool,message:string}> */
    private array $results = [];

    private string $group = '';

    private int $assertions = 0;

    public function group(string $name): void
    {
        $this->group = $name;
        echo "\n  {$name}\n";
    }

    public function test(string $name, callable $body): void
    {
        try {
            $body($this);
            $this->results[] = ['name' => $this->group . ' › ' . $name, 'ok' => true, 'message' => ''];
            echo "    \u{2713} {$name}\n";
        } catch (\Throwable $e) {
            $this->results[] = [
                'name' => $this->group . ' › ' . $name,
                'ok' => false,
                'message' => $e->getMessage(),
            ];
            echo "    \u{2717} {$name}\n";
            echo '        ' . $e->getMessage() . "\n";
        }
    }

    public function assert(bool $condition, string $message): void
    {
        $this->assertions++;
        if (! $condition) {
            throw new \RuntimeException($message);
        }
    }

    public function assertSame(mixed $expected, mixed $actual, string $message = ''): void
    {
        $this->assertions++;
        if ($expected !== $actual) {
            throw new \RuntimeException(sprintf(
                '%sExpected %s, got %s.',
                $message === '' ? '' : $message . ' — ',
                var_export($expected, true),
                var_export($actual, true),
            ));
        }
    }

    public function assertEquals(mixed $expected, mixed $actual, string $message = ''): void
    {
        $this->assertions++;
        if ($expected != $actual) {
            throw new \RuntimeException(sprintf(
                '%sExpected %s, got %s.',
                $message === '' ? '' : $message . ' — ',
                var_export($expected, true),
                var_export($actual, true),
            ));
        }
    }

    public function assertThrows(string $exceptionClass, callable $body, string $message = ''): void
    {
        $this->assertions++;
        try {
            $body();
        } catch (\Throwable $e) {
            if ($e instanceof $exceptionClass) {
                return;
            }
            throw new \RuntimeException(sprintf(
                '%sExpected %s, got %s: %s',
                $message === '' ? '' : $message . ' — ',
                $exceptionClass,
                $e::class,
                $e->getMessage(),
            ));
        }
        throw new \RuntimeException(($message === '' ? '' : $message . ' — ') . "Expected {$exceptionClass} to be thrown.");
    }

    public function summary(): int
    {
        $failed = array_filter($this->results, static fn (array $r): bool => ! $r['ok']);
        $passed = count($this->results) - count($failed);

        echo "\n" . str_repeat('-', 60) . "\n";
        printf("%d test(s), %d assertion(s), %d failed\n", count($this->results), $this->assertions, count($failed));

        if ($failed !== []) {
            echo "\nFailures:\n";
            foreach ($failed as $result) {
                printf("  - %s: %s\n", $result['name'], $result['message']);
            }
            return 1;
        }

        echo "All tests passed.\n";
        return 0;
    }
}
