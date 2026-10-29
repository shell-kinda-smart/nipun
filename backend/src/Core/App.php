<?php

declare(strict_types=1);

namespace PayLens\Core;

use PayLens\Services\AuditLogger;
use PayLens\Services\PayrollCalculator;
use PayLens\Services\RuleRepository;

/**
 * Application container.
 *
 * Deliberately small: a handful of services, wired once at boot and passed
 * to controllers. There is no service-locator magic and no dependency
 * injection framework — the object graph is short enough to read in one
 * screen.
 */
final class App
{
    public readonly Config $config;
    public readonly Database $db;
    public readonly Rbac $rbac;
    public readonly SessionService $sessions;
    public readonly RateLimiter $rateLimiter;
    public readonly AuditLogger $audit;
    public readonly RuleRepository $rules;
    public readonly PayrollCalculator $calculator;

    public function __construct(Config $config)
    {
        $this->config = $config;
        $this->db = new Database($config);
        $this->rbac = new Rbac($this->db);
        $this->sessions = new SessionService($this->db, $config);
        $this->rateLimiter = new RateLimiter($this->db);
        $this->audit = new AuditLogger($this->db);
        $this->rules = new RuleRepository($this->db);
        $this->calculator = new PayrollCalculator($this->db, $this->rules);
    }

    public static function boot(string $baseDir): self
    {
        $configFile = $baseDir . '/config/config.php';
        $config = new Config(require $configFile);
        date_default_timezone_set($config->string('app.timezone', 'UTC'));
        return new self($config);
    }

    /** True when the request should be treated as a development request. */
    public function isDebug(): bool
    {
        return $this->config->bool('app.debug', false);
    }
}
