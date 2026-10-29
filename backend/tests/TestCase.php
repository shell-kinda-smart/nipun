<?php

declare(strict_types=1);

namespace PayLens\Tests;

use PayLens\Core\App;
use PayLens\Core\Config;
use PayLens\Core\Kernel;
use PayLens\Core\Request;
use PayLens\Core\Response;
use PayLens\Core\TestRunner;
use PayLens\Database\Seeds\DevelopmentSeeder;

/**
 * Test harness.
 *
 * Boots the real application against an in-memory SQLite database (the
 * same code paths as MySQL, only the driver differs), runs the migrations
 * and the seed, and dispatches requests through the real HTTP kernel.
 */
final class TestCase
{
    public App $app;

    public TestRunner $t;

    public function __construct(TestRunner $runner)
    {
        $this->t = $runner;

        // The suite runs against an in-memory SQLite database by default.
        // Set PAYLENS_TEST_DB=mysql to run it against a real MySQL server
        // instead — the connection comes from the usual DB_* variables and
        // the target database is replaced with the test schema, so point it
        // at a throwaway database.
        $mysql = (getenv('PAYLENS_TEST_DB') ?: '') === 'mysql';

        $db = $mysql
            ? [
                'driver' => 'mysql',
                'host' => getenv('DB_HOST') ?: '127.0.0.1',
                'port' => (int) (getenv('DB_PORT') ?: 3306),
                'database' => getenv('DB_TEST_DATABASE') ?: 'paylens_test',
                'username' => getenv('DB_USERNAME') ?: 'root',
                'password' => getenv('DB_PASSWORD') ?: '',
            ]
            : [
                'driver' => 'sqlite',
                'database' => ':memory:',
            ];

        $this->app = new App(new Config([
            'app' => [
                'name' => 'PayLens API (test)',
                'env' => 'testing',
                'debug' => true,
                'demo_mode' => true,
                'timezone' => 'UTC',
            ],
            'db' => $db,
            'session' => [
                'absolute_seconds' => 3600,
                'idle_seconds' => 1800,
                'cookie_secure' => false,
            ],
            'security' => [
                'login_max_attempts' => 5,
                'login_window_seconds' => 300,
                'login_lockout_seconds' => 900,
                'password_min_length' => 12,
                'cors_origins' => [],
            ],
            'payroll' => [
                'default_working_days' => 22,
                'jurisdiction' => 'demo',
            ],
            'paths' => [
                'root' => dirname(__DIR__),
                'migrations' => dirname(__DIR__) . '/database/migrations',
            ],
        ]));

        // The suite must never touch a real database. In the default mode
        // the connection is asserted to be in-memory, so a misconfigured
        // environment fails the run instead of writing to it.
        if (! $mysql && $this->app->config->string('db.database') !== ':memory:') {
            throw new \RuntimeException(
                'The test database must be in-memory. Refusing to run against ' .
                $this->app->config->string('db.database') . '.',
            );
        }
    }

    /** Run the migrations and the development seed. */
    public function boot(bool $withSeed = true): void
    {
        $migrator = new \PayLens\Core\Migrator($this->app->db, $this->app->config->string('paths.migrations'));
        $migrator->migrate();

        if ($withSeed) {
            (new DevelopmentSeeder($this->app))->run('TestPassword#123');
        }
    }

    /**
     * Dispatch a request through the real kernel.
     *
     * @param array<string,mixed> $body
     * @param array<string,string> $headers
     * @param array<string,string> $cookies
     * @return array{status:int,json:array<string,mixed>,raw:string}
     */
    public function request(
        string $method,
        string $path,
        array $body = [],
        array $headers = [],
        array $cookies = [],
    ): array {
        $request = new Request(
            strtoupper($method),
            $path,
            [],
            $body,
            array_change_key_case($headers),
            $cookies,
        );

        ob_start();
        (new Kernel($this->app))->handle($request);
        $raw = (string) ob_get_clean();

        $json = json_decode($raw, true);
        return [
            'status' => Response::lastStatus(),
            'json' => is_array($json) ? $json : [],
            'raw' => $raw,
        ];
    }

    /**
     * Create a session for the first user with the given role and return
     * the cookie value plus the CSRF token.
     *
     * @return array{cookie:string,csrf:string,userId:int,email:string}
     */
    public function sessionFor(string $role): array
    {
        $row = $this->app->db->selectOne('SELECT * FROM users WHERE role = ? ORDER BY id LIMIT 1', [$role]);
        if ($row === null) {
            throw new \RuntimeException("No user with role {$role}.");
        }
        $session = $this->app->sessions->create((int) $row['id'], '127.0.0.1', 'php-test');
        return [
            'cookie' => $session['token'],
            'csrf' => $session['csrf_token'],
            'userId' => (int) $row['id'],
            'email' => (string) $row['email'],
        ];
    }

    /** @return array<int,array<string,mixed>> */
    public function table(string $table): array
    {
        return $this->app->db->select('SELECT * FROM ' . $table);
    }

    public function count(string $table): int
    {
        $row = $this->app->db->selectOne('SELECT COUNT(*) AS c FROM ' . $table);
        return (int) ($row['c'] ?? 0);
    }
}
