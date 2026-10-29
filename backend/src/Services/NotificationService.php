<?php

declare(strict_types=1);

namespace PayLens\Services;

use PayLens\Core\Database;

/**
 * In-app notification centre.
 *
 * Notifications are records in MySQL, scoped to a user. A notification is
 * created for the people who are *allowed to know* about the event, and the
 * list endpoint only ever returns the caller's own notifications.
 *
 * Previews are deliberately terse: they say that something happened and
 * where to look, without repeating salary, tax or termination detail that
 * belongs behind the destination page.
 */
final class NotificationService
{
    public const TYPE_INFO = 'info';
    public const TYPE_SUCCESS = 'success';
    public const TYPE_WARNING = 'warning';
    public const TYPE_ERROR = 'error';

    public function __construct(private Database $db)
    {
    }

    /**
     * @param array{actionLabel?:?string,actionHref?:?string,severity?:?string,id?:?string} $options
     */
    public function notify(
        ?int $userId,
        string $type,
        string $category,
        string $title,
        string $description,
        array $options = [],
    ): ?string {
        $id = $options['id'] ?? $this->nextId();
        $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');

        $this->db->execute(
            'INSERT INTO notifications
                (id, user_id, type, category, title, description, action_label, action_href, severity, read_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)',
            [
                $id,
                $userId,
                $type,
                $category,
                $title,
                $description,
                $options['actionLabel'] ?? null,
                $options['actionHref'] ?? null,
                $options['severity'] ?? null,
                $now,
            ],
        );

        return $id;
    }

    /**
     * Notify every active user holding a permission.
     *
     * @param array{actionLabel?:?string,actionHref?:?string,severity?:?string,idPrefix?:?string} $options
     */
    public function notifyPermission(
        string $permission,
        string $type,
        string $category,
        string $title,
        string $description,
        array $options = [],
    ): int {
        $users = $this->db->select(
            'SELECT DISTINCT u.id
             FROM users u
             JOIN role_permissions rp ON rp.role_name = u.role
             WHERE rp.permission_name = ? AND u.status = ?',
            [$permission, 'active'],
        );

        $count = 0;
        foreach ($users as $user) {
            $this->notify(
                (int) $user['id'],
                $type,
                $category,
                $title,
                $description,
                $options + ['id' => ($options['idPrefix'] ?? 'N') . '-' . $user['id'] . '-' . substr(sha1((string) $title . $description . microtime(true)), 0, 6)],
            );
            $count++;
        }
        return $count;
    }

    /**
     * Notify every active user with a role.
     *
     * @param array{actionLabel?:?string,actionHref?:?string,severity?:?string,idPrefix?:?string} $options
     */
    public function notifyRole(
        string $role,
        string $type,
        string $category,
        string $title,
        string $description,
        array $options = [],
    ): int {
        $users = $this->db->select('SELECT id FROM users WHERE role = ? AND status = ?', [$role, 'active']);
        $count = 0;
        foreach ($users as $user) {
            $this->notify(
                (int) $user['id'],
                $type,
                $category,
                $title,
                $description,
                $options + ['id' => ($options['idPrefix'] ?? 'N') . '-' . $user['id'] . '-' . substr(sha1((string) $title . $description . microtime(true)), 0, 6)],
            );
            $count++;
        }
        return $count;
    }

    /**
     * @return array<int,array<string,mixed>>
     */
    public function forUser(int $userId): array
    {
        return $this->db->select(
            'SELECT * FROM notifications WHERE user_id = ? OR user_id IS NULL ORDER BY created_at DESC, id DESC LIMIT 200',
            [$userId],
        );
    }

    public function unreadCount(int $userId): int
    {
        $row = $this->db->selectOne(
            'SELECT COUNT(*) AS c FROM notifications WHERE read_at IS NULL AND (user_id = ? OR user_id IS NULL)',
            [$userId],
        );
        return (int) ($row['c'] ?? 0);
    }

    public function markRead(string $id, int $userId): bool
    {
        $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');
        return $this->db->execute(
            'UPDATE notifications SET read_at = ? WHERE id = ? AND read_at IS NULL AND (user_id = ? OR user_id IS NULL)',
            [$now, $id, $userId],
        ) > 0;
    }

    public function markAllRead(int $userId): int
    {
        $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');
        return $this->db->execute(
            'UPDATE notifications SET read_at = ? WHERE read_at IS NULL AND (user_id = ? OR user_id IS NULL)',
            [$now, $userId],
        );
    }

    private function nextId(): string
    {
        $row = $this->db->selectOne('SELECT COUNT(*) AS c FROM notifications');
        return 'N' . str_pad((string) ((int) ($row['c'] ?? 0) + 1), 6, '0', STR_PAD_LEFT);
    }
}
