<?php
declare(strict_types=1);

namespace OryzenX\Services;

use OryzenX\Core\Config;
use OryzenX\Core\HttpException;
use OryzenX\Core\Security;

/**
 * Safe uploads:
 *  - checks size, real MIME (finfo), magic bytes and image dimensions
 *  - raster images are always re-encoded with GD (strips metadata and any embedded payload)
 *  - oversized images are resized; quality is stepped down toward a target size (targets, not guarantees)
 *  - SVG is parsed and rebuilt from an allow-list (scripts, event handlers, external refs removed)
 *  - files get random names; nothing uploaded is ever executed (see public/uploads/.htaccess)
 */
final class UploadService
{
    public const PROFILE = [
        'document' => ['max_bytes' => 10_485_760, 'max_dim' => 2400, 'min_quality' => 72, 'private' => true, 'types' => ['image/jpeg', 'image/png', 'image/webp']],
        'avatar' => ['max_bytes' => 5_242_880, 'max_dim' => 512, 'min_quality' => 60, 'private' => true, 'types' => ['image/jpeg', 'image/png', 'image/webp']],
        'logo' => ['max_bytes' => 2_097_152, 'max_dim' => 256, 'min_quality' => 70, 'private' => false, 'types' => ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']],
    ];

    /**
     * @param array{tmp_name:string, size:int, error:int, name?:string} $file a $_FILES entry
     * @param bool $trustedPath allow non-uploaded paths (CLI tools/tests only)
     * @return array{path:string, mime:string, bytes:int, original_bytes:int, width:?int, height:?int}
     */
    public function store(array $file, string $profile, string $subdir, bool $trustedPath = false): array
    {
        $cfg = self::PROFILE[$profile] ?? throw new \InvalidArgumentException('Unknown upload profile');
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            throw HttpException::validation(['file' => $this->uploadError((int) ($file['error'] ?? UPLOAD_ERR_NO_FILE))]);
        }
        $tmp = (string) $file['tmp_name'];
        if (!$trustedPath && !is_uploaded_file($tmp)) {
            throw HttpException::validation(['file' => 'Upload failed. Please try again.']);
        }
        $size = (int) filesize($tmp);
        if ($size <= 0 || $size > $cfg['max_bytes']) {
            throw HttpException::validation(['file' => 'File is too large (maximum ' . round($cfg['max_bytes'] / 1048576) . ' MB).']);
        }
        $mime = $this->detectMime($tmp);
        if (!in_array($mime, $cfg['types'], true)) {
            throw HttpException::validation(['file' => 'Unsupported file type. Allowed: ' . implode(', ', array_map(fn ($t) => strtoupper(str_replace(['image/', '+xml'], '', $t)), $cfg['types'])) . '.']);
        }
        if (!preg_match('/^[a-z0-9_\/-]+$/', $subdir)) {
            throw new \InvalidArgumentException('Invalid subdir');
        }
        $baseDir = $cfg['private'] ? Config::storagePath('private/' . $subdir) : Config::basePath('public/uploads/' . $subdir);
        if (!is_dir($baseDir)) {
            mkdir($baseDir, 0750, true);
        }
        $name = bin2hex(random_bytes(16));

        if ($mime === 'image/svg+xml') {
            $svg = self::sanitizeSvg((string) file_get_contents($tmp));
            $dest = $baseDir . '/' . $name . '.svg';
            file_put_contents($dest, $svg);
            return ['path' => $this->relPath($dest, $cfg['private']), 'mime' => $mime, 'bytes' => strlen($svg), 'original_bytes' => $size, 'width' => null, 'height' => null];
        }

        $info = @getimagesize($tmp);
        if ($info === false || $info[0] < 1 || $info[1] < 1 || $info[0] * $info[1] > 40_000_000) {
            throw HttpException::validation(['file' => 'The image could not be read or is too large in dimensions.']);
        }
        if (!function_exists('imagecreatefromstring')) {
            throw new HttpException(503, 'gd_missing', 'Image processing is unavailable on this server (PHP GD extension missing).');
        }
        $src = @imagecreatefromstring((string) file_get_contents($tmp));
        if ($src === false) {
            throw HttpException::validation(['file' => 'The image file is damaged or unsupported.']);
        }
        [$w, $h] = [imagesx($src), imagesy($src)];
        $scale = min(1, $cfg['max_dim'] / max($w, $h));
        $nw = max(1, (int) round($w * $scale));
        $nh = max(1, (int) round($h * $scale));
        $dst = imagecreatetruecolor($nw, $nh);
        $keepAlpha = $profile === 'logo' && in_array($mime, ['image/png', 'image/webp'], true);
        if ($keepAlpha) {
            imagealphablending($dst, false);
            imagesavealpha($dst, true);
            imagefill($dst, 0, 0, imagecolorallocatealpha($dst, 0, 0, 0, 127));
        } else {
            imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255));
        }
        imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
        imagedestroy($src);

        if ($keepAlpha) {
            $dest = $baseDir . '/' . $name . '.png';
            imagepng($dst, $dest, 9);
            $outMime = 'image/png';
        } else {
            // target ≈10% of the original size (e.g. 5 MB → ~500 KB), never below the readability floor
            $target = max(60_000, (int) ($size * 0.1));
            $dest = $baseDir . '/' . $name . '.jpg';
            $q = 85;
            do {
                imagejpeg($dst, $dest, $q);
                clearstatcache(true, $dest);
                $q -= 5;
            } while (filesize($dest) > $target && $q >= $cfg['min_quality']);
            $outMime = 'image/jpeg';
        }
        imagedestroy($dst);
        clearstatcache(true, $dest);
        return ['path' => $this->relPath($dest, $cfg['private']), 'mime' => $outMime, 'bytes' => (int) filesize($dest), 'original_bytes' => $size, 'width' => $nw, 'height' => $nh];
    }

    private function relPath(string $abs, bool $private): string
    {
        $root = $private ? Config::storagePath('private') . '/' : Config::basePath('public') . '/';
        return ($private ? 'private:' : '') . substr($abs, strlen($root));
    }

    /** Absolute path for a stored private file reference ("private:verification/abc.jpg"). */
    public function privatePath(string $ref): ?string
    {
        if (!str_starts_with($ref, 'private:')) {
            return null;
        }
        $rel = substr($ref, 8);
        if (!preg_match('#^[a-z0-9_/-]+/[a-f0-9]{32}\.(jpg|png|svg)$#', $rel)) {
            return null;
        }
        $abs = Config::storagePath('private/' . $rel);
        return is_file($abs) ? $abs : null;
    }

    public function delete(?string $ref): void
    {
        if (!$ref) {
            return;
        }
        $abs = str_starts_with($ref, 'private:') ? $this->privatePath($ref) : (preg_match('#^uploads/[a-z0-9_/-]+/[a-f0-9]{32}\.(jpg|png|svg)$#', $ref) ? Config::basePath('public/' . $ref) : null);
        if ($abs && is_file($abs)) {
            @unlink($abs);
        }
    }

    private function detectMime(string $path): string
    {
        $finfo = function_exists('finfo_open') ? finfo_open(FILEINFO_MIME_TYPE) : false;
        $mime = $finfo ? (string) finfo_file($finfo, $path) : '';
        $head = (string) file_get_contents($path, false, null, 0, 512);
        // confirm magic bytes match the claimed type
        $sig = match (true) {
            str_starts_with($head, "\xFF\xD8\xFF") => 'image/jpeg',
            str_starts_with($head, "\x89PNG\r\n\x1A\n") => 'image/png',
            str_starts_with($head, 'RIFF') && substr($head, 8, 4) === 'WEBP' => 'image/webp',
            (bool) preg_match('/^\s*(<\?xml[^>]*>\s*)?(<!--.*?-->\s*)*<svg[\s>]/is', $head) => 'image/svg+xml',
            default => 'unknown',
        };
        if ($sig === 'image/svg+xml' && in_array($mime, ['image/svg+xml', 'text/xml', 'application/xml', 'text/plain', 'text/html'], true)) {
            return 'image/svg+xml';
        }
        return $sig === $mime ? $mime : 'unknown';
    }

    private function uploadError(int $code): string
    {
        return match ($code) {
            UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'File is too large.',
            UPLOAD_ERR_NO_FILE => 'Choose a file to upload.',
            UPLOAD_ERR_PARTIAL => 'The upload was interrupted. Please try again.',
            default => 'Upload failed. Please try again.',
        };
    }

    /** Rebuilds an SVG from an allow-list of elements and attributes. Throws if the document is unusable. */
    public static function sanitizeSvg(string $svg): string
    {
        if (strlen($svg) > 1_000_000 || preg_match('/<!DOCTYPE|<!ENTITY/i', $svg)) {
            throw HttpException::validation(['file' => 'This SVG file is not allowed.']);
        }
        $allowedEl = ['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'lineargradient', 'radialgradient', 'stop', 'title', 'desc', 'clippath', 'mask', 'text', 'tspan', 'use', 'symbol'];
        $allowedAttr = ['viewbox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'fill', 'fill-rule', 'fill-opacity',
            'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'stroke-miterlimit', 'opacity', 'transform', 'id', 'class', 'offset',
            'stop-color', 'stop-opacity', 'gradientunits', 'gradienttransform', 'clip-path', 'clip-rule', 'mask', 'font-size', 'font-family', 'font-weight',
            'text-anchor', 'xmlns', 'version', 'preserveaspectratio', 'href', 'xlink:href', 'fx', 'fy', 'spreadmethod', 'dominant-baseline'];
        $prev = libxml_use_internal_errors(true);
        $doc = new \DOMDocument();
        $ok = $doc->loadXML($svg, LIBXML_NONET | LIBXML_NOBLANKS);
        libxml_clear_errors();
        libxml_use_internal_errors($prev);
        if (!$ok || !$doc->documentElement || strtolower($doc->documentElement->localName) !== 'svg') {
            throw HttpException::validation(['file' => 'This SVG file could not be read.']);
        }
        $walk = function (\DOMNode $node) use (&$walk, $allowedEl, $allowedAttr) {
            for ($i = $node->childNodes->length - 1; $i >= 0; $i--) {
                $child = $node->childNodes->item($i);
                if ($child instanceof \DOMElement) {
                    if (!in_array(strtolower($child->localName), $allowedEl, true)) {
                        $node->removeChild($child);
                        continue;
                    }
                    for ($j = $child->attributes->length - 1; $j >= 0; $j--) {
                        $attr = $child->attributes->item($j);
                        $name = strtolower($attr->nodeName);
                        $val = trim($attr->nodeValue ?? '');
                        $bad = !in_array($name, $allowedAttr, true)
                            || str_starts_with($name, 'on')
                            || preg_match('/(javascript|data|vbscript)\s*:|expression\s*\(|url\s*\(\s*[\'"]?\s*(https?:|\/\/)/i', $val)
                            || (in_array($name, ['href', 'xlink:href'], true) && !str_starts_with($val, '#'));
                        if ($bad) {
                            $child->removeAttributeNode($attr);
                        }
                    }
                    $walk($child);
                } elseif ($child instanceof \DOMProcessingInstruction || $child instanceof \DOMComment || $child instanceof \DOMCdataSection) {
                    $node->removeChild($child);
                }
            }
        };
        $root = $doc->documentElement;
        for ($j = $root->attributes->length - 1; $j >= 0; $j--) {
            $attr = $root->attributes->item($j);
            if (!in_array(strtolower($attr->nodeName), $allowedAttr, true) || str_starts_with(strtolower($attr->nodeName), 'on')) {
                $root->removeAttributeNode($attr);
            }
        }
        $walk($root);
        $out = $doc->saveXML($root);
        if ($out === false || stripos($out, '<script') !== false) {
            throw HttpException::validation(['file' => 'This SVG file is not allowed.']);
        }
        return $out;
    }
}
