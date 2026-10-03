<?php
final class NewsController
{
    public function index(): void
    {
        $cats = DB::all('SELECT * FROM post_categories ORDER BY sort_order, id');
        $cat = (string)input('cat');
        $where = "WHERE p.status = 'published' AND p.published_at <= NOW()";
        $params = [];
        if ($cat !== '') { $where .= ' AND c.slug = ?'; $params[] = $cat; }
        $p = DB::paginate('p.id, p.title, p.slug, p.icon, p.excerpt, p.featured_image, p.published_at, p.views, c.name AS cat_name, c.name_bn AS cat_name_bn',
            "FROM posts p LEFT JOIN post_categories c ON c.id = p.category_id $where ORDER BY p.published_at DESC, p.id DESC", $params, input_int('page', 1), 12);
        View::page('pages/news', ['cats' => $cats, 'cat' => $cat, 'p' => $p], ['title' => t('news.title'), 'nav' => 'news', 'css' => ['news'], 'description' => t('news.meta')]);
    }

    public function show(string $id, ?string $slug = null): void
    {
        $post = DB::row("SELECT p.*, c.name AS cat_name, c.name_bn AS cat_name_bn, c.slug AS cat_slug, u.name AS author FROM posts p
            LEFT JOIN post_categories c ON c.id = p.category_id LEFT JOIN users u ON u.id = p.author_id
            WHERE p.id = ? AND (p.status = 'published' AND p.published_at <= NOW()" . (Auth::isAdmin() ? " OR 1=1" : '') . ')', [(int)$id]);
        if (!$post) throw new HttpException(t('error.404'), 404);

        if (($_SERVER['HTTP_X_PREFETCH'] ?? '') !== '1' && !UA::isBot(user_agent())) {
            $ins = DB::q('INSERT IGNORE INTO post_views (post_id, visitor_hash) VALUES (?, ?)', [$post['id'], Crypto::visitorHash()]);
            if ($ins->rowCount() > 0) DB::q('UPDATE posts SET views = views + 1 WHERE id = ?', [$post['id']]);
        }
        $related = DB::all("SELECT id, title, icon, featured_image, published_at FROM posts WHERE status = 'published' AND published_at <= NOW() AND id <> ?
            ORDER BY (category_id <=> ?) DESC, published_at DESC LIMIT 4", [$post['id'], $post['category_id']]);
        $image = $post['featured_image'] ? abs_url(upload_url($post['featured_image'])) : null;
        View::page('pages/post', ['post' => $post, 'related' => $related, 'shareUrl' => abs_url(url('/news/' . $post['id']))], [
            'title' => $post['seo_title'] ?: $post['title'], 'nav' => 'news', 'css' => ['news'], 'type' => 'article',
            'description' => $post['seo_description'] ?: ($post['excerpt'] ?: str_limit($post['content'], 160)),
            'image' => $image, 'canonical' => '/news/' . $post['id'], 'page_key' => 'post', 'ref_id' => (int)$post['id'],
            'schema' => ['@context' => 'https://schema.org', '@type' => 'NewsArticle', 'headline' => $post['title'], 'datePublished' => date('c', strtotime((string)$post['published_at'])),
                'dateModified' => date('c', strtotime((string)($post['updated_at'] ?: $post['published_at']))), 'image' => $image ? [$image] : null,
                'author' => ['@type' => 'Organization', 'name' => setting('site_name')], 'publisher' => ['@type' => 'Organization', 'name' => setting('site_name')]],
        ]);
    }
}
