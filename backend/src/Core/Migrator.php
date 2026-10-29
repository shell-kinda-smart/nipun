<?php

declare(strict_types=1);

namespace PayLens\Core;

/**
 * Migration runner.
 *
 * Migrations are plain PHP files in database/migrations named
 * `NNN_description.php`; each returns `['up' => callable(Database): void]`.
 * Applied migrations are recorded by filename, so re-running is a no-op and
 * an existing database is never dropped or reset.
 */
final class Migrator
{
    public function __construct(private Database $db, private string $migrationsDir)
    {
    }

    /**
     * @return array<int,string> Names of the migrations applied by this call.
     */
    public function migrate(): array
    {
        $this->ensureMigrationsTable();
        $applied = $this->appliedNames();
        $ran = [];

        foreach ($this->available() as $name => $file) {
            if (in_array($name, $applied, true)) {
                continue;
            }
            $migration = require $file;
            if (!is_array($migration) || !isset($migration['up']) || !is_callable($migration['up'])) {
                throw new \RuntimeException("Migration {$name} does not expose a callable 'up'.");
            }

            $this->db->transaction(function () use ($migration, $name): void {
                ($migration['up'])($this->db);
                $this->db->execute(
                    'INSERT INTO migrations (id, applied_at, batch) VALUES (?, ?, ?)',
                    [$name, (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s'), 1],
                );
            });

            $ran[] = $name;
        }

        return $ran;
    }

    /**
     * @return array<int,array{name:string,applied:bool}>
     */
    public function status(): array
    {
        $this->ensureMigrationsTable();
        $applied = $this->appliedNames();
        $status = [];
        foreach (array_keys($this->available()) as $name) {
            $status[] = ['name' => $name, 'applied' => in_array($name, $applied, true)];
        }
        return $status;
    }

    /** @return array<int,string> */
    public function appliedNames(): array
    {
        $rows = $this->db->select('SELECT id FROM migrations');
        return array_map(static fn (array $row): string => (string) $row['id'], $rows);
    }

    /** @return array<string,string> */
    private function available(): array
    {
        if (!is_dir($this->migrationsDir)) {
            return [];
        }
        $files = glob($this->migrationsDir . DIRECTORY_SEPARATOR . '*.php') ?: [];
        sort($files);
        $map = [];
        foreach ($files as $file) {
            $map[basename($file, '.php')] = $file;
        }
        return $map;
    }

    private function ensureMigrationsTable(): void
    {
        (new Schema($this->db, 'migrations'))
            ->string('id', 255)
            ->dateTime('applied_at')
            ->int('batch', false, 1)
            ->primary('id')
            ->create();
    }
}
