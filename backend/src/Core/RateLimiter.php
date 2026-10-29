<?php

declare(strict_types=1);

namespace PayLens\Core;

/**
 * Fixed-window rate limiter backed by the database.
 *
 * Used to throttle authentication attempts and other sensitive operations.
 * Counters are keyed by IP and (where relevant) by the submitted identity,
 * so one attacker cannot lock every user out by guessing a single address.
 */
final class RateLimiter
{
    public function __construct(private Database $db)
    {
    }

    /**
     * @return array{allowed:bool,remaining:int,retry_after:int}
     */
    public function hit(string $bucket, string $key, int $limit, int $windowSeconds): array
    {
        $now = new \DateTimeImmutable('now');
        $windowStart = $now->modify('-' . $windowSeconds . ' seconds')->format('Y-m-d H:i:s');
        $hash = hash('sha256', $bucket . '|' . $key);

        $row = $this->db->selectOne(
            'SELECT attempts, window_started_at FROM rate_limits WHERE id = ?',
            [$hash],
        );

        if ($row === null || (string) $row['window_started_at'] < $windowStart) {
            $this->db->upsert(
                'rate_limits',
                ['id' => $hash, 'attempts' => 1, 'window_started_at' => $now->format('Y-m-d H:i:s')],
                ['attempts', 'window_started_at'],
                ['id'],
            );
            return ['allowed' => true, 'remaining' => $limit - 1, 'retry_after' => 0];
        }

        $attempts = (int) $row['attempts'] + 1;
        $this->db->execute('UPDATE rate_limits SET attempts = ? WHERE id = ?', [$attempts, $hash]);

        $windowStartAt = new \DateTimeImmutable((string) $row['window_started_at']);
        $retryAfter = max(0, $windowStartAt->getTimestamp() + $windowSeconds - $now->getTimestamp());

        return [
            'allowed' => $attempts <= $limit,
            'remaining' => max(0, $limit - $attempts),
            'retry_after' => $retryAfter,
        ];
    }

    public function clear(string $bucket, string $key): void
    {
        $hash = hash('sha256', $bucket . '|' . $key);
        $this->db->execute('DELETE FROM rate_limits WHERE id = ?', [$hash]);
    }
}
