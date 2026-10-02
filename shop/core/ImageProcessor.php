<?php
/**
 * Secure upload + adaptive compression.
 * Every photo becomes WebP + JPEG fallback in two sizes (md 1200px, sm 400px).
 * Target size is ~10% of the original (5MB → ~500KB, 1MB → ~100KB), bounded so quality never collapses.
 */
final class ImageProcessor
{
    private const MIMES = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];
    private const MIN_QUALITY = 52;

    public static function validate(array $file): ?string
    {
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            return match ($file['error'] ?? 0) {
                UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'ছবির সাইজ অনেক বড়।',
                UPLOAD_ERR_NO_FILE => 'কোনো ছবি নির্বাচন করা হয়নি।',
                default => 'ছবি আপলোড ব্যর্থ হয়েছে।',
            };
        }
        if (!is_uploaded_file($file['tmp_name']) && !defined('SHOP_CLI')) {
            return 'অবৈধ আপলোড।';
        }
        if ($file['size'] > Config::get('upload.max_bytes', 10485760)) {
            return 'ছবির সাইজ সর্বোচ্চ ১০MB হতে পারবে।';
        }
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
        if (!isset(self::MIMES[$mime])) {
            return 'শুধুমাত্র JPG, PNG, WebP বা GIF ছবি আপলোড করা যাবে।';
        }
        $info = @getimagesize($file['tmp_name']);
        if (!$info || $info[0] < 16 || $info[1] < 16 || $info[0] * $info[1] > 40_000_000) {
            return 'ছবিটি সঠিক নয়।';
        }
        return null;
    }

    private static function load(string $path): GdImage
    {
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($path);
        $img = match ($mime) {
            'image/jpeg' => @imagecreatefromjpeg($path),
            'image/png'  => @imagecreatefrompng($path),
            'image/webp' => @imagecreatefromwebp($path),
            'image/gif'  => @imagecreatefromgif($path),
            default      => false,
        };
        if (!$img) {
            throw new RuntimeException('Unable to decode image');
        }
        if ($mime === 'image/jpeg' && function_exists('exif_read_data')) {
            $exif = @exif_read_data($path);
            $o = (int) ($exif['Orientation'] ?? 1);
            $img = match ($o) {
                3 => imagerotate($img, 180, 0),
                6 => imagerotate($img, -90, 0),
                8 => imagerotate($img, 90, 0),
                default => $img,
            };
        }
        if (!imageistruecolor($img)) {
            imagepalettetotruecolor($img);
        }
        return $img;
    }

    private static function resize(GdImage $src, int $maxW, int $maxH = 0, bool $alpha = false): GdImage
    {
        $w = imagesx($src);
        $h = imagesy($src);
        $maxH = $maxH ?: $maxW * 4;
        $ratio = min(1, $maxW / $w, $maxH / $h);
        $nw = max(1, (int) round($w * $ratio));
        $nh = max(1, (int) round($h * $ratio));
        $dst = imagecreatetruecolor($nw, $nh);
        if ($alpha) {
            imagealphablending($dst, false);
            imagesavealpha($dst, true);
            imagefill($dst, 0, 0, imagecolorallocatealpha($dst, 0, 0, 0, 127));
        } else {
            imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255));
        }
        imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
        return $dst;
    }

    /** Encode with decreasing quality until under target bytes. */
    private static function encode(GdImage $img, string $format, int $targetBytes): string
    {
        $data = '';
        for ($q = 86; $q >= self::MIN_QUALITY; $q -= 6) {
            ob_start();
            $format === 'webp' ? imagewebp($img, null, $q) : imagejpeg($img, null, $q);
            $data = (string) ob_get_clean();
            if (strlen($data) <= $targetBytes) {
                break;
            }
        }
        return $data;
    }

    private static function targetDir(string $folder): array
    {
        $rel = 'uploads/' . $folder . '/' . date('Y/m');
        $abs = BASE_PATH . '/' . $rel;
        if (!is_dir($abs) && !mkdir($abs, 0755, true) && !is_dir($abs)) {
            throw new RuntimeException('Cannot create upload dir');
        }
        return [$rel, $abs];
    }

    /**
     * Product/banner/combo photo → base path (without suffix). Files: base-md.webp/.jpg, base-sm.webp/.jpg.
     * @return array{path:string,width:int,height:int}
     */
    public static function storePhoto(array $file, string $folder, int $mdWidth = 1200, int $smWidth = 400): array
    {
        if ($err = self::validate($file)) {
            throw new UploadException($err);
        }
        $src = self::load($file['tmp_name']);
        [$rel, $abs] = self::targetDir($folder);
        $name = bin2hex(random_bytes(8));
        $orig = max(1, (int) $file['size']);
        $target = (int) min(max($orig * 0.10, 60 * 1024), 500 * 1024);

        $md = self::resize($src, $mdWidth);
        $sm = self::resize($src, $smWidth);
        $files = [
            "{$name}-md.webp" => self::encode($md, 'webp', $target),
            "{$name}-md.jpg"  => self::encode($md, 'jpg', (int) ($target * 1.4)),
            "{$name}-sm.webp" => self::encode($sm, 'webp', 40 * 1024),
            "{$name}-sm.jpg"  => self::encode($sm, 'jpg', 55 * 1024),
        ];
        foreach ($files as $fn => $bytes) {
            file_put_contents($abs . '/' . $fn, $bytes, LOCK_EX);
        }
        $result = ['path' => $rel . '/' . $name, 'width' => imagesx($md), 'height' => imagesy($md)];
        imagedestroy($src);
        imagedestroy($md);
        imagedestroy($sm);
        return $result;
    }

    /** Logo/icon/favicon/editor image → single file path with extension (keeps transparency). */
    public static function storeSingle(array $file, string $folder, int $maxW = 512, string $format = 'webp', int $square = 0): string
    {
        if ($err = self::validate($file)) {
            throw new UploadException($err);
        }
        $src = self::load($file['tmp_name']);
        [$rel, $abs] = self::targetDir($folder);
        $name = bin2hex(random_bytes(8)) . '.' . $format;
        if ($square) {
            $img = self::square($src, $square);
        } else {
            $img = self::resize($src, $maxW, 0, $format !== 'jpg');
        }
        match ($format) {
            'png'  => imagepng($img, $abs . '/' . $name, 8),
            'jpg'  => file_put_contents($abs . '/' . $name, self::encode($img, 'jpg', 250 * 1024)),
            default => (function () use ($img, $abs, $name) { imagealphablending($img, false); imagesavealpha($img, true); file_put_contents($abs . '/' . $name, self::encode($img, 'webp', 250 * 1024)); })(),
        };
        imagedestroy($src);
        imagedestroy($img);
        return $rel . '/' . $name;
    }

    /** Fit image into a transparent square canvas (PWA icons, favicons). */
    public static function square(GdImage $src, int $size, int $padding = 0): GdImage
    {
        $dst = imagecreatetruecolor($size, $size);
        imagealphablending($dst, false);
        imagesavealpha($dst, true);
        imagefill($dst, 0, 0, imagecolorallocatealpha($dst, 0, 0, 0, 127));
        imagealphablending($dst, true);
        $w = imagesx($src);
        $h = imagesy($src);
        $inner = $size - $padding * 2;
        $r = min($inner / $w, $inner / $h);
        $nw = (int) round($w * $r);
        $nh = (int) round($h * $r);
        imagecopyresampled($dst, $src, (int) (($size - $nw) / 2), (int) (($size - $nh) / 2), 0, 0, $nw, $nh, $w, $h);
        return $dst;
    }

    /** Build PWA icons (192/512 + maskable) from an uploaded image path (relative). */
    public static function buildPwaIcons(string $relPath): void
    {
        $abs = BASE_PATH . '/' . ltrim($relPath, '/');
        if (!is_file($abs)) {
            return;
        }
        $src = self::load($abs);
        foreach ([192, 512] as $s) {
            $icon = self::square($src, $s);
            imagepng($icon, BASE_PATH . "/uploads/branding/icon-{$s}.png", 8);
            imagedestroy($icon);
            $mask = imagecreatetruecolor($s, $s);
            imagefill($mask, 0, 0, imagecolorallocate($mask, 255, 255, 255));
            imagealphablending($mask, true);
            $inner = self::square($src, $s, (int) ($s * 0.12));
            imagecopy($mask, $inner, 0, 0, 0, 0, $s, $s);
            imagepng($mask, BASE_PATH . "/uploads/branding/icon-maskable-{$s}.png", 8);
            imagedestroy($mask);
            imagedestroy($inner);
        }
        imagedestroy($src);
    }

    /** Remove all generated files for a photo base path or single file. */
    public static function delete(?string $path): void
    {
        if (!$path || !str_starts_with($path, 'uploads/') || str_contains($path, '..')) {
            return;
        }
        $abs = BASE_PATH . '/' . $path;
        if (is_file($abs)) {
            @unlink($abs);
            return;
        }
        foreach (['-md.webp', '-md.jpg', '-sm.webp', '-sm.jpg'] as $suffix) {
            if (is_file($abs . $suffix)) {
                @unlink($abs . $suffix);
            }
        }
    }
}
