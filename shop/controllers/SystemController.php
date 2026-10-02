<?php
final class SystemController
{
    public function manifest(): void
    {
        header('Content-Type: application/manifest+json; charset=utf-8');
        header('Cache-Control: public, max-age=3600');
        $icon = static fn (string $f, string $fallback) => is_file(BASE_PATH . '/uploads/branding/' . $f) ? '/uploads/branding/' . $f : $fallback;
        echo json_encode([
            'name' => setting('site_name'), 'short_name' => setting('pwa_short_name') ?: setting('site_name'),
            'description' => setting('meta_description') ?: setting('site_tagline'),
            'id' => '/', 'start_url' => '/?source=pwa', 'scope' => '/', 'display' => 'standalone', 'orientation' => 'portrait',
            'lang' => 'bn', 'dir' => 'ltr', 'background_color' => setting('pwa_bg_color'), 'theme_color' => setting('pwa_theme_color'),
            'categories' => ['shopping'],
            'icons' => [
                ['src' => $icon('icon-192.png', '/assets/icons/icon-192.png'), 'sizes' => '192x192', 'type' => 'image/png', 'purpose' => 'any'],
                ['src' => $icon('icon-512.png', '/assets/icons/icon-512.png'), 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'any'],
                ['src' => $icon('icon-maskable-512.png', '/assets/icons/icon-maskable-512.png'), 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'maskable'],
            ],
            'shortcuts' => [
                ['name' => 'সকল পণ্য', 'url' => '/products'],
                ['name' => 'কার্ট', 'url' => '/cart'],
            ],
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    public function serviceWorker(): void
    {
        header('Content-Type: application/javascript; charset=utf-8');
        header('Cache-Control: no-cache');
        header('Service-Worker-Allowed: /');
        if (!Settings::on('pwa_enabled')) {
            // Self-unregistering worker when PWA is switched off.
            echo "self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.map(c=>caches.delete(c)))).then(()=>self.registration.unregister()));});";
            return;
        }
        $assets = ['css/app.css', 'vendor/font-awesome/css/font-awesome.min.css', 'js/ajax.js', 'js/cache.js', 'js/animations.js', 'js/lazyload.js', 'js/router.js', 'js/prefetch.js', 'js/navigation.js', 'js/cart.js', 'js/product.js', 'js/checkout.js', 'js/whatsapp.js', 'js/tracking.js', 'js/pwa.js', 'js/app.js'];
        $hash = '';
        $urls = [];
        foreach ($assets as $a) {
            $hash .= @filemtime(BASE_PATH . '/assets/' . $a);
            $urls[] = asset($a);
        }
        $version = substr(md5($hash . APP_VERSION . filemtime(BASE_PATH . '/pwa/sw.js')), 0, 10);
        $src = (string) file_get_contents(BASE_PATH . '/pwa/sw.js');
        echo strtr($src, [
            '__VERSION__' => $version,
            '__PRECACHE__' => json_encode(array_merge(['/offline', '/assets/images/placeholder.svg', '/assets/vendor/font-awesome/fonts/fontawesome-webfont.woff2?v=4.7.0'], $urls), JSON_UNESCAPED_SLASHES),
        ]);
    }

    public function robots(): void
    {
        header('Content-Type: text/plain; charset=utf-8');
        $base = rtrim((string) (setting('canonical_base') ?: Config::get('url') ?: Request::origin()), '/');
        $disallowAll = str_contains((string) setting('robots'), 'noindex');
        echo "User-agent: *\n" . ($disallowAll ? "Disallow: /\n" : "Disallow: /admin\nDisallow: /api/\nDisallow: /cart\nDisallow: /checkout\nDisallow: /order-success/\nAllow: /\n") . "\nSitemap: {$base}/sitemap.xml\n";
    }

    public function sitemap(): void
    {
        header('Content-Type: application/xml; charset=utf-8');
        header('Cache-Control: public, max-age=3600');
        $base = rtrim((string) (setting('canonical_base') ?: Config::get('url') ?: Request::origin()), '/');
        $urls = [[$base . '/', date('Y-m-d'), '1.0'], [$base . '/products', date('Y-m-d'), '0.9'], [$base . '/categories', date('Y-m-d'), '0.7'], [$base . '/contact', null, '0.4']];
        foreach (DB::all('SELECT slug FROM categories WHERE is_active = 1 AND deleted_at IS NULL') as $c) {
            $urls[] = [$base . '/category/' . rawurlencode($c['slug']), null, '0.7'];
        }
        foreach (DB::all('SELECT slug, updated_at FROM products WHERE is_active = 1 AND deleted_at IS NULL ORDER BY id DESC LIMIT 5000') as $p) {
            $urls[] = [$base . '/product/' . rawurlencode($p['slug']), substr($p['updated_at'], 0, 10), '0.8'];
        }
        echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
        foreach ($urls as [$loc, $mod, $pri]) {
            echo '<url><loc>' . e($loc) . '</loc>' . ($mod ? '<lastmod>' . $mod . '</lastmod>' : '') . '<priority>' . $pri . '</priority></url>' . "\n";
        }
        echo '</urlset>';
    }
}
