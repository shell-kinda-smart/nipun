<?php

declare(strict_types=1);

namespace PayLens\Core;

use PayLens\Core\App;

/**
 * The HTTP kernel.
 *
 * Owns the middleware chain and the route table, and turns any unhandled
 * failure into a safe JSON error: the detail goes to the server log, the
 * client gets a generic message.
 */
final class Kernel
{
    public function __construct(private App $app)
    {
    }

    public function handle(Request $request): void
    {
        $middleware = [
            'auth' => function (Request $request): bool {
                $resolved = $this->app->sessions->resolve($request);
                if ($resolved === null) {
                    Response::error('unauthenticated', 'Sign in to continue.', 401);
                    return false;
                }
                $request->setAttribute('user', $resolved['user']);
                $request->setAttribute('session', $resolved['session']);
                return true;
            },
            'csrf' => static function (Request $request): bool {
                if (!Csrf::verify($request)) {
                    Response::error(
                        'csrf_failed',
                        'Your session token is missing or stale. Please sign in again.',
                        403,
                    );
                    return false;
                }
                return true;
            },
        ];

        try {
            $router = new Router();
            $routes = require dirname(__DIR__) . '/routes.php';
            $routes($router, $this->app);
            $router->dispatch($request, $middleware);
        } catch (HttpException $e) {
            Response::error($e->errorCode(), $e->getMessage(), $e->status(), $e->details());
        } catch (ValidationException $e) {
            Response::error('validation_failed', $e->getMessage(), 422, ['fields' => $e->errors()]);
        } catch (\Throwable $e) {
            error_log('[paylens-api] ' . $e::class . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            Response::error(
                'server_error',
                'The request could not be completed.',
                500,
                $this->app->isDebug() ? ['debug' => $e->getMessage()] : [],
            );
        }
    }
}
