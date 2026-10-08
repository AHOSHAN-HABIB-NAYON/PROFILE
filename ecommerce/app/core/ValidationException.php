<?php
/**
 * Field-level validation failure (HTTP 422) carrying per-field messages.
 */
final class ValidationException extends HttpException
{
    public function __construct(private array $errors)
    {
        parent::__construct(422, (string)(array_values($errors)[0] ?? 'তথ্যগুলো সঠিকভাবে পূরণ করুন।'));
    }

    public function errors(): array
    {
        return $this->errors;
    }
}
