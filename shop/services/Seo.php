<?php
final class Seo
{
    public static function meta(array $m): array
    {
        $site = (string) setting('site_name');
        $title = $m['title'] ?? (setting('meta_title') ?: $site);
        $full = ($m['raw_title'] ?? false) || $title === $site ? $title : $title . ' | ' . $site;
        $base = rtrim((string) (setting('canonical_base') ?: Config::get('url') ?: Request::origin()), '/');
        $path = $m['path'] ?? Request::path();
        $og = $m['og_image'] ?? setting('og_image') ?: setting('logo');
        return [
            'title'       => $title,
            'full_title'  => $full,
            'description' => str_limit(strip_tags((string) ($m['description'] ?? setting('meta_description') ?: setting('site_tagline'))), 300),
            'keywords'    => $m['keywords'] ?? setting('meta_keywords'),
            'canonical'   => $m['canonical'] ?? $base . ($path === '/' ? '/' : $path),
            'og_image'    => $og ? (str_starts_with($og, 'http') ? $og : $base . img_url($og, 'md', 'jpg')) : '',
            'og_type'     => $m['og_type'] ?? 'website',
            'robots'      => $m['robots'] ?? setting('robots', 'index,follow'),
            'jsonld'      => $m['jsonld'] ?? null,
            'page'        => $m['page'] ?? 'generic',
            'cacheable'   => $m['cacheable'] ?? false,
            'nav'         => $m['nav'] ?? '',
        ];
    }

    /** Per-page overrides from seo_settings (home, products, contact…). */
    public static function forPage(string $key, array $fallback = []): array
    {
        try {
            $row = DB::one('SELECT * FROM seo_settings WHERE page_key = ?', [$key]);
        } catch (Throwable) {
            $row = null;
        }
        if ($row) {
            foreach (['title', 'description', 'keywords', 'og_image'] as $f) {
                if (!empty($row[$f])) {
                    $fallback[$f] = $row[$f];
                }
            }
        }
        return $fallback;
    }

    public static function organization(): array
    {
        $base = Config::get('url') ?: Request::origin();
        return array_filter([
            '@context' => 'https://schema.org',
            '@type'    => 'Organization',
            'name'     => setting('site_name'),
            'url'      => $base . '/',
            'logo'     => setting('logo') ? $base . '/' . setting('logo') : null,
            'sameAs'   => setting('facebook_url') ? [setting('facebook_url')] : null,
            'contactPoint' => setting('contact_phone') ? ['@type' => 'ContactPoint', 'telephone' => setting('contact_phone'), 'contactType' => 'customer service'] : null,
        ]);
    }

    public static function product(array $p, array $images): array
    {
        $base = Config::get('url') ?: Request::origin();
        return [
            '@context'    => 'https://schema.org',
            '@type'       => 'Product',
            'name'        => $p['name'],
            'description' => str_limit(strip_tags((string) ($p['short_description'] ?: $p['description'])), 300),
            'sku'         => $p['sku'] ?: (string) $p['id'],
            'image'       => array_map(static fn ($i) => $base . img_url($i['path'], 'md', 'jpg'), $images) ?: null,
            'category'    => $p['category_name'] ?? null,
            'offers'      => [
                '@type'         => 'Offer',
                'url'           => $base . '/product/' . rawurlencode($p['slug']),
                'priceCurrency' => 'BDT',
                'price'         => number_format((float) $p['effective_price'], 2, '.', ''),
                'availability'  => $p['stock'] > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
                'itemCondition' => 'https://schema.org/NewCondition',
            ],
        ];
    }
}
