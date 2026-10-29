<?php

declare(strict_types=1);

namespace PayLens\Repositories;

use PayLens\Core\Database;

final class NotificationRepository
{
    public function __construct(private Database $db)
    {
    }

    /**
     * Notifications for a user, plus the shared/system ones.
     *
     * @return array<int,array<string,mixed>>
     */
    public function forUser(?int $userId): array
    {
        if ($userId === null) {
            return $this->db->select('SELECT * FROM notifications WHERE user_id IS NULL ORDER BY created_at DESC');
        }
        return $this->db->select(
            'SELECT * FROM notifications WHERE user_id IS NULL OR user_id = ? ORDER BY created_at DESC',
            [$userId],
        );
    }

    public function markRead(string $id, ?int $userId): bool
    {
        $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');
        if ($userId === null) {
            return $this->db->execute(
                'UPDATE notifications SET read_at = ? WHERE id = ? AND read_at IS NULL',
                [$now, $id],
            ) > 0;
        }
        return $this->db->execute(
            'UPDATE notifications SET read_at = ? WHERE id = ? AND read_at IS NULL AND (user_id IS NULL OR user_id = ?)',
            [$now, $id, $userId],
        ) > 0;
    }

    public function markAllRead(?int $userId): int
    {
        $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');
        if ($userId === null) {
            return $this->db->execute('UPDATE notifications SET read_at = ? WHERE read_at IS NULL', [$now]);
        }
        return $this->db->execute(
            'UPDATE notifications SET read_at = ? WHERE read_at IS NULL AND (user_id IS NULL OR user_id = ?)',
            [$now, $userId],
        );
    }

    public function unreadCount(?int $userId): int
    {
        if ($userId === null) {
            $row = $this->db->selectOne('SELECT COUNT(*) AS c FROM notifications WHERE read_at IS NULL');
        } else {
            $row = $this->db->selectOne(
                'SELECT COUNT(*) AS c FROM notifications WHERE read_at IS NULL AND (user_id IS NULL OR user_id = ?)',
                [$userId],
            );
        }
        return (int) ($row['c'] ?? 0);
    }

    /** Unread notifications in one category. */
    public function unreadInCategory(string $category, ?int $userId): int
    {
        if ($userId === null) {
            $row = $this->db->selectOne(
                'SELECT COUNT(*) AS c FROM notifications WHERE read_at IS NULL AND category = ?',
                [$category],
            );
        } else {
            $row = $this->db->selectOne(
                'SELECT COUNT(*) AS c FROM notifications
                 WHERE read_at IS NULL AND category = ? AND (user_id IS NULL OR user_id = ?)',
                [$category, $userId],
            );
        }
        return (int) ($row['c'] ?? 0);
    }
}
