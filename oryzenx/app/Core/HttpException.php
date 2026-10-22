<?php
declare(strict_types=1);

namespace OryzenX\Core;

/** Exception that maps to a safe client-facing error response. */
class HttpException extends \RuntimeException
{
    public function __construct(
        public readonly int $status,
        public readonly string $errorCode,
        string $message,
        public readonly array $fields = []
    ) {
        parent::__construct($message, $status);
    }

    public static function validation(array $fields, string $message = 'Please correct the highlighted fields.'): self
    {
        return new self(422, 'validation_failed', $message, $fields);
    }

    public static function unauthorized(string $message = 'Please sign in to continue.'): self
    {
        return new self(401, 'unauthenticated', $message);
    }

    public static function forbidden(string $message = 'You do not have permission to perform this action.'): self
    {
        return new self(403, 'forbidden', $message);
    }

    public static function notFound(string $message = 'The requested item was not found.'): self
    {
        return new self(404, 'not_found', $message);
    }

    public static function conflict(string $message, string $code = 'conflict'): self
    {
        return new self(409, $code, $message);
    }

    public static function tooMany(int $retryAfter): self
    {
        return new self(429, 'rate_limited', "Too many attempts. Please wait {$retryAfter} seconds and try again.", ['retry_after' => $retryAfter]);
    }
}
