<?php

declare(strict_types=1);

namespace PayLens\Core;

/**
 * Tiny regex router.
 *
 * Routes are declared as `GET /api/employees/{id}`; `{name}` matches a
 * single path segment and is passed to the handler as a named argument.
 */
final class Router
{
    /** @var array<int,array{method:string,pattern:string,handler:callable,middleware:array<int,string|callable>}> */
    private array $routes = [];

    /** @var array<int,string|callable> */
    private array $groupMiddleware = [];

    /**
     * @param array<int,string|callable> $middleware
     */
    public function get(string $path, callable $handler, array $middleware = []): void
    {
        $this->add('GET', $path, $handler, $middleware);
    }

    /**
     * @param array<int,string|callable> $middleware
     */
    public function post(string $path, callable $handler, array $middleware = []): void
    {
        $this->add('POST', $path, $handler, $middleware);
    }

    /**
     * @param array<int,string|callable> $middleware
     */
    public function put(string $path, callable $handler, array $middleware = []): void
    {
        $this->add('PUT', $path, $handler, $middleware);
    }

    /**
     * @param array<int,string|callable> $middleware
     */
    public function patch(string $path, callable $handler, array $middleware = []): void
    {
        $this->add('PATCH', $path, $handler, $middleware);
    }

    /**
     * @param array<int,string|callable> $middleware
     */
    public function delete(string $path, callable $handler, array $middleware = []): void
    {
        $this->add('DELETE', $path, $handler, $middleware);
    }

    /**
     * Apply middleware to every route registered inside the callback.
     *
     * @param array<int,string|callable> $middleware
     */
    public function group(array $middleware, callable $callback): void
    {
        $previous = $this->groupMiddleware;
        $this->groupMiddleware = array_merge($previous, $middleware);
        $callback($this);
        $this->groupMiddleware = $previous;
    }

    /**
     * @param array<int,string|callable> $middleware
     */
    private function add(string $method, string $path, callable $handler, array $middleware): void
    {
        $this->routes[] = [
            'method' => $method,
            'pattern' => $this->compile($path),
            'handler' => $handler,
            'middleware' => array_merge($this->groupMiddleware, $middleware),
        ];
    }

    private function compile(string $path): string
    {
        // The literal parts of the path are quoted, so a dot in a filename
        // such as `/api/employees/export.csv` matches a dot and nothing
        // else. The placeholders are substituted afterwards.
        $pattern = preg_quote($path, '#');
        $pattern = preg_replace(
            '#\\\\\{([a-zA-Z_][a-zA-Z0-9_]*)\\\\\}#',
            '(?P<$1>[^/]+)',
            $pattern,
        );
        return '#^' . $pattern . '$#';
    }

    /**
     * Resolve and run the matching route.
     *
     * @param array<string,callable> $middleware Resolved middleware callables keyed by alias.
     */
    public function dispatch(Request $request, array $middleware): void
    {
        $pathMatched = false;

        foreach ($this->routes as $route) {
            if (!preg_match($route['pattern'], $request->path(), $matches)) {
                continue;
            }
            $pathMatched = true;
            if ($route['method'] !== $request->method()) {
                continue;
            }

            $params = [];
            foreach ($matches as $key => $value) {
                if (is_string($key)) {
                    $params[$key] = $value;
                }
            }

            foreach ($route['middleware'] as $alias) {
                if (is_string($alias)) {
                    if (!isset($middleware[$alias])) {
                        continue;
                    }
                    $result = $middleware[$alias]($request);
                } else {
                    $result = $alias($request);
                }
                if ($result === false) {
                    return; // Middleware already responded.
                }
            }

            $handler = $route['handler'];
            $handler($request, $params);
            return;
        }

        if ($pathMatched) {
            Response::error('method_not_allowed', 'Method not allowed for this endpoint.', 405);
            return;
        }
        Response::error('not_found', 'Endpoint not found.', 404);
    }
}
