<?php

declare(strict_types=1);

namespace PayLens\Repositories;

use PayLens\Core\Database;

final class TaxSlabRepository
{
    public function __construct(private Database $db)
    {
    }

    /** @return array<int,array<string,mixed>> */
    public function all(): array
    {
        return $this->db->select('SELECT * FROM tax_slabs WHERE enabled = 1 ORDER BY lower_bound_paise');
    }

    /**
     * Count employees whose annual CTC falls into each slab.
     *
     * The counts are always derived from the data — they are never stored,
     * so they cannot drift away from the payroll records.
     *
     * @param array<int,array<string,mixed>> $slabs
     * @return array<int,array<string,mixed>>
     */
    public function withCounts(array $slabs): array
    {
        $result = [];
        foreach ($slabs as $slab) {
            $lower = (int) $slab['lower_bound_paise'];
            $upper = $slab['upper_bound_paise'] !== null ? (int) $slab['upper_bound_paise'] : null;

            $sql = 'SELECT COUNT(*) AS c FROM salary_structures ss
                    WHERE ss.effective_to IS NULL
                      AND ss.ctc_annual_paise >= ?';
            $params = [$lower];
            if ($upper !== null) {
                $sql .= ' AND ss.ctc_annual_paise < ?';
                $params[] = $upper;
            }

            $row = $this->db->selectOne($sql, $params);
            $result[] = [
                'label' => (string) $slab['label'],
                'rateBasisPoints' => (int) $slab['rate_basis_points'],
                'count' => (int) ($row['c'] ?? 0),
                'jurisdiction' => (string) $slab['jurisdiction'],
                'notes' => $slab['notes'] !== null ? (string) $slab['notes'] : null,
            ];
        }
        return $result;
    }
}
