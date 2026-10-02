<?php
/**
 * Secure uploads + image compression/thumbnailing (GD).
 *
 * - extension AND real MIME (finfo) AND decode check
 * - images are re-encoded (strips metadata and any embedded payload)
 * - random file names, never executable (uploads dir has no PHP handler)
 * - private files (payment screenshots, contact attachments) live outside
 *   the public folder and are streamed through /file/{type}/{id}
 */
defined('APP') || exit;

const IMAGE_MIMES = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'];
const DOC_MIMES = ['pdf' => 'application/pdf'];

function upload_error_message(int $code): string
{
    return match ($code) {
        UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => t('err.file_too_large', ['n' => (int)setting('media.max_upload_mb', 10)]),
        UPLOAD_ERR_NO_FILE => t('err.file_missing'),
        default => t('err.upload_failed'),
    };
}

/**
 * Validate and store an uploaded file.
 * $kind: 'image' (public, compressed), 'private_image', 'document' (pdf/jpg/png, public), 'private_doc'
 * Returns ['path','mime','size','original_size','width','height','thumb'] or throws with a friendly message.
 */
function store_upload(array $file, string $kind = 'image', array $opt = []): array
{
    if (!isset($file['error']) || is_array($file['error'])) throw new RuntimeException(t('err.upload_failed'));
    if ($file['error'] !== UPLOAD_ERR_OK) throw new RuntimeException(upload_error_message((int)$file['error']));
    if (!is_uploaded_file($file['tmp_name']) && empty($opt['trusted'])) throw new RuntimeException(t('err.upload_failed'));

    $maxMb = (float)($opt['max_mb'] ?? setting('media.max_upload_mb', 10));
    if ($file['size'] <= 0 || $file['size'] > $maxMb * 1048576) throw new RuntimeException(t('err.file_too_large', ['n' => $maxMb]));

    $ext = strtolower(pathinfo((string)$file['name'], PATHINFO_EXTENSION));
    $allowedImg = array_intersect_key(IMAGE_MIMES, array_flip(array_map('trim', explode(',', strtolower((string)setting('media.allowed_types', 'jpg,jpeg,png,webp'))))));
    if (!$allowedImg) $allowedImg = IMAGE_MIMES;
    $allowed = in_array($kind, ['document', 'private_doc'], true) ? $allowedImg + DOC_MIMES : $allowedImg;
    if (!isset($allowed[$ext])) throw new RuntimeException(t('err.file_type', ['types' => strtoupper(implode(', ', array_keys($allowed)))]));

    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
    if ($mime !== $allowed[$ext] && !($ext === 'jpg' && $mime === 'image/jpeg')) throw new RuntimeException(t('err.file_type', ['types' => strtoupper(implode(', ', array_keys($allowed)))]));

    $private = str_starts_with($kind, 'private');
    $baseDir = $private ? ROOT . '/storage/private' : ROOT . '/assets/uploads';
    $sub = date('Y/m');
    if (!is_dir("$baseDir/$sub") && !mkdir("$baseDir/$sub", 0755, true)) throw new RuntimeException(t('err.upload_failed'));
    $name = bin2hex(random_bytes(16));

    if ($mime === 'application/pdf') {
        $fh = fopen($file['tmp_name'], 'rb');
        $head = fread($fh, 5);
        fclose($fh);
        if ($head !== '%PDF-') throw new RuntimeException(t('err.file_type', ['types' => 'PDF']));
        $dest = "$baseDir/$sub/$name.pdf";
        if (!move_uploaded_file($file['tmp_name'], $dest) && !copy($file['tmp_name'], $dest)) throw new RuntimeException(t('err.upload_failed'));
        return ['path' => ($private ? '' : 'assets/uploads/') . "$sub/$name.pdf", 'mime' => $mime, 'size' => filesize($dest), 'original_size' => $file['size'], 'width' => null, 'height' => null, 'thumb' => null];
    }

    // ----- images: decode → (resize) → re-encode -----
    $info = @getimagesize($file['tmp_name']);
    if (!$info || $info[0] < 1 || $info[1] < 1 || $info[0] * $info[1] > 40_000_000) throw new RuntimeException(t('err.bad_image'));
    $compress = $opt['compress'] ?? setting_bool('media.compress_enabled');
    $result = process_image($file['tmp_name'], "$baseDir/$sub/$name", $mime, [
        'compress' => $compress,
        'target_percent' => (int)($opt['target_percent'] ?? setting('media.target_percent', 10)),
        'max_dim' => (int)($opt['max_dim'] ?? setting('media.max_dimension', 1920)),
        'webp' => ($opt['webp'] ?? setting_bool('media.convert_webp')) && function_exists('imagewebp'),
        'thumb' => !$private && ($opt['thumb'] ?? true) ? (int)setting('media.thumb_width', 480) : 0,
    ]);
    $prefix = $private ? '' : 'assets/uploads/';
    return [
        'path' => $prefix . $sub . '/' . basename($result['file']),
        'thumb' => $result['thumb'] ? $prefix . $sub . '/' . basename($result['thumb']) : null,
        'mime' => $result['mime'], 'size' => filesize($result['file']), 'original_size' => (int)$file['size'],
        'width' => $result['width'], 'height' => $result['height'],
    ];
}

function gd_load(string $path, string $mime): GdImage
{
    $im = match ($mime) {
        'image/jpeg' => @imagecreatefromjpeg($path),
        'image/png' => @imagecreatefrompng($path),
        'image/webp' => @imagecreatefromwebp($path),
        default => false,
    };
    if (!$im) throw new RuntimeException(t('err.bad_image'));
    if ($mime === 'image/jpeg' && function_exists('exif_read_data')) {
        $exif = @exif_read_data($path);
        $rot = [3 => 180, 6 => -90, 8 => 90][$exif['Orientation'] ?? 0] ?? 0;
        if ($rot) $im = imagerotate($im, $rot, 0);
    }
    return $im;
}

function gd_resize(GdImage $im, int $maxW, int $maxH = 0): GdImage
{
    $w = imagesx($im);
    $h = imagesy($im);
    $maxH = $maxH ?: $maxW;
    $scale = min(1, $maxW / $w, $maxH / $h);
    if ($scale >= 1) return $im;
    $nw = max(1, (int)round($w * $scale));
    $nh = max(1, (int)round($h * $scale));
    $out = imagecreatetruecolor($nw, $nh);
    imagealphablending($out, false);
    imagesavealpha($out, true);
    imagefill($out, 0, 0, imagecolorallocatealpha($out, 0, 0, 0, 127));
    imagecopyresampled($out, $im, 0, 0, 0, 0, $nw, $nh, $w, $h);
    return $out;
}

function gd_save(GdImage $im, string $file, string $mime, int $quality): void
{
    imagesavealpha($im, true);
    match ($mime) {
        'image/webp' => imagewebp($im, $file, $quality),
        'image/png' => imagepng($im, $file, 9),
        default => imagejpeg($im, $file, $quality),
    };
}

/**
 * Re-encode an image, aiming for target_percent of the original size by
 * stepping quality down (never below media.min_quality) and, if needed,
 * scaling dimensions. Returns file/mime/size/dimensions/thumb.
 */
function process_image(string $src, string $destBase, string $mime, array $o): array
{
    $im = gd_load($src, $mime);
    if (!imageistruecolor($im)) imagepalettetotruecolor($im);
    $origSize = filesize($src);
    $im = gd_resize($im, max(320, $o['max_dim']));

    $outMime = $o['webp'] ? 'image/webp' : ($mime === 'image/png' ? 'image/png' : $mime);
    $ext = ['image/webp' => 'webp', 'image/png' => 'png', 'image/jpeg' => 'jpg'][$outMime];
    $file = "$destBase.$ext";
    $minQ = max(10, min(95, (int)setting('media.min_quality', 45)));

    if (!$o['compress']) {
        gd_save($im, $file, $outMime, 90);
    } else {
        $target = max(1, $origSize * max(1, min(100, $o['target_percent'])) / 100);
        $q = 85;
        $work = $im;
        for ($pass = 0; $pass < 12; $pass++) {
            gd_save($work, $file, $outMime, $q);
            clearstatcache(true, $file);
            if (filesize($file) <= $target) break;
            if ($outMime !== 'image/png' && $q - 8 >= $minQ) { $q -= 8; continue; }
            // quality floor reached (or PNG): shrink dimensions by 15%
            $nw = (int)(imagesx($work) * 0.85);
            if ($nw < 480) break;
            $work = gd_resize($work, $nw, (int)(imagesy($work) * 0.85));
        }
        $im = $work;
    }
    // never return something bigger than the original upload when nothing else changed
    clearstatcache(true, $file);

    $thumb = null;
    if (!empty($o['thumb']) && imagesx($im) > $o['thumb']) {
        $t = gd_resize($im, $o['thumb'], $o['thumb'] * 3);
        $thumbMime = function_exists('imagewebp') ? 'image/webp' : 'image/jpeg';
        $thumb = $destBase . '-thumb.' . ($thumbMime === 'image/webp' ? 'webp' : 'jpg');
        gd_save($t, $thumb, $thumbMime, 72);
    }
    return ['file' => $file, 'mime' => $outMime, 'width' => imagesx($im), 'height' => imagesy($im), 'thumb' => $thumb];
}

/** Register a public upload in the media library. */
function media_register(array $f, string $originalName, ?string $tag = null): int
{
    return insert('media', [
        'path' => $f['path'], 'thumb' => $f['thumb'] ?? null, 'original_name' => mb_substr($originalName, 0, 255),
        'mime' => $f['mime'], 'size' => $f['size'], 'original_size' => $f['original_size'] ?? null,
        'width' => $f['width'] ?? null, 'height' => $f['height'] ?? null, 'usage_tag' => $tag, 'uploaded_by' => user()['id'] ?? null,
    ]);
}

/** Delete a public upload (and thumb) from disk, only inside assets/uploads. */
function delete_public_file(?string $path): void
{
    if (!$path || !str_starts_with($path, 'assets/uploads/') || str_contains($path, '..')) return;
    @unlink(ROOT . '/' . $path);
}

/** Responsive <img> with thumbnail srcset when available. */
function img_tag(?string $path, string $alt, array $attr = []): string
{
    if (!$path) return '';
    $src = media_url($path);
    $thumb = null;
    if (str_starts_with($path, 'assets/uploads/')) {
        $t = preg_replace('~\.(webp|jpe?g|png)$~', '-thumb.webp', $path);
        if (is_file(ROOT . '/' . $t)) $thumb = $t;
        elseif (is_file(ROOT . '/' . ($t2 = preg_replace('~\.(webp|jpe?g|png)$~', '-thumb.jpg', $path)))) $thumb = $t2;
    }
    $a = ['src' => $src, 'alt' => $alt, 'loading' => 'lazy', 'decoding' => 'async'] + $attr;
    if ($thumb) {
        $a['src'] = media_url($thumb);
        $a['srcset'] = media_url($thumb) . ' ' . (int)setting('media.thumb_width', 480) . 'w, ' . $src . ' 1600w';
        $a['sizes'] = $attr['sizes'] ?? '(max-width: 640px) 100vw, 640px';
    }
    $html = '<img';
    foreach ($a as $k => $v) if ($v !== null && $v !== false) $html .= ' ' . $k . '="' . e($v) . '"';
    return $html . '>';
}

/** Stream a private file after an authorisation check. */
function serve_private_file(string $type, int $id): void
{
    $u = user();
    if (!$u) render_error(403);
    if ($type === 'payment') {
        $r = row('SELECT user_id, screenshot AS f FROM payments WHERE id = ?', [$id]);
        $allowed = $r && ((int)$r['user_id'] === (int)$u['id'] || can('payments', $u));
    } else {
        $r = row('SELECT attachment AS f FROM contact_messages WHERE id = ?', [$id]);
        $allowed = $r && can('support', $u);
    }
    $path = $r['f'] ?? '';
    $full = realpath(ROOT . '/storage/private/' . $path);
    if (!$allowed || !$path || !$full || !str_starts_with($full, realpath(ROOT . '/storage/private') . DIRECTORY_SEPARATOR)) {
        render_error(404);
        return;
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($full);
    header('Content-Type: ' . $mime);
    header('Content-Length: ' . filesize($full));
    header('Content-Disposition: inline; filename="' . $type . '-' . $id . '.' . pathinfo($full, PATHINFO_EXTENSION) . '"');
    header('Cache-Control: private, max-age=3600');
    header('X-Content-Type-Options: nosniff');
    header("Content-Security-Policy: default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    readfile($full);
}
