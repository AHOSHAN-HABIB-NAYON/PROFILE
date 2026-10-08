<?php
/**
 * Uniform result returned by every courier operation.
 */
final class CourierResult
{
    public function __construct(
        public bool $ok,
        public string $message = '',
        public array $data = [],
        public array $raw = []
    ) {
    }

    public static function ok(string $message, array $data = [], array $raw = []): self
    {
        return new self(true, $message, $data, $raw);
    }

    public static function fail(string $message, array $raw = []): self
    {
        return new self(false, $message, [], $raw);
    }

    public static function unsupported(string $feature): self
    {
        return new self(false, "This courier's API does not support: $feature.");
    }
}
