<?php
/**
 * Product API: instant search suggestions and lazily-loaded related products.
 */
final class ProductsApi
{
    public function search(Request $r): Response
    {
        $q = mb_substr(trim(clean_text((string)$r->get('q', ''))), 0, 80);
        if (mb_strlen($q) < 2) {
            return Response::success('OK', ['items' => [], 'categories' => []]);
        }
        $items = array_map(static fn($p) => [
            'name'  => $p['name'],
            'url'   => Product::url($p),
            'image' => image_url($p['image_path'] ?: null, 'sm', $p['image_ext']),
            'price' => money($p['price']),
            'old'   => $p['discount_percent'] > 0 ? money($p['old_price']) : null,
        ], Product::suggest($q, 6));
        $cats = [];
        foreach (Category::activeWithCounts() as $c) {
            if (mb_stripos($c['name'], $q) !== false) {
                $cats[] = ['name' => $c['name'], 'url' => url('/category/' . $c['slug'])];
            }
            if (count($cats) >= 3) {
                break;
            }
        }
        return Response::success('OK', ['items' => $items, 'categories' => $cats, 'all' => url('/search', ['q' => $q])])
            ->withHeader('Cache-Control', 'public, max-age=60');
    }

    public function related(Request $r, string $id): Response
    {
        $p = Product::find((int)$id);
        if (!$p || $p['status'] !== 'active') {
            return Response::error('পণ্যটি পাওয়া যায়নি।', 404);
        }
        $html = '';
        foreach (Product::related($p, 8) as $item) {
            $html .= View::component('product-card', ['p' => $item]);
        }
        return Response::success('OK', ['html' => $html])->withHeader('Cache-Control', 'public, max-age=300');
    }
}
