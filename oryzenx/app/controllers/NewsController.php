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
        $p = DB::paginate('p.id, p.title, p.slug, p.icon, p.excerpt, p.content, p.featured_image, p.published_at, p.views, p.likes, c.name AS cat_name, c.name_bn AS cat_name_bn,
            u.name AS author, u.role AS author_role, (SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.liker_hash = ' . DB::pdo()->quote(self::likerHash()) . ') AS liked',
            "FROM posts p LEFT JOIN post_categories c ON c.id = p.category_id LEFT JOIN users u ON u.id = p.author_id $where ORDER BY p.published_at DESC, p.id DESC", $params, input_int('page', 1), 10);
        View::page('pages/news', ['cats' => $cats, 'cat' => $cat, 'p' => $p], ['title' => t('news.title'), 'nav' => 'news', 'css' => ['news'], 'description' => t('news.meta'), 'cache' => false]);
    }

    public function show(string $id, ?string $slug = null): void
    {
        $post = DB::row("SELECT p.*, c.name AS cat_name, c.name_bn AS cat_name_bn, c.slug AS cat_slug, u.name AS author, u.role AS author_role FROM posts p
            LEFT JOIN post_categories c ON c.id = p.category_id LEFT JOIN users u ON u.id = p.author_id
            WHERE p.id = ? AND (p.status = 'published' AND p.published_at <= NOW()" . (Auth::isAdmin() ? " OR 1=1" : '') . ')', [(int)$id]);
        if (!$post) throw new HttpException(t('error.404'), 404);

        if (($_SERVER['HTTP_X_PREFETCH'] ?? '') !== '1' && !UA::isBot(user_agent())) {
            $ins = DB::q('INSERT IGNORE INTO post_views (post_id, visitor_hash) VALUES (?, ?)', [$post['id'], Crypto::visitorHash()]);
            if ($ins->rowCount() > 0) DB::q('UPDATE posts SET views = views + 1 WHERE id = ?', [$post['id']]);
        }
        $post['liked'] = (bool)DB::val('SELECT 1 FROM post_likes WHERE post_id = ? AND liker_hash = ?', [$post['id'], self::likerHash()]);
        $related = DB::all("SELECT id, title, icon, featured_image, published_at FROM posts WHERE status = 'published' AND published_at <= NOW() AND id <> ?
            ORDER BY (category_id <=> ?) DESC, published_at DESC LIMIT 4", [$post['id'], $post['category_id']]);
        $image = $post['featured_image'] ? abs_url(upload_url($post['featured_image'])) : null;
        View::page('pages/post', ['post' => $post, 'related' => $related, 'shareUrl' => abs_url(url('/news/' . $post['id']))], [
            'title' => $post['seo_title'] ?: $post['title'], 'nav' => 'news', 'css' => ['news'], 'type' => 'article',
            'description' => $post['seo_description'] ?: ($post['excerpt'] ?: str_limit($post['content'], 160)),
            'image' => $image, 'canonical' => '/news/' . $post['id'], 'page_key' => 'post', 'ref_id' => (int)$post['id'], 'cache' => false,
            'schema' => ['@context' => 'https://schema.org', '@type' => 'NewsArticle', 'headline' => $post['title'], 'datePublished' => date('c', strtotime((string)$post['published_at'])),
                'dateModified' => date('c', strtotime((string)($post['updated_at'] ?: $post['published_at']))), 'image' => $image ? [$image] : null,
                'author' => ['@type' => 'Organization', 'name' => setting('site_name')], 'publisher' => ['@type' => 'Organization', 'name' => setting('site_name')]],
        ]);
    }

    /** Logged-in users like by account; guests by a random first-party cookie (no IP stored). */
    private static function likerHash(): string
    {
        if ($uid = Auth::id()) return hash('sha256', 'u|' . $uid);
        $v = $_COOKIE['ozx_vid'] ?? '';
        if (!preg_match('/^[a-f0-9]{32}$/', $v)) {
            $v = bin2hex(random_bytes(16));
            setcookie('ozx_vid', $v, ['expires' => time() + 31536000 * 2, 'path' => base_path() ?: '/', 'secure' => is_https(), 'httponly' => true, 'samesite' => 'Lax']);
            $_COOKIE['ozx_vid'] = $v;
        }
        return hash('sha256', 'v|' . $v);
    }

    public function like(string $id): void
    {
        $postId = (int)$id;
        if (!DB::val("SELECT 1 FROM posts WHERE id = ? AND status = 'published'", [$postId])) throw new HttpException(t('error.404'), 404);
        if (!RateLimit::hit('like|' . client_ip(), 60, 600)) json_out(['ok' => false, 'message' => t('error.429')], 429);
        $h = self::likerHash();
        $liked = DB::tx(function () use ($postId, $h) {
            if (DB::q('DELETE FROM post_likes WHERE post_id = ? AND liker_hash = ?', [$postId, $h])->rowCount()) {
                DB::q('UPDATE posts SET likes = GREATEST(likes, 1) - 1 WHERE id = ?', [$postId]);
                return false;
            }
            DB::q('INSERT INTO post_likes (post_id, liker_hash) VALUES (?, ?)', [$postId, $h]);
            DB::q('UPDATE posts SET likes = likes + 1 WHERE id = ?', [$postId]);
            return true;
        });
        json_out(['ok' => true, 'liked' => $liked, 'count' => (int)DB::val('SELECT likes FROM posts WHERE id = ?', [$postId])]);
    }
}
