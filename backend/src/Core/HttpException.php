<?php

declare(strict_types=1);

namespace PayLens\Core;

/**
 * An error that maps directly onto an HTTP response.
 *
 * Services and controllers throw these instead of writing a response and
 * exiting, which keeps them testable and keeps the HTTP concerns in the
 * kernel.
 */
final class HttpException extends \RuntimeException
{
    /** @param array<string,mixed> $details */
    public function __construct(
        private string $errorCode,
        string $message,
        private int $status = 400,
        private array $details = [],
    ) {
        parent::__construct($message);
    }

    public function errorCode(): string
    {
        return $this->errorCode;
    }

    public function status(): int
    {
        return $this->status;
    }

    /** @return array<string,mixed> */
    public function details(): array
    {
        return $this->details;
    }
}
