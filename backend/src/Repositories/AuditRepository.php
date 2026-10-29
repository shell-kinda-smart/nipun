<?php

declare(strict_types=1);

namespace PayLens\Repositories;

use PayLens\Core\Database;

final class AuditRepository
{
    public function __construct(private Database $db)
    {
    }

    /**
     * @param array{actor?:?string,action?:?string,page?:int,perPage?:int} $filters
     * @return array{items:array<int,array<string,mixed>>,total:int}
     */
    public function search(array $filters): array
    {
        $where = [];
        $params = [];
        if (!empty($filters['actor'])) {
            $where[] = 'COALESCE(a.actor_name, u.name) = ?';
            $params[] = (string) $filters['actor'];
        }
        if (!empty($filters['action'])) {
            $where[] = 'a.action = ?';
            $params[] = (string) $filters['action'];
        }
        $whereSql = $where === [] ? '' : ' WHERE ' . implode(' AND ', $where);

        $totalRow = $this->db->selectOne('SELECT COUNT(*) AS c FROM audit_logs a' . $whereSql, $params);
        $total = (int) ($totalRow['c'] ?? 0);

        $perPage = max(1, min(200, (int) ($filters['perPage'] ?? 50)));
        $page = max(1, (int) ($filters['page'] ?? 1));
        $offset = ($page - 1) * $perPage;

        $rows = $this->db->select(
            'SELECT a.*, u.role AS actor_role,
                    COALESCE(a.actor_name, u.name) AS actor_name
             FROM audit_logs a
             LEFT JOIN users u ON u.id = a.actor_user_id'
            . $whereSql
            . " ORDER BY a.created_at DESC, a.id DESC LIMIT {$perPage} OFFSET {$offset}",
            $params,
        );

        return ['items' => $rows, 'total' => $total];
    }

    /** @return array<int,string> */
    public function actions(): array
    {
        $rows = $this->db->select('SELECT DISTINCT action FROM audit_logs ORDER BY action');
        return array_map(static fn (array $row): string => (string) $row['action'], $rows);
    }

    /** @return array<int,string> */
    public function actors(): array
    {
        $rows = $this->db->select(
            'SELECT DISTINCT COALESCE(a.actor_name, u.name) AS actor
             FROM audit_logs a
             LEFT JOIN users u ON u.id = a.actor_user_id
             WHERE COALESCE(a.actor_name, u.name) IS NOT NULL
             ORDER BY actor',
        );
        return array_map(static fn (array $row): string => (string) $row['actor'], $rows);
    }
}
