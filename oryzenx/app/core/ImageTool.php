<?php
/** GD based image re-encoding, resizing and compression. */
final class ImageTool
{
    public static function load(string $path): ?GdImage
    {
        $type = @getimagesize($path)[2] ?? 0;
        $img = match ($type) {
            IMAGETYPE_JPEG => @imagecreatefromjpeg($path),
            IMAGETYPE_PNG => @imagecreatefrompng($path),
            IMAGETYPE_WEBP => function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($path) : false,
            IMAGETYPE_GIF => @imagecreatefromgif($path),
            default => false,
        };
        if (!$img) return null;
        if ($type === IMAGETYPE_JPEG && function_exists('exif_read_data')) {
            $o = @exif_read_data($path)['Orientation'] ?? 1;
            $img = match ((int)$o) { 3 => imagerotate($img, 180, 0), 6 => imagerotate($img, -90, 0), 8 => imagerotate($img, 90, 0), default => $img };
        }
        return $img;
    }

    /**
     * Re-encodes $src into $dest. Options: format (webp|jpg|png), quality 1-100,
     * max_width (0 = keep), square (crop to N×N, 0 = off).
     */
    public static function process(string $src, string $dest, array $o): ?array
    {
        $img = self::load($src);
        if (!$img) return null;
        $w = imagesx($img); $h = imagesy($img);
        $square = (int)($o['square'] ?? 0);
        if ($square > 0) {
            $side = min($w, $h);
            $out = self::canvas($square, $square);
            imagecopyresampled($out, $img, 0, 0, intdiv($w - $side, 2), intdiv($h - $side, 2), $square, $square, $side, $side);
            $img = $out; $w = $h = $square;
        } elseif (($max = (int)($o['max_width'] ?? 0)) > 0 && $w > $max) {
            $nh = (int)round($h * $max / $w);
            $out = self::canvas($max, $nh);
            imagecopyresampled($out, $img, 0, 0, 0, 0, $max, $nh, $w, $h);
            $img = $out; $w = $max; $h = $nh;
        }
        $q = max(10, min(100, (int)($o['quality'] ?? 75)));
        $fmt = $o['format'] ?? 'webp';
        if (!is_dir(dirname($dest))) mkdir(dirname($dest), 0775, true);
        $ok = match ($fmt) {
            'webp' => imagewebp($img, $dest, $q),
            'jpg', 'jpeg' => (function () use ($img, $dest, $q, $w, $h) {
                $bg = imagecreatetruecolor($w, $h);
                imagefill($bg, 0, 0, imagecolorallocate($bg, 255, 255, 255));
                imagecopy($bg, $img, 0, 0, 0, 0, $w, $h);
                imageinterlace($bg, true);
                return imagejpeg($bg, $dest, $q);
            })(),
            // PNG is lossless: map quality to compression level 0-9.
            'png' => imagepng($img, $dest, (int)round(9 - ($q / 100) * 9)),
            default => false,
        };
        if (!$ok) return null;
        @chmod($dest, 0644);
        clearstatcache(true, $dest);
        return ['path' => $dest, 'width' => $w, 'height' => $h, 'size' => filesize($dest)];
    }

    private static function canvas(int $w, int $h): GdImage
    {
        $c = imagecreatetruecolor($w, $h);
        imagealphablending($c, false);
        imagesavealpha($c, true);
        imagefill($c, 0, 0, imagecolorallocatealpha($c, 0, 0, 0, 127));
        return $c;
    }

    /** Generates default PWA icons (rounded square with the site initial). */
    public static function generateIcon(int $size, string $dest, string $hex, string $letter = 'O'): void
    {
        $img = imagecreatetruecolor($size, $size);
        imagesavealpha($img, true);
        [$r, $g, $b] = sscanf(ltrim($hex, '#'), '%02x%02x%02x');
        imagefill($img, 0, 0, imagecolorallocate($img, $r ?? 37, $g ?? 99, $b ?? 235));
        $white = imagecolorallocate($img, 255, 255, 255);
        // Simple bar-chart mark (works without a TTF font).
        $bw = (int)($size * 0.09); $gap = (int)($size * 0.06);
        $heights = [0.30, 0.46, 0.36, 0.56];
        $total = 4 * $bw + 3 * $gap; $x = intdiv($size - $total, 2); $base = (int)($size * 0.72);
        foreach ($heights as $hh) {
            imagefilledrectangle($img, $x, $base - (int)($size * $hh), $x + $bw, $base, $white);
            $x += $bw + $gap;
        }
        if (!is_dir(dirname($dest))) mkdir(dirname($dest), 0775, true);
        imagepng($img, $dest, 9);
    }

    /** Resizes an uploaded icon into a square PNG for the manifest. */
    public static function squarePng(string $src, string $dest, int $size): bool
    {
        return (bool)self::process($src, $dest, ['format' => 'png', 'square' => $size, 'quality' => 100]);
    }
}
