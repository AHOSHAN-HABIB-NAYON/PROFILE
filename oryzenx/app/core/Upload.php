<?php
/**
 * Secure upload handling. Images are always decoded and re-encoded with GD,
 * which strips any embedded payloads; documents are checked by magic bytes.
 */
final class Upload
{
    private const IMAGE_MIME = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];
    private const DOC_MIME = ['application/pdf' => 'pdf'];

    public static function present(string $field): bool
    {
        return isset($_FILES[$field]) && is_array($_FILES[$field]) && ($_FILES[$field]['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE;
    }

    private static function check(string $field, float $maxMb): array
    {
        $f = $_FILES[$field] ?? null;
        if (!$f || is_array($f['error'])) throw new UploadError(t('upload.invalid'));
        if ($f['error'] !== UPLOAD_ERR_OK) throw new UploadError($f['error'] === UPLOAD_ERR_INI_SIZE || $f['error'] === UPLOAD_ERR_FORM_SIZE ? t('upload.too_big', ['n' => $maxMb]) : t('upload.failed'));
        if (!is_uploaded_file($f['tmp_name'])) throw new UploadError(t('upload.invalid'));
        if ($f['size'] > $maxMb * 1048576) throw new UploadError(t('upload.too_big', ['n' => $maxMb]));
        $name = (string)$f['name'];
        if (preg_match('/\.(php\d?|phtml|phar|pl|py|cgi|sh|exe|js|html?|svg|htaccess)(\.|$)/i', $name)) throw new UploadError(t('upload.type'));
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']) ?: '';
        return [$f, $mime, strtolower(pathinfo($name, PATHINFO_EXTENSION))];
    }

    private static function target(string $dir, string $ext, bool $private = false): array
    {
        $dir = trim(preg_replace('/[^a-z0-9_\-\/]/', '', strtolower($dir)), '/');
        $rel = $dir . '/' . date('Y/m') . '/' . bin2hex(random_bytes(10)) . '.' . $ext;
        $abs = ($private ? STORAGE . '/uploads/' : PUBLIC_UPLOADS . '/') . $rel;
        if (!is_dir(dirname($abs)) && !mkdir(dirname($abs), 0775, true)) throw new RuntimeException('Upload dir not writable');
        return [$rel, $abs];
    }

    /**
     * Validates, compresses and stores an image. Returns the relative path.
     * $opt: max_mb, max_width, quality, format (webp|jpg|png|keep), private, square, min_w, min_h, thumb
     */
    public static function image(string $field, string $dir, array $opt = []): string
    {
        $maxMb = (float)($opt['max_mb'] ?? setting('img_max_upload_mb'));
        [$f, $mime, $ext] = self::check($field, $maxMb);
        if (!isset(self::IMAGE_MIME[$mime]) || !in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'gif'], true)) throw new UploadError(t('upload.image_type'));
        $info = @getimagesize($f['tmp_name']);
        if (!$info || $info[0] < 1 || $info[1] < 1 || $info[0] * $info[1] > 40_000_000) throw new UploadError(t('upload.image_bad'));
        if (!empty($opt['min_w']) && $info[0] < $opt['min_w']) throw new UploadError(t('upload.image_small', ['n' => $opt['min_w']]));

        $format = $opt['format'] ?? (setting('img_auto_webp') === '1' ? 'webp' : 'keep');
        if ($format === 'keep') $format = self::IMAGE_MIME[$mime] === 'gif' ? 'png' : self::IMAGE_MIME[$mime];
        [$rel, $abs] = self::target($dir, $format === 'jpeg' ? 'jpg' : $format, !empty($opt['private']));
        $res = ImageTool::process($f['tmp_name'], $abs, [
            'format' => $format, 'quality' => (int)($opt['quality'] ?? setting('img_quality')),
            'max_width' => (int)($opt['max_width'] ?? setting('img_max_width')), 'square' => $opt['square'] ?? 0,
        ]);
        if (!$res) throw new UploadError(t('upload.image_bad'));
        if (($opt['thumb'] ?? false) && setting('img_thumbnail') === '1') {
            ImageTool::process($abs, preg_replace('/(\.\w+)$/', '_thumb$1', $abs), ['format' => $format, 'quality' => 70, 'max_width' => (int)setting('img_thumb_width')]);
        }
        return $rel;
    }

    /** Stores a PDF or image document (CV, attachment). Images are re-encoded. */
    public static function document(string $field, string $dir, bool $private, float $maxMb = 5): string
    {
        [$f, $mime] = self::check($field, $maxMb);
        if (isset(self::IMAGE_MIME[$mime])) return self::image($field, $dir, ['private' => $private, 'max_mb' => $maxMb, 'format' => 'keep']);
        if (!isset(self::DOC_MIME[$mime])) throw new UploadError(t('upload.doc_type'));
        $head = (string)file_get_contents($f['tmp_name'], false, null, 0, 5);
        if ($head !== '%PDF-') throw new UploadError(t('upload.doc_type'));
        [$rel, $abs] = self::target($dir, 'pdf', $private);
        if (!move_uploaded_file($f['tmp_name'], $abs)) throw new RuntimeException('move failed');
        @chmod($abs, 0644);
        return $rel;
    }

    public static function delete(?string $rel, bool $private = false): void
    {
        if (!$rel || str_contains($rel, '..')) return;
        $abs = ($private ? STORAGE . '/uploads/' : PUBLIC_UPLOADS . '/') . $rel;
        if (is_file($abs)) @unlink($abs);
        $thumb = preg_replace('/(\.\w+)$/', '_thumb$1', $abs);
        if (is_file($thumb)) @unlink($thumb);
    }
}

final class UploadError extends RuntimeException {}
