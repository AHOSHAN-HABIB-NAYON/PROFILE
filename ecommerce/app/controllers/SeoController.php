<?php
/**
 * sitemap.xml, robots.txt and the dynamic PWA manifest.
 */
final class SeoController
{
    public function sitemap(Request $r): Response
    {
        return Response::text(Seo::sitemap(), 'application/xml', ['Cache-Control' => 'public, max-age=3600']);
    }

    public function robots(Request $r): Response
    {
        return Response::text(Seo::robots(), 'text/plain', ['Cache-Control' => 'public, max-age=86400']);
    }

    public function manifest(Request $r): Response
    {
        $icon = (string)setting('pwa_icon');
        $icons = [];
        if ($icon !== '') {
            foreach ([192, 512] as $s) {
                $icons[] = ['src' => upload_url(str_replace('-512.png', '-' . $s . '.png', $icon)), 'sizes' => "{$s}x{$s}", 'type' => 'image/png', 'purpose' => 'any maskable'];
            }
        } else {
            $icons = [
                ['src' => asset('icons/icon-192.png'), 'sizes' => '192x192', 'type' => 'image/png', 'purpose' => 'any maskable'],
                ['src' => asset('icons/icon-512.png'), 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'any maskable'],
            ];
        }
        $manifest = [
            'name'             => setting('store_name'),
            'short_name'       => mb_substr((string)setting('pwa_short_name', setting('store_name')), 0, 12),
            'description'      => setting('seo_description'),
            'lang'             => 'bn',
            'start_url'        => url('/') . (base_path() === '' ? '' : '/') . '?source=pwa',
            'scope'            => base_path() . '/',
            'display'          => 'standalone',
            'orientation'      => 'portrait',
            'theme_color'      => setting('pwa_theme_color'),
            'background_color' => setting('pwa_bg_color'),
            'icons'            => $icons,
            'shortcuts'        => [
                ['name' => 'কার্ট', 'url' => url('/cart')],
                ['name' => 'আমার অর্ডার', 'url' => url('/orders')],
            ],
        ];
        return Response::json($manifest, 200, ['Content-Type' => 'application/manifest+json; charset=utf-8', 'Cache-Control' => 'public, max-age=3600']);
    }
}
