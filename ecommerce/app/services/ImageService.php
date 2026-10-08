<?php
/**
 * Secure image upload + adaptive compression (GD).
 *
 *  - Validates real image content (finfo MIME + getimagesize), size and dimensions.
 *  - Never uses the original filename; re-encodes pixels (drops any embedded payload/EXIF).
 *  - Fixes phone camera orientation.
 *  - Generates responsive variants (lg/md/sm) as WebP (JPEG fallback if WebP unsupported).
 *  - Adaptive quality: steps quality down only until the size target is met,
 *    never below a visual-quality floor — e.g. a 5 MB photo lands around 150–500 KB.
 */
final class ImageService
{
    private const QUALITY_START = 84;
    private const QUALITY_FLOOR = 62;

    /**
     * Upload & create resized variants. $type: product | banner | category
     * @return array{path:string, ext:string, width:int, height:int, bytes:int, original_bytes:int}
     */
    public static function storeVariants(array $file, string $type): array
    {
        [$img, $info] = self::load($file);
        $sizes = config('image_sizes')[$type] ?? throw new InvalidArgumentException('Unknown image type');
        if ($type === 'banner') {
            $img = self::cropToRatio($img, 2.0);
        } elseif ($type === 'category') {
            $img = self::cropToRatio($img, 1.0);
        }
        $ext = self::outputExt();
        $base = self::newBasePath($type . 's');
        $abs = UPLOAD_PATH . '/' . $base;
        $origBytes = (int)$file['size'];
        $total = 0;
        $largestW = 0;
        $largestH = 0;
        foreach ($sizes as $suffix => $maxWidth) {
            $resized = self::resize($img, $maxWidth, (int)round($maxWidth * 1.5));
            $target = self::targetBytes($origBytes, imagesx($resized) * imagesy($resized));
            $bytes = self::encode($resized, $abs . '-' . $suffix . '.' . $ext, $ext, $target);
            if ($suffix === array_key_first($sizes)) {
                $largestW = imagesx($resized);
                $largestH = imagesy($resized);
                $total = $bytes;
            }
            if ($resized !== $img) {
                imagedestroy($resized);
            }
        }
        imagedestroy($img);
        return ['path' => $base, 'ext' => $ext, 'width' => $largestW, 'height' => $largestH, 'bytes' => $total, 'original_bytes' => $origBytes];
    }

    /**
     * Upload a single optimized image (logo, OG image, editor image, category icon).
     * Returns the path relative to uploads/ including extension.
     */
    public static function storeSingle(array $file, string $folder, int $maxWidth, ?float $ratio = null, bool $png = false): string
    {
        [$img] = self::load($file);
        if ($ratio !== null) {
            $img = self::cropToRatio($img, $ratio);
        }
        $resized = self::resize($img, $maxWidth, $maxWidth * 2);
        $ext = $png ? 'png' : self::outputExt();
        $path = self::newBasePath($folder) . '.' . $ext;
        self::encode($resized, UPLOAD_PATH . '/' . $path, $ext, self::targetBytes((int)$file['size'], imagesx($resized) * imagesy($resized)));
        imagedestroy($resized);
        return $path;
    }

    /** Square PNG icons for PWA / favicon from an uploaded image. Returns [size => path]. */
    public static function storeIcons(array $file): array
    {
        [$img] = self::load($file);
        $square = self::cropToRatio($img, 1.0);
        $base = self::newBasePath('site');
        $out = [];
        foreach ([32, 180, 192, 512] as $size) {
            $canvas = self::canvas($size, $size, true);
            imagecopyresampled($canvas, $square, 0, 0, 0, 0, $size, $size, imagesx($square), imagesy($square));
            $path = $base . '-' . $size . '.png';
            imagepng($canvas, UPLOAD_PATH . '/' . $path, 8);
            imagedestroy($canvas);
            $out[$size] = $path;
        }
        return $out;
    }

    /**
     * Admin compressor tool: compress to a temporary file the admin can download.
     * @return array{file:string, name:string, original_bytes:int, bytes:int, width:int, height:int, quality:int}
     */
    public static function compressTool(array $file, int $maxWidth, string $format, ?int $targetKb): array
    {
        [$img] = self::load($file);
        $resized = self::resize($img, max(100, min(6000, $maxWidth)), 10000);
        $ext = $format === 'jpg' || !function_exists('imagewebp') ? 'jpg' : 'webp';
        $name = 'compressed-' . bin2hex(random_bytes(6)) . '.' . $ext;
        $target = $targetKb ? $targetKb * 1024 : self::targetBytes((int)$file['size'], imagesx($resized) * imagesy($resized));
        $quality = 0;
        $bytes = self::encode($resized, STORAGE_PATH . '/tmp/' . $name, $ext, $target, $quality);
        $result = ['file' => $name, 'name' => $name, 'original_bytes' => (int)$file['size'], 'bytes' => $bytes,
            'width' => imagesx($resized), 'height' => imagesy($resized), 'quality' => $quality];
        imagedestroy($resized);
        return $result;
    }

    public static function deleteVariants(string $path, string $ext, string $type): void
    {
        $path = self::safeRelative($path);
        if ($path === null) {
            return;
        }
        if ($type === 'single') {
            @unlink(UPLOAD_PATH . '/' . $path);
            return;
        }
        foreach (array_keys(config('image_sizes')[$type] ?? []) as $suffix) {
            @unlink(UPLOAD_PATH . '/' . $path . '-' . $suffix . '.' . $ext);
        }
    }

    // ------------------------------------------------------------------

    /** @return array{0: GdImage, 1: array} */
    private static function load(array $file): array
    {
        $cfg = config('upload');
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            throw new HttpException(422, match ($file['error'] ?? 0) {
                UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'ছবির সাইজ অনেক বড়।',
                default => 'ছবি আপলোড ব্যর্থ হয়েছে।',
            });
        }
        $tmp = (string)$file['tmp_name'];
        if (!is_uploaded_file($tmp) && !(APP_ENV === 'local' && is_file($tmp))) {
            throw new HttpException(422, 'ছবি আপলোড ব্যর্থ হয়েছে।');
        }
        if ((int)$file['size'] <= 0 || (int)$file['size'] > $cfg['max_bytes']) {
            throw new HttpException(422, 'ছবির সর্বোচ্চ সাইজ ' . round($cfg['max_bytes'] / 1048576) . 'MB।');
        }
        $ext = strtolower(pathinfo((string)($file['name'] ?? ''), PATHINFO_EXTENSION));
        if (preg_match('/^(php\d?|phtml|phar|pht|shtml|cgi|pl|py|sh|exe|js|html?|svg|htaccess)$/', $ext)) {
            throw new HttpException(422, 'এই ধরনের ফাইল অনুমোদিত নয়।');
        }
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($tmp) ?: '';
        if (!isset($cfg['allowed_mimes'][$mime])) {
            throw new HttpException(422, 'শুধু JPG, PNG, WEBP বা GIF ছবি দিন।');
        }
        $info = @getimagesize($tmp);
        if (!$info || $info[0] < 10 || $info[1] < 10) {
            throw new HttpException(422, 'ফাইলটি সঠিক ছবি নয়।');
        }
        if ($info[0] > $cfg['max_dimension'] || $info[1] > $cfg['max_dimension']) {
            throw new HttpException(422, 'ছবির দৈর্ঘ্য/প্রস্থ সর্বোচ্চ ' . $cfg['max_dimension'] . 'px হতে পারে।');
        }
        @ini_set('memory_limit', '512M');
        $img = match ($mime) {
            'image/jpeg' => @imagecreatefromjpeg($tmp),
            'image/png'  => @imagecreatefrompng($tmp),
            'image/webp' => @imagecreatefromwebp($tmp),
            'image/gif'  => @imagecreatefromgif($tmp),
        };
        if (!$img) {
            throw new HttpException(422, 'ছবিটি পড়া যায়নি। অন্য ছবি দিন।');
        }
        if (!imageistruecolor($img)) {
            imagepalettetotruecolor($img);
        }
        imagealphablending($img, true);
        imagesavealpha($img, true);
        if ($mime === 'image/jpeg' && function_exists('exif_read_data')) {
            $exif = @exif_read_data($tmp);
            $img = match ((int)($exif['Orientation'] ?? 1)) {
                3 => imagerotate($img, 180, 0),
                6 => imagerotate($img, -90, 0),
                8 => imagerotate($img, 90, 0),
                default => $img,
            };
        }
        return [$img, $info];
    }

    private static function resize(GdImage $img, int $maxW, int $maxH): GdImage
    {
        $w = imagesx($img);
        $h = imagesy($img);
        $scale = min(1, $maxW / $w, $maxH / $h);
        if ($scale >= 1) {
            return $img;
        }
        $nw = max(1, (int)round($w * $scale));
        $nh = max(1, (int)round($h * $scale));
        $dst = self::canvas($nw, $nh, true);
        imagecopyresampled($dst, $img, 0, 0, 0, 0, $nw, $nh, $w, $h);
        return $dst;
    }

    private static function cropToRatio(GdImage $img, float $ratio): GdImage
    {
        $w = imagesx($img);
        $h = imagesy($img);
        if (abs($w / $h - $ratio) < 0.01) {
            return $img;
        }
        if ($w / $h > $ratio) {
            $cw = (int)round($h * $ratio);
            $ch = $h;
        } else {
            $cw = $w;
            $ch = (int)round($w / $ratio);
        }
        $dst = self::canvas($cw, $ch, true);
        imagecopy($dst, $img, (int)(($w - $cw) / 2), (int)(($h - $ch) / 2), 0, 0, $cw, $ch);
        imagedestroy($img);
        return $dst;
    }

    private static function canvas(int $w, int $h, bool $alpha): GdImage
    {
        $c = imagecreatetruecolor($w, $h);
        if ($alpha) {
            imagealphablending($c, false);
            imagesavealpha($c, true);
            imagefill($c, 0, 0, imagecolorallocatealpha($c, 255, 255, 255, 127));
            imagealphablending($c, true);
        }
        return $c;
    }

    /** Size budget: ~10% of the original, scaled by pixel area, with sane floor/ceiling. */
    private static function targetBytes(int $originalBytes, int $pixels): int
    {
        $budget = (int)max(40_000, min(600_000, $originalBytes * 0.10));
        $areaFactor = min(1.0, $pixels / (1200 * 1200));
        return (int)max(15_000, $budget * max(0.15, $areaFactor));
    }

    private static function encode(GdImage $img, string $dest, string $ext, int $targetBytes, int &$usedQuality = 0): int
    {
        $dir = dirname($dest);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        if ($ext === 'png') {
            imagesavealpha($img, true);
            imagepng($img, $dest, 8);
            clearstatcache(true, $dest);
            return (int)filesize($dest);
        }
        if ($ext === 'jpg') {
            $flat = self::canvas(imagesx($img), imagesy($img), false);
            imagefill($flat, 0, 0, imagecolorallocate($flat, 255, 255, 255));
            imagecopy($flat, $img, 0, 0, 0, 0, imagesx($img), imagesy($img));
            $img = $flat;
            imageinterlace($img, true);
        }
        $quality = self::QUALITY_START;
        do {
            ob_start();
            $ext === 'webp' ? imagewebp($img, null, $quality) : imagejpeg($img, null, $quality);
            $data = (string)ob_get_clean();
            if (strlen($data) <= $targetBytes || $quality <= self::QUALITY_FLOOR) {
                break;
            }
            $quality -= 6;
        } while (true);
        $usedQuality = $quality;
        file_put_contents($dest, $data, LOCK_EX);
        return strlen($data);
    }

    private static function outputExt(): string
    {
        return function_exists('imagewebp') ? 'webp' : 'jpg';
    }

    private static function newBasePath(string $folder): string
    {
        $folder = preg_replace('/[^a-z0-9_-]/', '', $folder);
        return $folder . '/' . date('Y/m') . '/' . bin2hex(random_bytes(8));
    }

    private static function safeRelative(string $path): ?string
    {
        $path = ltrim(str_replace('\\', '/', $path), '/');
        return ($path === '' || str_contains($path, '..') || !preg_match('#^[a-z0-9_/.-]+$#i', $path)) ? null : $path;
    }
}
