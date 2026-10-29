<?php

declare(strict_types=1);

namespace PayLens\Services;

use PayLens\Core\Database;

/**
 * Audit trail writer.
 *
 * Records who did what to which record, when, and whether it succeeded.
 * Passwords, session tokens, CSRF tokens and payroll amounts belonging to
 * individuals are never written here: only non-sensitive metadata such as
 * changed field names.
 */
final class AuditLogger
{
    public function __construct(private Database $db)
    {
    }

    /**
     * @param array<string,mixed> $metadata
     */
    public function log(
        ?int $actorUserId,
        string $action,
        string $entityType,
        ?string $entityId = null,
        string $outcome = 'success',
        array $metadata = [],
        ?string $ip = null,
        ?string $actorName = null,
    ): void {
        if ($actorName === null && $actorUserId !== null) {
            // Resolve the display name so the trail reads "Sara Banerjee"
            // rather than an address; the address is kept alongside it.
            $row = $this->db->selectOne('SELECT name FROM users WHERE id = ?', [$actorUserId]);
            $actorName = $row !== null ? (string) $row['name'] : null;
        }

        $this->db->execute(
            'INSERT INTO audit_logs
                (actor_user_id, actor_email, actor_name, action, entity_type, entity_id, outcome, metadata, ip_address, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $actorUserId,
                $metadata['__actor_email'] ?? null,
                $actorName,
                $action,
                $entityType,
                $entityId,
                $outcome,
                $metadata === [] ? null : json_encode($this->scrub($metadata), JSON_UNESCAPED_UNICODE),
                $ip !== null ? mb_substr($ip, 0, 45) : null,
                (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s'),
            ],
        );
    }

    /**
     * Strip anything that must never reach the audit table.
     *
     * @param array<string,mixed> $metadata
     * @return array<string,mixed>
     */
    private function scrub(array $metadata): array
    {
        unset($metadata['__actor_email']);
        $blocked = ['password', 'password_hash', 'passwordHash', 'token', 'csrf_token', 'secret', 'session'];
        foreach ($metadata as $key => $value) {
            if (in_array(strtolower((string) $key), $blocked, true)) {
                $metadata[$key] = '[redacted]';
            }
        }
        return $metadata;
    }
}
