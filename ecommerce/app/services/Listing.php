<?php
/**
 * Shared presenter for product listing pages (all products, category, search):
 * filter parsing, SEO-friendly pagination URLs and page meta.
 */
final class Listing
{
    public static function filtersFrom(Request $r): array
    {
        $sort = (string)$r->get('sort', 'manual');
        $perPageOptions = [12, 24, 36, 48];
        $perPage = (int)$r->get('per_page', 0);
        return [
            'sort'     => isset(Product::SORTS[$sort]) ? $sort : 'manual',
            'min'      => is_numeric($r->get('min')) ? (string)(int)$r->get('min') : '',
            'max'      => is_numeric($r->get('max')) ? (string)(int)$r->get('max') : '',
            'in_stock' => $r->get('in_stock') === '1',
            'page'     => max(1, (int)$r->get('page', 1)),
            'per_page' => in_array($perPage, $perPageOptions, true) ? $perPage : (int)setting('products_per_page', 24),
        ];
    }

    /** Query string that preserves current filters (for pagination & sort links). */
    public static function query(array $filters, array $extra = [], array $override = []): array
    {
        $q = $extra + [
            'sort'     => $filters['sort'] !== 'manual' ? $filters['sort'] : null,
            'min'      => $filters['min'] ?: null,
            'max'      => $filters['max'] ?: null,
            'in_stock' => !empty($filters['in_stock']) ? '1' : null,
            'per_page' => (int)$filters['per_page'] !== (int)setting('products_per_page', 24) ? $filters['per_page'] : null,
        ];
        foreach ($override as $k => $v) {
            $q[$k] = $v;
        }
        return array_filter($q, static fn($v) => $v !== null && $v !== '');
    }

    /**
     * $o: title, result, filters, base, extra_query, crumbs, nav, description?, category?, children?, q?
     */
    public static function page(Request $r, array $o): Response
    {
        $result = $o['result'];
        $page = $result['page'];
        $canonicalQuery = ($o['extra_query'] ?? []) + ($page > 1 ? ['page' => $page] : []);
        $hasFilters = $o['filters']['sort'] !== 'manual' || $o['filters']['min'] !== '' || $o['filters']['max'] !== '' || $o['filters']['in_stock'];
        $titleSuffix = $page > 1 ? ' — পৃষ্ঠা ' . num($page) : '';
        return View::page('pages/listing', $o, [
            'title'       => ($o['seo_title'] ?? $o['title']) . $titleSuffix,
            'description' => $o['description'] ?? ($o['title'] . ' — ' . setting('store_name') . ' থেকে সেরা দামে অর্ডার করুন। ক্যাশ অন ডেলিভারি।'),
            'canonical'   => absolute_url(url($o['base'], $canonicalQuery)),
            'robots'      => $hasFilters || isset($o['q']) ? 'noindex, follow' : 'index, follow',
            'jsonld'      => [Seo::breadcrumbs($o['crumbs'])],
            'styles'      => ['category'],
            'scripts'     => ['listing'],
            'page'        => 'listing',
            'nav'         => $o['nav'] ?? 'categories',
        ]);
    }
}
