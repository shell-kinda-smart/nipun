<?php

declare(strict_types=1);

namespace PayLens\Core;

use PDO;
use PDOException;
use RuntimeException;

/**
 * PDO connection factory.
 *
 * MySQL 8.x is the target platform. SQLite is supported as a development
 * fallback so the API, the test-suite and the seed can all be exercised on a
 * machine without a MySQL server; it is never a production target.
 */
final class Database
{
    private ?PDO $pdo = null;

    /** When true, statements are recorded instead of executed. */
    private bool $dryRun = false;

    /** @var array<int,string> */
    private array $executed = [];

    public function __construct(private Config $config)
    {
    }

    /**
     * Record statements instead of running them.
     *
     * Used to inspect the SQL a driver would send — notably the MySQL
     * dialect, which can be asserted on without a MySQL server.
     */
    public function dryRun(bool $dry = true): void
    {
        $this->dryRun = $dry;
    }

    /** @return array<int,string> */
    public function executedSql(): array
    {
        return $this->executed;
    }

    public function driver(): string
    {
        return strtolower($this->config->string('db.driver', 'mysql'));
    }

    public function pdo(): PDO
    {
        if ($this->pdo instanceof PDO) {
            return $this->pdo;
        }

        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ];

        try {
            if ($this->driver() === 'sqlite') {
                $path = $this->config->string('db.database', ':memory:');
                if ($path !== ':memory:') {
                    // A relative path is resolved against the backend root
                    // so the same .env works from any working directory.
                    if (! str_starts_with($path, '/') && ! preg_match('#^[A-Za-z]:[\\\\/]#', $path)) {
                        $path = rtrim($this->config->string('paths.root', '.'), '/\\')
                            . DIRECTORY_SEPARATOR . $path;
                    }
                    $dir = dirname($path);
                    if (! is_dir($dir)) {
                        mkdir($dir, 0775, true);
                    }
                }
                $this->pdo = new PDO('sqlite:' . $path, null, null, $options);
                $this->pdo->exec('PRAGMA foreign_keys = ON');
            } else {
                $dsn = sprintf(
                    'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
                    $this->config->string('db.host', '127.0.0.1'),
                    $this->config->int('db.port', 3306),
                    $this->config->string('db.database', 'paylens'),
                );
                $this->pdo = new PDO(
                    $dsn,
                    $this->config->string('db.username', 'root'),
                    $this->config->string('db.password', ''),
                    $options,
                );
                $this->pdo->exec("SET time_zone = '+00:00'");
            }
        } catch (PDOException $e) {
            // The DSN may contain credentials, so only a generic message is
            // ever surfaced to the caller.
            throw new RuntimeException('Database connection failed.', 0, $e);
        }

        return $this->pdo;
    }

    /**
     * Run a unit of work inside a transaction.
     *
     * Nested calls join the outer transaction rather than opening a second
     * one, so a service can call another service safely.
     */
    public function transaction(callable $work): mixed
    {
        $pdo = $this->pdo();
        if ($pdo->inTransaction()) {
            return $work($pdo);
        }
        $pdo->beginTransaction();
        try {
            $result = $work($pdo);
            $pdo->commit();
            return $result;
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    /** @return array<int,array<string,mixed>> */
    public function select(string $sql, array $params = []): array
    {
        // A dry run never touches the database, so a read reports that it
        // found nothing rather than opening a connection.
        if ($this->dryRun) {
            return [];
        }
        $stmt = $this->pdo()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    /** @return array<string,mixed>|null */
    public function selectOne(string $sql, array $params = []): ?array
    {
        if ($this->dryRun) {
            return null;
        }
        $stmt = $this->pdo()->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function execute(string $sql, array $params = []): int
    {
        $this->executed[] = $sql;
        if ($this->dryRun) {
            return 0;
        }
        $stmt = $this->pdo()->prepare($sql);
        $stmt->execute($params);
        return $stmt->rowCount();
    }

    public function lastInsertId(): string
    {
        return $this->pdo()->lastInsertId();
    }

    /**
     * The columns of a table.
     *
     * @return array<int,string>
     */
    public function tableColumns(string $table): array
    {
        if ($this->dryRun) {
            // Nothing is connected, so the shape is unknown; callers that
            // only need to record the statement treat it as "not present".
            return [];
        }
        $columns = [];
        if ($this->driver() === 'sqlite') {
            foreach ($this->select('PRAGMA table_info(' . $table . ')') as $row) {
                $columns[] = (string) $row['name'];
            }
            return $columns;
        }
        foreach ($this->select('SHOW COLUMNS FROM ' . $table) as $row) {
            $columns[] = (string) $row['Field'];
        }
        return $columns;
    }

    /**
     * Add a column when it is not already there.
     *
     * This is how a schema evolves on a database that already holds data:
     * nothing is dropped, and re-running the migration is a no-op.
     */
    public function addColumnIfMissing(string $table, string $column, string $definition): bool
    {
        if ($this->dryRun) {
            $this->execute("ALTER TABLE {$table} ADD COLUMN {$column} {$definition}");
            return true;
        }
        if (in_array($column, $this->tableColumns($table), true)) {
            return false;
        }
        $this->execute("ALTER TABLE {$table} ADD COLUMN {$column} {$definition}");
        return true;
    }

    /**
     * Insert a row, or update the listed columns when the conflict target
     * already exists. The SQL differs between MySQL and SQLite, so the
     * dialect is handled here rather than leaking into callers.
     *
     * @param array<string,mixed> $data
     * @param array<int,string>   $updateColumns Columns refreshed on conflict.
     * @param array<int,string>   $conflictColumns The unique key the conflict is on.
     */
    public function upsert(string $table, array $data, array $updateColumns, array $conflictColumns): void
    {
        $columns = array_keys($data);
        $placeholders = array_map(static fn (string $c): string => ':' . $c, $columns);
        $params = [];
        foreach ($data as $key => $value) {
            $params[$key] = $value;
        }

        if ($this->driver() === 'sqlite') {
            $assignments = [];
            foreach ($updateColumns as $column) {
                $assignments[] = $column . ' = excluded.' . $column;
            }
            $sql = sprintf(
                'INSERT INTO %s (%s) VALUES (%s) ON CONFLICT(%s) DO UPDATE SET %s',
                $table,
                implode(', ', $columns),
                implode(', ', $placeholders),
                implode(', ', $conflictColumns),
                implode(', ', $assignments),
            );
        } else {
            $assignments = [];
            foreach ($updateColumns as $column) {
                $assignments[] = $column . ' = VALUES(' . $column . ')';
            }
            $sql = sprintf(
                'INSERT INTO %s (%s) VALUES (%s) ON DUPLICATE KEY UPDATE %s',
                $table,
                implode(', ', $columns),
                implode(', ', $placeholders),
                implode(', ', $assignments),
            );
        }

        $this->execute($sql, $params);
    }

    /**
     * Insert a row, skipping it when the unique key already holds it.
     *
     * The spelling is dialect-specific — MySQL uses INSERT IGNORE and
     * SQLite uses INSERT OR IGNORE — so the difference is handled here
     * rather than leaking into the caller.
     *
     * @param array<string,mixed> $data
     */
    public function insertIgnore(string $table, array $data): void
    {
        $columns = array_keys($data);
        $placeholders = array_map(static fn (string $c): string => ':' . $c, $columns);
        $params = [];
        foreach ($data as $key => $value) {
            $params[$key] = $value;
        }

        $verb = $this->driver() === 'sqlite' ? 'INSERT OR IGNORE INTO' : 'INSERT IGNORE INTO';
        $sql = sprintf(
            '%s %s (%s) VALUES (%s)',
            $verb,
            $table,
            implode(', ', $columns),
            implode(', ', $placeholders),
        );

        $this->execute($sql, $params);
    }
}
