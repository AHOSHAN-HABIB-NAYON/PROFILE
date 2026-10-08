<?php
/**
 * Exception carrying an HTTP status and a message that is safe to show users.
 */
class HttpException extends RuntimeException
{
    private int $status;

    public function __construct(int $status, string $message = '')
    {
        $this->status = $status;
        parent::__construct($message !== '' ? $message : self::defaultMessage($status), $status);
    }

    public function getStatus(): int
    {
        return $this->status;
    }

    private static function defaultMessage(int $status): string
    {
        return [
            400 => 'অনুরোধটি সঠিক নয়।',
            401 => 'অনুগ্রহ করে লগইন করুন।',
            403 => 'এই কাজের অনুমতি নেই।',
            404 => 'পেজটি পাওয়া যায়নি।',
            405 => 'অনুরোধটি সমর্থিত নয়।',
            419 => 'সেশনের মেয়াদ শেষ। পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।',
            422 => 'তথ্যগুলো সঠিকভাবে পূরণ করুন।',
            429 => 'অনেক বেশি অনুরোধ। কিছুক্ষণ পর আবার চেষ্টা করুন।',
        ][$status] ?? 'দুঃখিত, অনুরোধটি সম্পন্ন করা যায়নি।';
    }
}
