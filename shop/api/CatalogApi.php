<?php
final class CatalogApi
{
    public function search(): void
    {
        $q = mb_substr(trim(Request::query('q')), 0, 60);
        if (mb_strlen($q) < 2) {
            Response::ok(['items' => []]);
        }
        if (!RateLimiter::hit('search:' . Request::ip(), 90, 60)) {
            Response::fail('অনেক বেশি অনুরোধ।', [], 429);
        }
        $items = array_map([Product::class, 'card'], Product::search($q, 8));
        header('Cache-Control: public, max-age=60');
        echo json_encode(['success' => true, 'message' => '', 'data' => ['items' => $items, 'q' => $q], 'errors' => (object) [], 'redirect' => null], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    public function track(): void
    {
        $event = Request::str('event');
        if (!in_array($event, ['page_view', 'product_click', 'product_view'], true) || !RateLimiter::hit('track:' . Request::ip(), 300, 60)) {
            Response::ok();
        }
        $pid = Request::int('product_id') ?: null;
        $url = mb_substr(Request::str('url'), 0, 255);
        if ($event === 'product_view' && $pid) {
            DB::run('UPDATE products SET views = views + 1 WHERE id = ?', [$pid]);
        }
        Analytics::event($event, $pid, null, str_starts_with($url, '/') ? $url : null);
        Response::ok();
    }
}
