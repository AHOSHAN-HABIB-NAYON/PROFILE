<?php
/**
 * Standalone image compressor tool (product uploads are compressed automatically).
 */
final class AdminToolController extends AdminController
{
    public function compressor(Request $r): Response
    {
        return $this->page('compressor', [], ['title' => 'Image Compressor', 'nav' => 'compressor', 'page' => 'compressor']);
    }

    public function compress(Request $r): Response
    {
        $file = $r->file('image');
        if (!$file) {
            return $this->fail('Choose an image.');
        }
        $this->cleanup();
        $res = ImageService::compressTool($file, $r->int('max_width', 1600), $r->str('format', 5), $r->int('target_kb') ?: null);
        return $this->done('Compressed ' . number_format($res['original_bytes'] / 1024) . ' KB → ' . number_format($res['bytes'] / 1024) . ' KB', [
            'download' => url('/admin/compressor/download/' . $res['file']),
            'original_kb' => round($res['original_bytes'] / 1024, 1), 'kb' => round($res['bytes'] / 1024, 1),
            'saved' => $res['original_bytes'] > 0 ? round((1 - $res['bytes'] / $res['original_bytes']) * 100) : 0,
            'width' => $res['width'], 'height' => $res['height'], 'quality' => $res['quality'],
        ]);
    }

    public function download(Request $r, string $name): Response
    {
        if (!preg_match('/^compressed-[a-f0-9]{12}\.(webp|jpg)$/', $name) || !is_file(STORAGE_PATH . '/tmp/' . $name)) {
            throw new HttpException(404, 'File expired. Compress again.');
        }
        $path = STORAGE_PATH . '/tmp/' . $name;
        return new Response((string)file_get_contents($path), 200, [
            'Content-Type' => str_ends_with($name, '.webp') ? 'image/webp' : 'image/jpeg',
            'Content-Disposition' => 'attachment; filename="' . $name . '"',
            'Cache-Control' => 'no-store',
        ]);
    }

    /** Remove compressed files older than 1 hour. */
    private function cleanup(): void
    {
        foreach (glob(STORAGE_PATH . '/tmp/compressed-*') ?: [] as $f) {
            if (filemtime($f) < time() - 3600) {
                @unlink($f);
            }
        }
    }
}
