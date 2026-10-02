<?php
/** Base for all admin controllers: enforces authentication + private, uncacheable responses. */
abstract class AdminController
{
    public function __construct()
    {
        Auth::require();
        header('Cache-Control: no-store, private');
        header('X-Robots-Tag: noindex, nofollow');
    }

    protected function id(string $id): int
    {
        $n = (int) $id;
        if ($n <= 0) {
            Response::fail('অবৈধ অনুরোধ।', [], 400);
        }
        return $n;
    }

    protected static function dt(?string $v): ?string
    {
        $v = trim((string) $v);
        if ($v === '') {
            return null;
        }
        $t = strtotime($v);
        return $t ? date('Y-m-d H:i:s', $t) : null;
    }

    protected static function money(mixed $v, bool $nullable = false): ?float
    {
        if ($nullable && ($v === null || trim((string) $v) === '')) {
            return null;
        }
        return is_numeric($v) ? max(0, round((float) $v, 2)) : 0.0;
    }

    /** Store an optional single uploaded image; returns null when nothing was uploaded. */
    protected static function upload(string $field, string $folder, int $maxW = 512, string $format = 'webp'): ?string
    {
        $f = Request::file($field);
        if (!$f || ($f['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
            return null;
        }
        try {
            return ImageProcessor::storeSingle($f, $folder, $maxW, $format);
        } catch (UploadException $e) {
            Response::fail($e->getMessage(), [$field => $e->getMessage()]);
        } catch (Throwable $e) {
            Logger::error('Upload failed: ' . $e->getMessage());
            Notifier::add('upload_error', 'আপলোড ত্রুটি', 'একটি ছবি প্রসেস করা যায়নি।');
            Response::fail('ছবিটি প্রসেস করা যায়নি। অন্য ছবি চেষ্টা করুন।');
        }
    }

    protected static function photo(string $field, string $folder, int $md = 1200): ?array
    {
        $f = Request::file($field);
        if (!$f || ($f['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
            return null;
        }
        try {
            return ImageProcessor::storePhoto($f, $folder, $md);
        } catch (UploadException $e) {
            Response::fail($e->getMessage(), [$field => $e->getMessage()]);
        } catch (Throwable $e) {
            Logger::error('Upload failed: ' . $e->getMessage());
            Notifier::add('upload_error', 'আপলোড ত্রুটি', 'একটি ছবি প্রসেস করা যায়নি।');
            Response::fail('ছবিটি প্রসেস করা যায়নি। অন্য ছবি চেষ্টা করুন।');
        }
    }
}
