<?php
/** Admin image compressor: quality-based re-encoding with size comparison. */
final class AdminCompressorController
{
    public function index(): void
    {
        $recent = [];
        foreach (array_slice(array_reverse(glob(PUBLIC_UPLOADS . '/compressed/*/*/*.*') ?: []), 0, 12) as $f) {
            if (str_contains($f, '_thumb.')) continue;
            $recent[] = ['url' => upload_url(substr($f, strlen(PUBLIC_UPLOADS) + 1)), 'size' => filesize($f), 'name' => basename($f), 'time' => filemtime($f)];
        }
        View::page('admin/compressor', ['recent' => $recent], ['layout' => 'admin', 'title' => t('admin.compressor'), 'nav' => 'compressor', 'cache' => false]);
    }

    public function compress(): void
    {
        if (!Upload::present('image')) fail(t('upload.choose'), ['image' => t('upload.choose')]);
        $quality = max(10, min(100, input_int('quality', (int)setting('img_quality'))));
        $format = in_array(input('format'), ['webp', 'jpg', 'png', 'keep'], true) ? (string)input('format') : 'webp';
        $maxW = max(0, min(8000, input_int('max_width', (int)setting('img_max_width'))));
        $orig = (int)($_FILES['image']['size'] ?? 0);
        try {
            $rel = Upload::image('image', 'compressed', ['quality' => $quality, 'format' => $format, 'max_width' => $maxW, 'thumb' => input('thumb') === '1']);
        } catch (UploadError $e) { fail($e->getMessage(), ['image' => $e->getMessage()]); }
        $abs = PUBLIC_UPLOADS . '/' . $rel;
        $new = (int)filesize($abs);
        // Already-optimised sources can grow when re-encoded: retry once at a lower quality.
        if ($orig > 0 && $new >= $orig && $format !== 'png') {
            $retry = ImageTool::process($abs, $abs . '.tmp', ['format' => pathinfo($abs, PATHINFO_EXTENSION) === 'jpg' ? 'jpg' : 'webp', 'quality' => max(10, $quality - 25), 'max_width' => 0]);
            if ($retry && $retry['size'] < $new) { rename($abs . '.tmp', $abs); clearstatcache(true, $abs); $new = (int)filesize($abs); }
            @unlink($abs . '.tmp');
        }
        [$w, $h] = getimagesize($abs);
        $thumb = preg_replace('/(\.\w+)$/', '_thumb$1', $rel);
        json_out(['ok' => true, 'message' => $new < $orig ? t('admin.compressed') : t('admin.not_smaller'), 'result' => [
            'url' => upload_url($rel), 'original' => fmt_bytes($orig), 'compressed' => fmt_bytes($new),
            'saved' => $orig > 0 ? max(0, round(100 - $new / $orig * 100, 1)) : 0, 'width' => $w, 'height' => $h,
            'thumb' => is_file(PUBLIC_UPLOADS . '/' . $thumb) ? upload_url($thumb) : null, 'path' => $rel,
        ]]);
    }
}
