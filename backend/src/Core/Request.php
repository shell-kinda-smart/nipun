<?php

declare(strict_types=1);

namespace PayLens\Core;

/**
 * Immutable view of the incoming HTTP request.
 */
final class Request
{
    private string $method;

    private string $path;

    /** @var array<string,mixed> */
    private array $query;

    /** @var array<string,mixed> */
    private array $body;

    /** @var array<string,string> */
    private array $headers;

    /** @var array<string,string> */
    private array $cookies;

    /** @var array<string,mixed> */
    private array $attributes;

    /**
     * @param array<string,mixed> $query
     * @param array<string,mixed> $body
     * @param array<string,string> $headers
     * @param array<string,string> $cookies
     * @param array<string,mixed> $attributes
     */
    public function __construct(
        string $method,
        string $path,
        array $query = [],
        array $body = [],
        array $headers = [],
        array $cookies = [],
        array $attributes = [],
    ) {
        // A path may carry a query string; the parameters are split out so
        // the router only ever sees the path.
        $mark = strpos($path, '?');
        if ($mark !== false) {
            $queryString = substr($path, $mark + 1);
            $path = substr($path, 0, $mark);
            if ($query === [] && $queryString !== '') {
                parse_str($queryString, $query);
            }
        }

        $this->method = strtoupper($method);
        $this->path = rtrim($path, '/') === '' ? '/' : rtrim($path, '/');
        $this->query = $query;
        $this->body = $body;
        $this->headers = $headers;
        $this->cookies = $cookies;
        $this->attributes = $attributes;
    }

    public static function capture(): self
    {
        $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        $path = parse_url($uri, PHP_URL_PATH) ?: '/';

        $headers = [];
        foreach ($_SERVER as $key => $value) {
            if (str_starts_with((string) $key, 'HTTP_')) {
                $name = strtolower(str_replace('_', '-', substr((string) $key, 5)));
                $headers[$name] = (string) $value;
            }
        }
        if (isset($_SERVER['CONTENT_TYPE'])) {
            $headers['content-type'] = (string) $_SERVER['CONTENT_TYPE'];
        }

        $raw = file_get_contents('php://input') ?: '';
        $body = [];
        $contentType = $headers['content-type'] ?? '';
        if (str_contains($contentType, 'application/json') && $raw !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                $body = $decoded;
            }
        } elseif ($raw !== '') {
            parse_str($raw, $body);
        }
        if ($body === [] && $_POST !== []) {
            $body = $_POST;
        }

        return new self(
            $method,
            rtrim($path, '/') === '' ? '/' : rtrim($path, '/'),
            $_GET ?? [],
            $body,
            $headers,
            $_COOKIE ?? [],
        );
    }

    public function method(): string
    {
        return $this->method;
    }

    public function path(): string
    {
        return $this->path;
    }

    public function header(string $name, ?string $default = null): ?string
    {
        return $this->headers[strtolower($name)] ?? $default;
    }

    public function cookie(string $name, ?string $default = null): ?string
    {
        return $this->cookies[$name] ?? $default;
    }

    public function query(string $key, mixed $default = null): mixed
    {
        return $this->query[$key] ?? $default;
    }

    public function input(string $key, mixed $default = null): mixed
    {
        return $this->body[$key] ?? $default;
    }

    /** @return array<string,mixed> */
    public function all(): array
    {
        return $this->body;
    }

    public function bearerToken(): ?string
    {
        $header = $this->header('authorization');
        if ($header !== null && stripos($header, 'bearer ') === 0) {
            return substr($header, 7);
        }
        return null;
    }

    public function ip(): string
    {
        $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
        return is_string($ip) ? $ip : '0.0.0.0';
    }

    public function userAgent(): string
    {
        return substr($this->header('user-agent', '') ?? '', 0, 255);
    }

    public function isMethod(string $method): bool
    {
        return $this->method === strtoupper($method);
    }

    public function setAttribute(string $key, mixed $value): void
    {
        $this->attributes[$key] = $value;
    }

    public function attribute(string $key, mixed $default = null): mixed
    {
        return $this->attributes[$key] ?? $default;
    }
}
