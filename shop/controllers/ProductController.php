<?php
final class ProductController
{
    public static function perPage(): int
    {
        return max(4, min(60, (int) setting('products_per_page', 12)));
    }

    public function index(?array $category = null): void
    {
        $q = mb_substr(Request::query('q'), 0, 80);
        $sort = in_array(Request::query('sort'), ['new', 'price_asc', 'price_desc', 'popular'], true) ? Request::query('sort') : 'new';
        $page = max(1, (int) Request::query('page', '1'));
        $filter = Request::query('filter');
        $f = ['q' => $q, 'sort' => $sort, 'category_id' => $category['id'] ?? null,
            'flash' => $filter === 'flash', 'free' => $filter === 'free', 'featured' => $filter === 'featured'];
        [$items, $total] = Product::paginate($f, $page, self::perPage());
        $title = match (true) {
            $category !== null => $category['name'],
            $q !== '' => '"' . $q . '" এর ফলাফল',
            $filter === 'flash' => 'ফ্ল্যাশ সেল',
            $filter === 'free' => 'ফ্রি ডেলিভারি পণ্য',
            $filter === 'featured' => 'ফিচার্ড পণ্য',
            default => 'সকল পণ্য',
        };
        $meta = $category ? ['title' => $category['name'], 'description' => $category['name'] . ' — ' . setting('site_name')] : Seo::forPage('products', ['title' => $title]);
        $meta += ['page' => 'products', 'cacheable' => $q === '', 'nav' => $category ? 'categories' : 'products', 'robots' => $q !== '' ? 'noindex,follow' : null];
        if ($page > 1) {
            $meta['canonical'] = rtrim((string) (setting('canonical_base') ?: Config::get('url') ?: Request::origin()), '/') . Request::path() . '?page=' . $page;
        }
        $meta = array_filter($meta, static fn ($v) => $v !== null);
        View::page('pages/products', [
            'items' => $items, 'total' => $total, 'page' => $page, 'pages' => (int) ceil($total / self::perPage()),
            'q' => $q, 'sort' => $sort, 'filter' => $filter, 'category' => $category, 'heading' => $title,
            'categories' => Category::active(),
        ], $meta);
    }

    public function show(string $slug): void
    {
        $p = Product::findBySlug($slug);
        if (!$p) {
            Response::notFound();
        }
        $images = Product::images((int) $p['id']);
        if (($_SERVER['HTTP_X_PREFETCH'] ?? '') !== '1') {
            DB::run('UPDATE products SET views = views + 1 WHERE id = ?', [$p['id']]);
            Analytics::event('product_view', (int) $p['id']);
        }
        $eventId = 'vc-' . bin2hex(random_bytes(6));
        MetaCapi::queue('ViewContent', $eventId, ['currency' => 'BDT', 'value' => $p['effective_price'], 'content_ids' => [(string) $p['id']], 'content_type' => 'product', 'content_name' => $p['name']]);
        View::page('pages/product', [
            'p' => $p, 'images' => $images, 'related' => Product::related($p, 8), 'event_id' => $eventId,
        ], [
            'title' => $p['seo_title'] ?: $p['name'],
            'description' => $p['seo_description'] ?: ($p['short_description'] ?: strip_tags((string) $p['description'])),
            'keywords' => $p['seo_keywords'],
            'og_image' => $p['og_image'] ?: ($images[0]['path'] ?? null),
            'og_type' => 'product', 'page' => 'product', 'cacheable' => true, 'nav' => 'products',
            'jsonld' => [Seo::product($p, $images)],
        ]);
    }
}
