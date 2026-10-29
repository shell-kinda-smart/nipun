<?php

declare(strict_types=1);

namespace PayLens\Repositories;

use PayLens\Core\Database;

final class UserRepository
{
    public function __construct(private Database $db)
    {
    }

    /** @return array<string,mixed>|null */
    public function findByEmail(string $email): ?array
    {
        return $this->db->selectOne(
            'SELECT u.*, e.first_name, e.last_name
             FROM users u
             LEFT JOIN employees e ON e.id = u.employee_id
             WHERE LOWER(u.email) = LOWER(?)',
            [$email],
        );
    }

    /** @return array<string,mixed>|null */
    public function findById(int $id): ?array
    {
        return $this->db->selectOne('SELECT * FROM users WHERE id = ?', [$id]);
    }

    /** @return array<string,mixed>|null */
    public function findByRole(string $role): ?array
    {
        return $this->db->selectOne(
            'SELECT * FROM users WHERE role = ? AND status = ? ORDER BY id LIMIT 1',
            [$role, 'active'],
        );
    }

    /** @return array<int,array<string,mixed>> */
    public function all(): array
    {
        return $this->db->select('SELECT * FROM users ORDER BY name');
    }

    public function recordSuccessfulLogin(int $userId): void
    {
        $this->db->execute(
            'UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = ? WHERE id = ?',
            [(new \DateTimeImmutable('now'))->format('Y-m-d H:i:s'), $userId],
        );
    }

    /**
     * Record a failed sign-in.
     *
     * The account is only locked once the failures reach the threshold, so
     * one mistyped password does not lock a working account out for the
     * whole lockout period.
     */
    public function recordFailedLogin(int $userId, int $lockoutSeconds, int $threshold = 5): void
    {
        $current = (int) ($this->db->selectOne(
            'SELECT failed_login_count FROM users WHERE id = ?',
            [$userId],
        )['failed_login_count'] ?? 0);

        $count = $current + 1;
        $lockedUntil = $count >= $threshold
            ? (new \DateTimeImmutable('now'))->modify('+' . $lockoutSeconds . ' seconds')->format('Y-m-d H:i:s')
            : null;

        $this->db->execute(
            'UPDATE users SET failed_login_count = ?, locked_until = ? WHERE id = ?',
            [$count, $lockedUntil, $userId],
        );
    }

    public function updatePassword(int $userId, string $passwordHash): void
    {
        $this->db->execute(
            'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
            [$passwordHash, (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s'), $userId],
        );
    }

    public function updateProfile(int $userId, string $name, ?string $avatarSeed): void
    {
        $this->db->execute(
            'UPDATE users SET name = ?, avatar_seed = ?, updated_at = ? WHERE id = ?',
            [$name, $avatarSeed, (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s'), $userId],
        );
    }

    public function emailExists(string $email, ?int $exceptId = null): bool
    {
        $sql = 'SELECT COUNT(*) AS c FROM users WHERE LOWER(email) = LOWER(?)';
        $params = [$email];
        if ($exceptId !== null) {
            $sql .= ' AND id <> ?';
            $params[] = $exceptId;
        }
        $row = $this->db->selectOne($sql, $params);
        return (int) ($row['c'] ?? 0) > 0;
    }
}
