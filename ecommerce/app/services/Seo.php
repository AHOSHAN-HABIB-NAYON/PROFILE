<?php
/**
 * Structured data (JSON-LD), sitemap.xml and robots.txt.
 */
final class Seo
{
    public static function organization(): array
    {
        $sameAs = array_values(array_filter([setting('facebook_url'), setting('instagram_url'), setting('youtube_url'), setting('tiktok_url')]));
        return array_filter([
            '@context' => 'https://schema.org',
            '@type'    => 'Organization',
            'name'     => setting('store_name'),
            'url'      => absolute_url('/'),
            'logo'     => setting('logo') ? absolute_url(upload_url(setting('logo'))) : absolute_url(asset('icons/icon-512.png')),
            'contactPoint' => [
                '@type' => 'ContactPoint', 'telephone' => setting('contact_phone'), 'contactType' => 'customer service',
                'areaServed' => 'BD', 'availableLanguage' => ['bn', 'en'],
            ],
            'sameAs' => $sameAs ?: null,
        ]);
    }

    public static function website(): array
    {
        return [
            '@context' => 'https://schema.org',
            '@type'    => 'WebSite',
            'name'     => setting('store_name'),
            'url'      => absolute_url('/'),
            'potentialAction' => [
                '@type'       => 'SearchAction',
                'target'      => absolute_url('/search') . '?q={search_term_string}',
                'query-input' => 'required name=search_term_string',
            ],
        ];
    }

    /** @param array $crumbs [[name, path], ...] */
    public static function breadcrumbs(array $crumbs): array
    {
        $items = [];
        foreach (array_values($crumbs) as $i => [$name, $path]) {
            $items[] = ['@type' => 'ListItem', 'position' => $i + 1, 'name' => $name, 'item' => absolute_url($path)];
        }
        return ['@context' => 'https://schema.org', '@type' => 'BreadcrumbList', 'itemListElement' => $items];
    }

    public static function product(array $p): array
    {
        $images = array_map(static fn($i) => absolute_url(image_url($i['path'], 'lg', $i['ext'])), $p['images']);
        return array_filter([
            '@context'    => 'https://schema.org',
            '@type'       => 'Product',
            'name'        => $p['name'],
            'description' => str_limit($p['short_description'] ?: (string)$p['description'], 300),
            'sku'         => $p['sku'] ?: null,
            'image'       => $images ?: [absolute_url(asset('images/placeholder.svg'))],
            'brand'       => ['@type' => 'Brand', 'name' => setting('store_name')],
            'category'    => $p['category_name'] ?? null,
            'offers'      => [
                '@type'         => 'Offer',
                'url'           => absolute_url('/product/' . $p['slug']),
                'priceCurrency' => setting('currency', 'BDT'),
                'price'         => number_format((float)$p['price'], 2, '.', ''),
                'availability'  => $p['in_stock'] ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
                'itemCondition' => 'https://schema.org/NewCondition',
                'seller'        => ['@type' => 'Organization', 'name' => setting('store_name')],
            ],
        ]);
    }

    public static function sitemap(): string
    {
        return Cache::remember('catalog:sitemap', 3600, static function () {
            $urls = [
                ['/', null, '1.0'], ['/products', null, '0.9'], ['/categories', null, '0.7'],
                ['/page/about', null, '0.3'], ['/page/privacy', null, '0.2'], ['/page/terms', null, '0.2'], ['/page/return-policy', null, '0.2'],
            ];
            foreach (DB::all('SELECT slug, updated_at FROM categories WHERE deleted_at IS NULL AND status = "active"') as $c) {
                $urls[] = ['/category/' . $c['slug'], $c['updated_at'], '0.8'];
            }
            foreach (DB::all('SELECT slug, updated_at FROM products WHERE deleted_at IS NULL AND status = "active" ORDER BY id DESC LIMIT 45000') as $p) {
                $urls[] = ['/product/' . $p['slug'], $p['updated_at'], '0.8'];
            }
            $xml = '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
            foreach ($urls as [$path, $mod, $prio]) {
                $xml .= '  <url><loc>' . htmlspecialchars(absolute_url($path), ENT_XML1) . '</loc>'
                    . ($mod ? '<lastmod>' . date('Y-m-d', strtotime($mod)) . '</lastmod>' : '')
                    . '<priority>' . $prio . '</priority></url>' . "\n";
            }
            return $xml . '</urlset>' . "\n";
        });
    }

    public static function robots(): string
    {
        return "User-agent: *\n"
            . "Allow: /\n"
            . "Disallow: /admin\n"
            . "Disallow: /api/\n"
            . "Disallow: /cart\n"
            . "Disallow: /checkout\n"
            . "Disallow: /order/\n"
            . "Disallow: /orders\n"
            . "Disallow: /search\n\n"
            . 'Sitemap: ' . absolute_url('/sitemap.xml') . "\n";
    }
}
