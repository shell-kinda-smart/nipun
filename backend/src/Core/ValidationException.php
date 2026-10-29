<?php

declare(strict_types=1);

namespace PayLens\Core;

/**
 * Raised when request input fails server-side validation.
 */
final class ValidationException extends \RuntimeException
{
    /** @param array<string,array<int,string>> $errors */
    public function __construct(private array $errors, string $message = 'The submitted data is invalid.')
    {
        parent::__construct($message);
    }

    /** @return array<string,array<int,string>> */
    public function errors(): array
    {
        return $this->errors;
    }
}
