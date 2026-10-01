<?php
/**
 * Safe image uploads (JPG/JPEG/PNG/WEBP). Files are verified by content,
 * re-encoded with GD (strips EXIF/metadata & any embedded payload) and saved
 * as WebP when supported, under /uploads/{folder}/{Y}/{m}/ with random names.
 */
declare(strict_types=1);

final class Upload
{
    private const ALLOWED = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];

    /** @return array{path:string, mime:string, size:int} */
    public static function image(array $file, string $folder, int $maxBytes = 5242880, int $maxDim = 2000, bool $preferWebp = true): array
    {
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) {
            throw new DomainException('ফাইল আপলোড করা যায়নি। আবার চেষ্টা করুন।');
        }
        if ($file['size'] > $maxBytes) {
            throw new DomainException('ফাইলের আকার সর্বোচ্চ ' . bn_digits((string) round($maxBytes / 1048576)) . ' MB হতে পারে।');
        }
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
        $info = @getimagesize($file['tmp_name']);
        if (!isset(self::ALLOWED[$mime]) || !$info || !isset(self::ALLOWED[$info['mime']])) {
            throw new DomainException('শুধুমাত্র JPG, JPEG, PNG বা WEBP ছবি আপলোড করা যাবে।');
        }
        $img = match ($mime) {
            'image/jpeg' => @imagecreatefromjpeg($file['tmp_name']),
            'image/png'  => @imagecreatefrompng($file['tmp_name']),
            'image/webp' => @imagecreatefromwebp($file['tmp_name']),
        };
        if (!$img) {
            throw new DomainException('ছবিটি পড়া যাচ্ছে না। অন্য ছবি দিন।');
        }
        [$w, $h] = [imagesx($img), imagesy($img)];
        if ($w > $maxDim || $h > $maxDim) {
            $ratio = min($maxDim / $w, $maxDim / $h);
            $nw = (int) round($w * $ratio);
            $nh = (int) round($h * $ratio);
            $resized = imagecreatetruecolor($nw, $nh);
            imagealphablending($resized, false);
            imagesavealpha($resized, true);
            imagecopyresampled($resized, $img, 0, 0, 0, 0, $nw, $nh, $w, $h);
            imagedestroy($img);
            $img = $resized;
        } else {
            imagepalettetotruecolor($img);
            imagealphablending($img, false);
            imagesavealpha($img, true);
        }
        $folder = preg_replace('/[^a-z0-9_-]/', '', strtolower($folder)) ?: 'misc';
        $dir = 'uploads/' . $folder . '/' . date('Y/m');
        if (!is_dir(ROOT . '/' . $dir) && !mkdir(ROOT . '/' . $dir, 0755, true) && !is_dir(ROOT . '/' . $dir)) {
            throw new RuntimeException('Cannot create upload directory');
        }
        $name = bin2hex(random_bytes(12));
        if ($preferWebp && function_exists('imagewebp')) {
            $rel = $dir . '/' . $name . '.webp';
            $ok = imagewebp($img, ROOT . '/' . $rel, 82);
            $outMime = 'image/webp';
        } elseif ($mime === 'image/png' || $mime === 'image/webp') {
            $rel = $dir . '/' . $name . '.png';
            $ok = imagepng($img, ROOT . '/' . $rel, 7);
            $outMime = 'image/png';
        } else {
            $rel = $dir . '/' . $name . '.jpg';
            $ok = imagejpeg($img, ROOT . '/' . $rel, 85);
            $outMime = 'image/jpeg';
        }
        imagedestroy($img);
        if (!$ok) {
            throw new RuntimeException('Image save failed');
        }
        return ['path' => $rel, 'mime' => $outMime, 'size' => (int) filesize(ROOT . '/' . $rel)];
    }

    /** Normalise $_FILES['x'] multi-upload into a list. */
    public static function files(string $field): array
    {
        $f = $_FILES[$field] ?? null;
        if (!$f) {
            return [];
        }
        if (!is_array($f['name'])) {
            return ($f['error'] === UPLOAD_ERR_NO_FILE) ? [] : [$f];
        }
        $out = [];
        foreach ($f['name'] as $i => $n) {
            if ($f['error'][$i] === UPLOAD_ERR_NO_FILE) {
                continue;
            }
            $out[] = ['name' => $n, 'type' => $f['type'][$i], 'tmp_name' => $f['tmp_name'][$i], 'error' => $f['error'][$i], 'size' => $f['size'][$i]];
        }
        return $out;
    }

    public static function delete(?string $path): void
    {
        $path = (string) $path;
        if ($path !== '' && str_starts_with($path, 'uploads/') && !str_contains($path, '..') && is_file(ROOT . '/' . $path)) {
            @unlink(ROOT . '/' . $path);
        }
    }
}
