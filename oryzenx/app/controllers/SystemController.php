<?php
/** SEO files, PWA manifest/service worker, icons and protected file delivery. */
final class SystemController
{
    public function sitemap(): void
    {
        $base = rtrim(setting('canonical_base') ?: base_url(), '/');
        $urls = [['/', null, '1.0'], ['/services', null, '0.9'], ['/news', null, '0.8'], ['/team', null, '0.6'], ['/projects', null, '0.7'], ['/contact', null, '0.6'], ['/faq', null, '0.5']];
        foreach (DB::all('SELECT slug, COALESCE(updated_at, created_at) AS m FROM services WHERE is_active = 1') as $s) $urls[] = ['/services/' . $s['slug'], $s['m'], '0.8'];
        foreach (DB::all("SELECT id, COALESCE(updated_at, published_at) AS m FROM posts WHERE status = 'published' AND published_at <= NOW() ORDER BY published_at DESC LIMIT 5000") as $p) $urls[] = ['/news/' . $p['id'], $p['m'], '0.7'];
        foreach (DB::all('SELECT id FROM team_members WHERE is_active = 1') as $m) $urls[] = ['/team/' . $m['id'], null, '0.4'];
        header('Content-Type: application/xml; charset=utf-8');
        echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
        foreach ($urls as [$path, $mod, $prio]) {
            echo '<url><loc>' . e($base . ($path === '/' ? '/' : $path)) . '</loc>' . ($mod ? '<lastmod>' . date('Y-m-d', strtotime($mod)) . '</lastmod>' : '') . "<priority>$prio</priority></url>\n";
        }
        echo '</urlset>';
        exit;
    }

    public function robots(): void
    {
        header('Content-Type: text/plain; charset=utf-8');
        $b = base_path();
        echo "User-agent: *\nAllow: $b/\nDisallow: $b/admin\nDisallow: $b/api/\nDisallow: $b/profile\nDisallow: $b/payment/\nDisallow: $b/files/\nDisallow: $b/search\n\n";
        echo 'Sitemap: ' . rtrim(setting('canonical_base') ?: base_url(), '/') . "/sitemap.xml\n";
        exit;
    }

    public function manifest(): void
    {
        if (setting('pwa_enabled') !== '1') throw new HttpException(t('error.404'), 404);
        $b = base_path();
        $v = self::iconVersion();
        $m = [
            'id' => $b . '/', 'name' => self::appName(), 'short_name' => self::appName(true),
            'description' => sl('site_description'), 'lang' => lang(), 'dir' => 'ltr',
            'start_url' => $b . '/?source=pwa', 'scope' => $b . '/', 'display' => 'standalone', 'display_override' => ['standalone', 'minimal-ui'],
            'orientation' => 'portrait', 'theme_color' => setting('pwa_theme_color'), 'background_color' => setting('pwa_background_color'),
            'categories' => ['business', 'productivity', 'developer'],
            'icons' => [
                ['src' => $b . '/icon-192.png?v=' . $v, 'sizes' => '192x192', 'type' => 'image/png', 'purpose' => 'any'],
                ['src' => $b . '/icon-512.png?v=' . $v, 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'any'],
                ['src' => $b . '/icon-maskable.png?v=' . $v, 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'maskable'],
            ],
            'shortcuts' => [
                ['name' => t('nav.services'), 'url' => $b . '/services', 'icons' => [['src' => $b . '/icon-192.png', 'sizes' => '192x192']]],
                ['name' => t('nav.news'), 'url' => $b . '/news', 'icons' => [['src' => $b . '/icon-192.png', 'sizes' => '192x192']]],
                ['name' => t('nav.payment'), 'url' => $b . '/payment', 'icons' => [['src' => $b . '/icon-192.png', 'sizes' => '192x192']]],
            ],
        ];
        header('Content-Type: application/manifest+json; charset=utf-8');
        header('Cache-Control: no-cache');
        echo json_encode($m, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        exit;
    }

    public function serviceWorker(): void
    {
        $b = base_path();
        $version = 'ozx-' . OZX_VERSION . '-' . setting('pwa_version') . '-' . self::iconVersion() . '-' . substr(md5((string)@filemtime(ROOT . '/assets/js/app.js') . @filemtime(ROOT . '/assets/css/components.css')), 0, 8);
        $precache = [$b . '/offline', asset('css/base.css'), asset('css/components.css'), asset('css/layout.css'), asset('css/chat.css'), asset('js/app.js'), $b . '/icon-192.png?v=' . self::iconVersion()];
        header('Content-Type: application/javascript; charset=utf-8');
        header('Cache-Control: no-cache');
        header('Service-Worker-Allowed: ' . ($b === '' ? '/' : $b . '/'));
        echo 'const VERSION=' . json_encode($version) . ';const BASE=' . json_encode($b) . ';const PRECACHE=' . json_encode($precache, JSON_UNESCAPED_SLASHES) . ";\n";
        readfile(ROOT . '/assets/js/sw-core.js');
        exit;
    }

    public function offline(): void
    {
        header('Content-Type: text/html; charset=utf-8');
        echo View::render('pages/offline', []);
        exit;
    }

    /** Generates (once) and serves the PWA icons. */
    public function icon(string $size): void
    {
        $file = self::iconPath($size === 'maskable' ? 'mask' : (int)$size);
        if (!is_file($file)) self::buildIcons();
        header('Content-Type: image/png');
        header('Cache-Control: public, max-age=604800');
        readfile($file);
        exit;
    }

    public function favicon(): void
    {
        $fav = setting('favicon');
        if ($fav && is_file(PUBLIC_UPLOADS . '/' . $fav)) { header('Location: ' . upload_url($fav), true, 301); exit; }
        $this->icon('192');
    }

    /** App icon source: dedicated app icon → site logo → favicon. */
    public static function iconSource(): string
    {
        foreach (['app_icon', 'logo', 'favicon'] as $k) {
            $v = (string)setting($k);
            if ($v !== '' && is_file(PUBLIC_UPLOADS . '/' . $v)) return PUBLIC_UPLOADS . '/' . $v;
        }
        return '';
    }

    /** Changes whenever the logo, colours or name change, so phones fetch the new icon. */
    public static function iconVersion(): string
    {
        $src = self::iconSource();
        return substr(md5($src . '|' . ($src ? @filemtime($src) : '') . '|' . setting('color_primary') . '|' . setting('pwa_background_color') . '|' . setting('site_name')), 0, 10);
    }

    public static function iconPath(int|string $size): string { return PUBLIC_UPLOADS . "/pwa/icon-$size-" . self::iconVersion() . '.png'; }

    public static function appName(bool $short = false): string
    {
        $site = (string)setting('site_name');
        $v = trim((string)setting($short ? 'pwa_short_name' : 'pwa_name'));
        // The installer default ("Oryzenx") must not override a renamed site.
        if ($v === '' || ($v === 'Oryzenx' && $site !== 'Oryzenx')) $v = $site;
        return $short ? mb_substr($v, 0, 12) : $v;
    }

    public static function buildIcons(): void
    {
        $src = self::iconSource();
        $dir = PUBLIC_UPLOADS . '/pwa';
        if (!is_dir($dir)) mkdir($dir, 0775, true);
        foreach (glob($dir . '/icon-*.png') ?: [] as $old) @unlink($old);
        $img = $src ? ImageTool::load($src) : null;
        foreach ([192, 512] as $size) {
            $dest = self::iconPath($size);
            if (!$img || !self::fitIcon($img, $dest, $size, null, 1.0)) ImageTool::generateIcon($size, $dest, (string)setting('color_primary'));
        }
        // Maskable / Apple icon: solid background with safe-zone padding so Android & iOS never crop the logo.
        $mask = self::iconPath('mask');
        if (!$img || !self::fitIcon($img, $mask, 512, (string)(setting('pwa_background_color') ?: '#ffffff'), .72)) ImageTool::generateIcon(512, $mask, (string)setting('color_primary'));
    }

    /** Fits the whole logo (no cropping) inside a square canvas; transparent unless $bg is given. */
    private static function fitIcon(GdImage $img, string $dest, int $size, ?string $bg, float $scale): bool
    {
        $w = imagesx($img); $h = imagesy($img);
        if ($w < 1 || $h < 1) return false;
        $c = imagecreatetruecolor($size, $size);
        imagesavealpha($c, true);
        imagealphablending($c, false);
        if ($bg && preg_match('/^#?([0-9a-f]{6})$/i', $bg, $m)) {
            [$r, $g, $b] = sscanf($m[1], '%02x%02x%02x');
            imagefill($c, 0, 0, imagecolorallocate($c, $r, $g, $b));
        } else {
            imagefill($c, 0, 0, imagecolorallocatealpha($c, 0, 0, 0, 127));
        }
        imagealphablending($c, true);
        $box = (int)round($size * $scale);
        $k = min($box / $w, $box / $h);
        $nw = max(1, (int)round($w * $k)); $nh = max(1, (int)round($h * $k));
        imagecopyresampled($c, $img, (int)(($size - $nw) / 2), (int)(($size - $nh) / 2), 0, 0, $nw, $nh, $w, $h);
        $ok = imagepng($c, $dest, 6);
        imagedestroy($c);
        return $ok;
    }

    /** Payment screenshots and contact attachments live outside the web root and are authorised per request. */
    public function privateFile(string $type, string $id): void
    {
        $u = auth();
        $row = match ($type) {
            'payment' => DB::row('SELECT user_id, screenshot AS f FROM payments WHERE id = ?', [(int)$id]),
            'wallet' => DB::row('SELECT user_id, screenshot AS f FROM wallet_transactions WHERE id = ?', [(int)$id]),
            default => DB::row('SELECT user_id, attachment AS f FROM contact_messages WHERE id = ?', [(int)$id]),
        };
        if (!$row || !$row['f'] || ($u['role'] !== 'admin' && (int)$row['user_id'] !== (int)$u['id'])) throw new HttpException(t('error.404'), 404);
        $path = realpath(STORAGE . '/uploads/' . $row['f']);
        if (!$path || !str_starts_with($path, realpath(STORAGE . '/uploads')) || !is_file($path)) throw new HttpException(t('error.404'), 404);
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($path) ?: 'application/octet-stream';
        if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], true)) $mime = 'application/octet-stream';
        header('Content-Type: ' . $mime);
        header('Content-Length: ' . filesize($path));
        header('Content-Disposition: inline; filename="' . basename($path) . '"');
        header('Cache-Control: private, max-age=600');
        header('X-Content-Type-Options: nosniff');
        header("Content-Security-Policy: default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
        readfile($path);
        exit;
    }
}
