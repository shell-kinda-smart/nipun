<?php

declare(strict_types=1);

namespace PayLens\Core;

/**
 * Tiny schema builder that emits MySQL, PostgreSQL and SQLite DDL from one
 * definition.
 *
 * Migrations are written once; the dialect differences (auto-increment,
 * table-level foreign keys, JSON columns) are handled here so a migration
 * file never contains driver-specific SQL.
 */
final class Schema
{
    /** @var array<int,string> */
    private array $columns = [];

    /** @var array<int,string> */
    private array $primary = [];

    /** @var array<int,string> */
    private array $uniques = [];

    /** @var array<int,array{name:string,columns:array<int,string>}> */
    private array $indexes = [];

    /** @var array<int,string> */
    private array $foreignKeys = [];

    private bool $sqliteAutoIncrement = false;

    public function __construct(private Database $db, private string $table)
    {
    }

    public function id(): self
    {
        if ($this->db->driver() === 'sqlite') {
            $this->sqliteAutoIncrement = true;
            $this->columns[] = 'id INTEGER PRIMARY KEY AUTOINCREMENT';
        } elseif ($this->db->driver() === 'pgsql') {
            $this->columns[] = 'id BIGSERIAL NOT NULL';
            $this->primary[] = 'id';
        } else {
            $this->columns[] = 'id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT';
            $this->primary[] = 'id';
        }
        return $this;
    }

    public function string(string $name, int $length = 255, bool $nullable = false, ?string $default = null): self
    {
        $defaultSql = $default === null ? '' : " DEFAULT '" . $default . "'";
        $this->columns[] = $name . ' VARCHAR(' . $length . ')' . ($nullable ? ' NULL' : ' NOT NULL') . $defaultSql;
        return $this;
    }

    public function text(string $name, bool $nullable = false): self
    {
        $this->columns[] = $name . ' TEXT' . ($nullable ? ' NULL' : ' NOT NULL');
        return $this;
    }

    /** A larger TEXT variant, for generated documents. */
    public function mediumText(string $name, bool $nullable = false): self
    {
        $type = $this->db->driver() === 'pgsql' ? 'TEXT' : 'MEDIUMTEXT';
        $this->columns[] = $name . ' ' . $type . ($nullable ? ' NULL' : ' NOT NULL');
        return $this;
    }

    public function bigInt(string $name, bool $nullable = false, ?int $default = null): self
    {
        $defaultSql = $default === null ? '' : ' DEFAULT ' . $default;
        $this->columns[] = $name . ' BIGINT' . ($nullable ? ' NULL' : ' NOT NULL') . $defaultSql;
        return $this;
    }

    public function int(string $name, bool $nullable = false, ?int $default = null): self
    {
        $defaultSql = $default === null ? '' : ' DEFAULT ' . $default;
        $this->columns[] = $name . ' INT' . ($nullable ? ' NULL' : ' NOT NULL') . $defaultSql;
        return $this;
    }

    public function decimal(string $name, string $precision = '5,2'): self
    {
        $this->columns[] = $name . ' DECIMAL(' . $precision . ') NOT NULL';
        return $this;
    }

    public function bool(string $name, bool $default = false): self
    {
        $type = $this->db->driver() === 'pgsql' ? 'SMALLINT' : 'TINYINT(1)';
        $this->columns[] = $name . ' ' . $type . ' NOT NULL DEFAULT ' . ($default ? 1 : 0);
        return $this;
    }

    public function date(string $name, bool $nullable = false): self
    {
        $this->columns[] = $name . ' DATE' . ($nullable ? ' NULL' : ' NOT NULL');
        return $this;
    }

    public function dateTime(string $name, bool $nullable = false): self
    {
        $type = $this->db->driver() === 'pgsql' ? 'TIMESTAMP WITHOUT TIME ZONE' : 'DATETIME';
        $this->columns[] = $name . ' ' . $type . ($nullable ? ' NULL' : ' NOT NULL');
        return $this;
    }

    /** JSON payload — stored as TEXT so both drivers behave identically. */
    public function json(string $name, bool $nullable = true): self
    {
        $this->columns[] = $name . ' TEXT' . ($nullable ? ' NULL' : ' NOT NULL');
        return $this;
    }

    public function primary(string|array $columns): self
    {
        foreach ((array) $columns as $column) {
            $this->primary[] = $column;
        }
        return $this;
    }

    public function unique(string|array $columns, ?string $name = null): self
    {
        $columns = (array) $columns;
        $this->uniques[] = 'UNIQUE (' . implode(', ', $columns) . ')'
            . ($name !== null ? ' CONSTRAINT ' . $name : '');
        return $this;
    }

    public function index(string|array $columns, ?string $name = null): self
    {
        $columns = array_values((array) $columns);
        $this->indexes[] = [
            'name' => $name ?? 'idx_' . $this->table . '_' . implode('_', $columns),
            'columns' => $columns,
        ];
        return $this;
    }

    public function foreignKey(
        string $column,
        string $referenceTable,
        string $referenceColumn = 'id',
        string $onDelete = 'RESTRICT',
        ?string $onUpdate = null,
    ): self {
        $sql = 'FOREIGN KEY (' . $column . ') REFERENCES ' . $referenceTable . ' (' . $referenceColumn . ')'
            . ' ON DELETE ' . $onDelete;
        if ($onUpdate !== null) {
            $sql .= ' ON UPDATE ' . $onUpdate;
        }
        $this->foreignKeys[] = $sql;
        return $this;
    }

    public function timestamps(): self
    {
        $this->dateTime('created_at');
        $this->dateTime('updated_at');
        return $this;
    }

    /**
     * The DDL for this table, without executing it.
     *
     * Exposed so the MySQL dialect can be inspected (and asserted on)
     * without a MySQL server: `Schema::sql()` renders the statement the
     * MySQL branch would run.
     */
    public function sql(): string
    {
        $parts = $this->columns;
        if ($this->primary !== []) {
            $parts[] = 'PRIMARY KEY (' . implode(', ', $this->primary) . ')';
        }
        $parts = array_merge($parts, $this->uniques, $this->foreignKeys);

        // MySQL accepts an inline INDEX clause. PostgreSQL and SQLite need a
        // separate CREATE INDEX statement.
        if ($this->db->driver() === 'mysql') {
            foreach ($this->indexes as $index) {
                $parts[] = 'INDEX ' . $index['name'] . ' (' . implode(', ', $index['columns']) . ')';
            }
        }

        return 'CREATE TABLE IF NOT EXISTS ' . $this->table . ' (' . implode(', ', $parts) . ')';
    }

    /** The separate CREATE INDEX statements PostgreSQL and SQLite need. */
    public function indexStatements(): array
    {
        if ($this->db->driver() === 'mysql') {
            return [];
        }
        $statements = [];
        foreach ($this->indexes as $index) {
            $statements[] = 'CREATE INDEX IF NOT EXISTS ' . $index['name']
                . ' ON ' . $this->table . ' (' . implode(', ', $index['columns']) . ')';
        }
        return $statements;
    }

    public function create(): void
    {
        $this->db->execute($this->sql());

        foreach ($this->indexStatements() as $statement) {
            $this->db->execute($statement);
        }
    }

    public function drop(): void
    {
        $this->db->execute('DROP TABLE IF EXISTS ' . $this->table);
    }
}
