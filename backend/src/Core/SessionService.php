<?php

declare(strict_types=1);

namespace PayLens\Core;

/**
 * Server-managed sessions.
 *
 * The browser holds only an opaque random token in a cookie; the token is
 * stored as a SHA-256 hash, so a database leak cannot be replayed as a
 * session. Sessions carry an absolute expiry and an idle timeout, and can
 * be revoked server-side on logout.
 */
final class SessionService
{
    public const COOKIE = 'paylens_session';

    public function __construct(private Database $db, private Config $config)
    {
    }

    /**
     * @return array{user:array<string,mixed>,session:array<string,mixed>}|null
     */
    public function resolve(Request $request): ?array
    {
        $token = $request->cookie(self::COOKIE);
        if ($token === null || $token === '') {
            return null;
        }

        $hash = hash('sha256', $token);
        $session = $this->db->selectOne(
            'SELECT s.*, u.id AS user_id, u.email, u.name, u.role, u.status AS user_status,
                    u.employee_id, u.avatar_seed, u.last_login_at
             FROM sessions s
             JOIN users u ON u.id = s.user_id
             WHERE s.id = ?',
            [$hash],
        );

        if ($session === null) {
            return null;
        }
        if ($session['revoked_at'] !== null) {
            return null;
        }

        $now = new \DateTimeImmutable('now');
        $expiresAt = new \DateTimeImmutable((string) $session['expires_at']);
        if ($expiresAt < $now) {
            return null; // Absolute lifetime reached.
        }
        $idleDeadline = new \DateTimeImmutable((string) $session['last_seen_at']);
        $idleSeconds = $this->config->int('session.idle_seconds', 1800);
        if ($idleDeadline->getTimestamp() + $idleSeconds < $now->getTimestamp()) {
            return null; // Idle timeout reached.
        }
        if ((string) $session['user_status'] !== 'active') {
            return null;
        }

        $this->touch($hash);

        $user = [
            'id' => (int) $session['user_id'],
            'email' => (string) $session['email'],
            'name' => (string) $session['name'],
            'role' => (string) $session['role'],
            'employee_id' => $session['employee_id'],
            'avatar_seed' => $session['avatar_seed'],
        ];

        return [
            'user' => $user,
            'session' => [
                'id' => $hash,
                'csrf_token' => (string) $session['csrf_token'],
                'expires_at' => (string) $session['expires_at'],
            ],
        ];
    }

    /**
     * Create a session for a user and return the plaintext cookie token.
     *
     * @param bool $remember When false the session ends with the idle
     *                       timeout instead of the longer absolute lifetime.
     * @return array{token:string,csrf_token:string,expires_at:string}
     */
    public function create(int $userId, string $ip, string $userAgent, bool $remember = true): array
    {
        $token = bin2hex(random_bytes(32));
        $hash = hash('sha256', $token);
        $csrf = bin2hex(random_bytes(32));
        $now = new \DateTimeImmutable('now');
        $lifetime = $remember
            ? $this->config->int('session.absolute_seconds', 43200)
            : min($this->config->int('session.idle_seconds', 1800), $this->config->int('session.absolute_seconds', 43200));
        $expires = $now->modify('+' . $lifetime . ' seconds');

        $this->db->execute(
            'INSERT INTO sessions (id, user_id, csrf_token, ip_address, user_agent, created_at, last_seen_at, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $hash,
                $userId,
                $csrf,
                mb_substr($ip, 0, 45),
                mb_substr($userAgent, 0, 255),
                $now->format('Y-m-d H:i:s'),
                $now->format('Y-m-d H:i:s'),
                $expires->format('Y-m-d H:i:s'),
            ],
        );

        return [
            'token' => $token,
            'csrf_token' => $csrf,
            'expires_at' => $expires->format('Y-m-d H:i:s'),
        ];
    }

    /** Rotate the session identifier — used after a privilege change. */
    public function rotate(string $currentHash, int $userId, string $ip, string $userAgent): array
    {
        $this->revoke($currentHash);
        return $this->create($userId, $ip, $userAgent);
    }

    public function revoke(string $hash): void
    {
        $this->db->execute(
            'UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL',
            [(new \DateTimeImmutable('now'))->format('Y-m-d H:i:s'), $hash],
        );
    }

    public function revokeAllForUser(int $userId): void
    {
        $this->db->execute(
            'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL',
            [(new \DateTimeImmutable('now'))->format('Y-m-d H:i:s'), $userId],
        );
    }

    /**
     * Revoke every session for an account except the one making the request.
     *
     * Used after a password change: the other devices are signed out, while
     * the device that changed the password stays signed in.
     */
    public function revokeAllForUserExcept(int $userId, string $exceptHash): void
    {
        $this->db->execute(
            'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND id <> ? AND revoked_at IS NULL',
            [
                (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s'),
                $userId,
                $exceptHash,
            ],
        );
    }

    private function touch(string $hash): void
    {
        $this->db->execute(
            'UPDATE sessions SET last_seen_at = ? WHERE id = ?',
            [(new \DateTimeImmutable('now'))->format('Y-m-d H:i:s'), $hash],
        );
    }

    /** Delete sessions that expired more than a day ago. */
    public function prune(): int
    {
        $cutoff = (new \DateTimeImmutable('-1 day'))->format('Y-m-d H:i:s');
        return $this->db->execute('DELETE FROM sessions WHERE expires_at < ?', [$cutoff]);
    }

    public function sendCookie(string $token): void
    {
        if (headers_sent()) {
            return;
        }
        $secure = $this->config->bool('session.cookie_secure', false);
        setcookie(self::COOKIE, $token, [
            'expires' => 0,
            'path' => '/',
            'httponly' => true,
            'secure' => $secure,
            'samesite' => $this->sameSite(),
        ]);
    }

    public function clearCookie(): void
    {
        if (headers_sent()) {
            return;
        }
        $secure = $this->config->bool('session.cookie_secure', false);
        setcookie(self::COOKIE, '', [
            'expires' => time() - 3600,
            'path' => '/',
            'httponly' => true,
            'secure' => $secure,
            'samesite' => $this->sameSite(),
        ]);
    }

    /**
     * The SameSite mode of the session cookie.
     *
     * `Lax` is right when the frontend and the API share an origin. When
     * they do not — the frontend on Vercel, the API on a PHP host — the
     * browser only sends the cookie if it is `None` and `Secure`, which
     * means HTTPS on the API.
     */
    private function sameSite(): string
    {
        $mode = strtolower(trim($this->config->string('session.cookie_samesite', 'Lax')));
        return in_array($mode, ['lax', 'strict', 'none'], true) ? ucfirst($mode) : 'Lax';
    }
}
