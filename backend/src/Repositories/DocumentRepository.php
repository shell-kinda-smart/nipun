<?php

declare(strict_types=1);

namespace PayLens\Repositories;

use PayLens\Core\Database;

final class DocumentRepository
{
    public function __construct(private Database $db)
    {
    }

    /**
     * @param array{employeeId?:?string,type?:?string,status?:?string} $filters
     * @return array<int,array<string,mixed>>
     */
    public function search(array $filters): array
    {
        $where = [];
        $params = [];
        if (!empty($filters['employeeId'])) {
            $where[] = 'employee_id = ?';
            $params[] = (string) $filters['employeeId'];
        }
        if (!empty($filters['type'])) {
            $where[] = 'type = ?';
            $params[] = (string) $filters['type'];
        }
        if (!empty($filters['status'])) {
            $where[] = 'status = ?';
            $params[] = (string) $filters['status'];
        }
        $sql = 'SELECT * FROM documents';
        if ($where !== []) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        return $this->db->select($sql . ' ORDER BY created_at DESC', $params);
    }

    /** @return array<string,mixed>|null */
    public function find(string $id): ?array
    {
        return $this->db->selectOne('SELECT * FROM documents WHERE id = ?', [$id]);
    }
}
