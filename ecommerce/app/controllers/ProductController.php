<?php
/**
 * Product listing (/products) and details (/product/{slug}).
 */
final class ProductController
{
    private const TYPES = [
        'flash'    => ['flag' => 'is_flash_sale',    'title' => 'ফ্ল্যাশ সেল'],
        'combo'    => ['flag' => 'is_combo',         'title' => 'কম্বো অফার'],
        'free'     => ['flag' => 'is_free_delivery', 'title' => 'ফ্রি ডেলিভারি'],
        'featured' => ['flag' => 'is_featured',      'title' => 'বাছাই করা পণ্য'],
    ];

    public function index(Request $r): Response
    {
        $type = (string)$r->get('type', '');
        $filters = Listing::filtersFrom($r);
        $title = 'সকল পণ্য';
        if (isset(self::TYPES[$type])) {
            $filters['flag'] = self::TYPES[$type]['flag'];
            $title = self::TYPES[$type]['title'];
        }
        $result = Product::listing($filters);
        return Listing::page($r, [
            'title' => $title,
            'result' => $result,
            'filters' => $filters,
            'base' => '/products',
            'extra_query' => isset(self::TYPES[$type]) ? ['type' => $type] : [],
            'crumbs' => [['হোম', '/'], [$title, '/products']],
            'nav' => 'categories',
        ]);
    }

    public function show(Request $r, string $slug): Response
    {
        $p = Product::findBySlug($slug);
        if (!$p) {
            throw new HttpException(404, 'পণ্যটি পাওয়া যায়নি।');
        }
        Product::incrementViews((int)$p['id']);
        Analytics::record('product_views', 1);

        $crumbs = [['হোম', '/']];
        if ($p['category_slug']) {
            $crumbs[] = [$p['category_name'], '/category/' . $p['category_slug']];
        }
        $crumbs[] = [$p['name'], '/product/' . $p['slug']];
        $image = $p['meta_image'] ? absolute_url(upload_url($p['meta_image'])) : absolute_url(Product::primaryImage($p, 'lg'));
        $view = Tracking::event('ViewContent', [
            'content_ids' => [(string)$p['id']], 'content_type' => 'product', 'content_name' => $p['name'],
            'value' => (float)$p['price'], 'currency' => setting('currency', 'BDT'),
        ]);

        return View::page('pages/product', ['p' => $p, 'crumbs' => $crumbs], [
            'title'       => $p['seo_title'] ?: $p['name'],
            'description' => $p['seo_description'] ?: str_limit($p['short_description'] ?: (string)$p['description'], 160),
            'canonical'   => absolute_url('/product/' . $p['slug']),
            'image'       => $image,
            'type'        => 'product',
            'jsonld'      => [Seo::product($p), Seo::breadcrumbs($crumbs)],
            'styles'      => ['product'],
            'scripts'     => ['product'],
            'page'        => 'product',
            'nav'         => 'categories',
            'track'       => [$view],
        ]);
    }
}
