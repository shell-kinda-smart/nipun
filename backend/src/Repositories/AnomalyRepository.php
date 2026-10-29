<?php

declare(strict_types=1);

namespace PayLens\Repositories;

use PayLens\Core\Database;

final class AnomalyRepository
{
    public function __construct(private Database $db)
    {
    }

    /**
     * @param array{severity?:?string,status?:?string,employeeId?:?string} $filters
     * @return array<int,array<string,mixed>>
     */
    public function search(array $filters): array
    {
        $where = [];
        $params = [];
        if (!empty($filters['severity'])) {
            $where[] = 'severity = ?';
            $params[] = (string) $filters['severity'];
        }
        if (!empty($filters['status'])) {
            $where[] = 'status = ?';
            $params[] = (string) $filters['status'];
        }
        if (!empty($filters['employeeId'])) {
            $where[] = 'employee_id = ?';
            $params[] = (string) $filters['employeeId'];
        }
        $sql = 'SELECT * FROM anomalies';
        if ($where !== []) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY risk_score DESC, detected_at DESC';
        return $this->db->select($sql, $params);
    }

    /** @return array<string,mixed>|null */
    public function find(string $id): ?array
    {
        return $this->db->selectOne('SELECT * FROM anomalies WHERE id = ?', [$id]);
    }

    public function updateStatus(string $id, string $status, ?string $assignedTo = null): void
    {
        $this->db->execute(
            'UPDATE anomalies SET status = ?, assigned_to = COALESCE(?, assigned_to), updated_at = ? WHERE id = ?',
            [$status, $assignedTo, (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s'), $id],
        );
    }

    /** @return array<string,int> */
    public function counts(): array
    {
        $rows = $this->db->select('SELECT status, COUNT(*) AS c FROM anomalies GROUP BY status');
        $counts = ['open' => 0, 'investigating' => 0, 'resolved' => 0, 'dismissed' => 0, 'critical' => 0];
        foreach ($rows as $row) {
            $counts[(string) $row['status']] = (int) $row['c'];
        }
        $critical = $this->db->selectOne(
            "SELECT COUNT(*) AS c FROM anomalies WHERE severity = 'critical' AND status <> 'resolved'",
        );
        $counts['critical'] = (int) ($critical['c'] ?? 0);

        $high = $this->db->selectOne(
            "SELECT COUNT(*) AS c FROM anomalies WHERE severity = 'high' AND status <> 'resolved'",
        );
        $counts['high'] = (int) ($high['c'] ?? 0);

        return $counts;
    }

    /**
     * Anomalies detected between two dates.
     *
     * Used to compare the last period with the one before it — the change
     * in detections, which is a real figure rather than a decorative one.
     */
    public function detectedBetween(string $from, string $to): int
    {
        $row = $this->db->selectOne(
            'SELECT COUNT(*) AS c FROM anomalies WHERE detected_at >= ? AND detected_at < ?',
            [$from, $to],
        );
        return (int) ($row['c'] ?? 0);
    }
}
