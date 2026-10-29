<?php

declare(strict_types=1);

namespace PayLens\Controllers;

use PayLens\Core\App;
use PayLens\Core\Request;
use PayLens\Core\Response;
use PayLens\Repositories\NotificationRepository;
use PayLens\Support\Mapper;

final class NotificationController extends Controller
{
    private NotificationRepository $notifications;

    public function __construct(App $app)
    {
        parent::__construct($app);
        $this->notifications = new NotificationRepository($app->db);
    }

    /** GET /api/notifications */
    public function index(Request $request): void
    {
        $user = $this->requireUser($request);
        $rows = $this->notifications->forUser((int) $user['id']);
        Response::json(
            array_map([Mapper::class, 'notification'], $rows),
            200,
            ['unread' => $this->notifications->unreadCount((int) $user['id'])],
        );
    }

    /** PATCH /api/notifications/{id}/read */
    public function markRead(Request $request, array $params): void
    {
        $user = $this->requireUser($request);
        $ok = $this->notifications->markRead((string) $params['id'], (int) $user['id']);
        Response::json(['ok' => $ok, 'unread' => $this->notifications->unreadCount((int) $user['id'])]);
    }

    /** POST /api/notifications/read-all */
    public function markAllRead(Request $request): void
    {
        $user = $this->requireUser($request);
        $this->notifications->markAllRead((int) $user['id']);
        Response::json(['ok' => true, 'unread' => 0]);
    }
}
